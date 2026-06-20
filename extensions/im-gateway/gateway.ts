// A tiny platform-agnostic webhook gateway (node:http, zero deps).
// POST /message { text, replyUrl? }  (optional Bearer token) -> onMessage
// GET  /health -> { ok: true }
// IM platform adapters (Slack/Feishu/...) forward their events here.

import { createServer, type Server } from "node:http";

export interface IncomingMessage {
  text: string;
  replyUrl?: string;
  meta?: unknown;
}

export interface GatewayOptions {
  port: number;
  /** Bind address. Defaults to 127.0.0.1 (loopback) so the gateway isn't exposed by accident. */
  host?: string;
  token?: string;
  onMessage: (msg: IncomingMessage) => void;
}

export interface GatewayHandle {
  server: Server;
  port: number;
  close: () => Promise<void>;
}

export function startGateway(opts: GatewayOptions): Promise<GatewayHandle> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = req.url ?? "/";
      const json = (code: number, body: unknown) => {
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };

      if (req.method === "GET" && url.startsWith("/health")) {
        json(200, { ok: true });
        return;
      }

      if (req.method === "POST" && url.startsWith("/message")) {
        if (opts.token && req.headers.authorization !== `Bearer ${opts.token}`) {
          json(401, { error: "unauthorized" });
          return;
        }
        let body = "";
        req.on("data", (c) => {
          body += c;
          if (body.length > 1_000_000) req.destroy();
        });
        req.on("end", () => {
          let data: { text?: string; replyUrl?: string; meta?: unknown };
          try {
            data = JSON.parse(body || "{}");
          } catch {
            json(400, { error: "invalid json" });
            return;
          }
          if (!data.text || !data.text.trim()) {
            json(400, { error: "missing text" });
            return;
          }
          opts.onMessage({ text: data.text.trim(), replyUrl: data.replyUrl, meta: data.meta });
          json(202, { ok: true });
        });
        return;
      }

      json(404, { error: "not found" });
    });

    server.on("error", reject);
    server.listen(opts.port, opts.host ?? "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : opts.port;
      resolve({
        server,
        port,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

export async function postReply(replyUrl: string, text: string, signal?: AbortSignal): Promise<void> {
  await fetch(replyUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  }).catch(() => {});
}
