// mcp: connect external MCP servers (stdio / SSE) and expose their tools to the
// agent as `mcp__<server>__<tool>`. Connections live for the sidecar process.
//
// Loading is ASYNC: the factory returns immediately and connections run in the
// background (started on the first session_start, so the runtime is bound and the
// UI is up). Each server connects in parallel; on success its tools are registered
// dynamically (pi.registerTool internally refreshes the tool registry) and then
// activated via setActiveTools. Status (connecting → connected/failed) is pushed
// live to the GUI. This keeps app startup instant instead of blocking on MCP.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Type } from "typebox";
import { type McpServerConfig, parseMcpServers, sanitize } from "./config.js";

const MCP_TIMEOUT_MS = Number(process.env.MCP_TIMEOUT_MS ?? "15000") || 15000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_resolve, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)),
  ]);
}

async function connect(s: McpServerConfig): Promise<Client> {
  const client = new Client({ name: "grenagent", version: "0.1.0" });
  const transport =
    s.transport === "sse"
      ? new SSEClientTransport(new URL(s.url ?? ""))
      : new StdioClientTransport({
          command: s.command ?? "",
          args: s.args ?? [],
          env: { ...(process.env as Record<string, string>), ...(s.env ?? {}) },
        });
  try {
    await withTimeout(client.connect(transport), MCP_TIMEOUT_MS);
  } catch (e) {
    // Close on failure so a slow/failed stdio transport doesn't leak its child process.
    await client.close().catch(() => {});
    throw e;
  }
  return client;
}

type McpStatus = "connecting" | "connected" | "failed";

export default function (pi: ExtensionAPI) {
  const servers = parseMcpServers(process.env.MCP_SERVERS ?? "");
  if (servers.length === 0) return;

  const clients: Client[] = [];
  const registry = new Map<string, { status: McpStatus; tools: number; error?: string }>();
  for (const s of servers) registry.set(s.name, { status: "connecting", tools: 0 });

  // Bound to the latest session_start ctx.ui so background connects can push live status.
  let pushStatus: (() => void) | undefined;
  const summary = () =>
    servers.map((s) => ({
      name: s.name,
      transport: s.transport,
      status: registry.get(s.name)?.status ?? "failed",
      tools: registry.get(s.name)?.tools ?? 0,
    }));

  const connectServer = async (s: McpServerConfig): Promise<void> => {
    try {
      const client = await connect(s);
      clients.push(client);
      const { tools } = await withTimeout(client.listTools(), MCP_TIMEOUT_MS);
      const newNames: string[] = [];
      for (const t of tools) {
        const name = `mcp__${sanitize(s.name)}__${sanitize(t.name)}`;
        pi.registerTool({
          name,
          label: `${s.name}: ${t.name}`,
          description: t.description ?? `MCP tool "${t.name}" from server "${s.name}".`,
          parameters: Type.Unsafe(t.inputSchema ?? { type: "object" }),
          async execute(_toolCallId, params) {
            const r = await client.callTool({
              name: t.name,
              arguments: (params ?? {}) as Record<string, unknown>,
            });
            const blocks = Array.isArray(r.content) ? r.content : [];
            const text =
              blocks
                .filter((b): b is { type: "text"; text: string } => !!b && (b as { type?: string }).type === "text")
                .map((b) => b.text)
                .join("\n") || "(no output)";
            return { content: [{ type: "text", text }], details: { server: s.name, tool: t.name } };
          },
        });
        newNames.push(name);
      }
      // registerTool() refreshed the tool registry; now activate the new tools so
      // the agent can call them this turn (matches the old sync behavior).
      if (newNames.length) {
        try {
          const active = pi.getActiveTools();
          pi.setActiveTools([...new Set([...active, ...newNames])]);
        } catch {
          // Active-tool plumbing not ready yet; tools stay registered and become callable later.
        }
      }
      registry.set(s.name, { status: "connected", tools: tools.length });
      console.error(`[mcp] connected "${s.name}" (${s.transport}); ${tools.length} tools registered`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      registry.set(s.name, { status: "failed", tools: 0, error: msg });
      console.error(`[mcp] failed to connect "${s.name}": ${msg}`);
    }
    pushStatus?.();
  };

  // Push status on every session_start (a freshly-mounted front-end picks up current
  // status), and kick off the background connect exactly once (after the first bind).
  let started = false;
  pi.on("session_start", async (_event, ctx) => {
    if (ctx.hasUI) {
      pushStatus = () => {
        try {
          ctx.ui.setStatus("mcp", JSON.stringify(summary()));
        } catch {
          // Stale ctx after session replacement; the next session_start rebinds pushStatus.
        }
      };
      pushStatus();
    }
    if (started) return;
    started = true;
    void Promise.all(servers.map(connectServer));
  });

  const cleanup = () => {
    for (const c of clients) void c.close().catch(() => {});
  };
  process.on("exit", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
}
