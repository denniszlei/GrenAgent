import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { JsonRpcConnection } from "../_shared/jsonrpc-stdio.js";
import { type LspPosition, pathToUri, toLspPosition, uriToPath } from "./convert.js";
import type { ServerSpec } from "./servers.js";

interface Diagnostic {
  range?: { start?: LspPosition };
  severity?: number;
  message?: string;
  source?: string;
}

// 单个语言服务器的连接：spawn、initialize 握手、文档同步、查询封装。按 (root, language) 复用。
export class LspClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly conn: JsonRpcConnection;
  private readonly initialized: Promise<void>;
  private readonly opened = new Set<string>();
  private readonly diagnostics = new Map<string, Diagnostic[]>();

  constructor(
    private readonly spec: ServerSpec,
    private readonly root: string,
  ) {
    this.child = spawn(spec.cmd, spec.args, {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams;
    this.conn = new JsonRpcConnection(this.child.stdin);
    this.child.stdout.on("data", (chunk: Buffer) => this.conn.feed(chunk));
    this.child.on("exit", () => this.conn.rejectAll(new Error(`${this.spec.cmd} 已退出`)));
    this.child.on("error", () => this.conn.rejectAll(new Error(`${this.spec.cmd} 启动失败`)));
    this.conn.onNotification("textDocument/publishDiagnostics", (params) => {
      const p = params as { uri?: string; diagnostics?: Diagnostic[] };
      if (p?.uri) this.diagnostics.set(p.uri, p.diagnostics ?? []);
    });
    this.initialized = this.doInitialize();
  }

  private async doInitialize(): Promise<void> {
    await this.conn.request("initialize", {
      processId: process.pid,
      rootUri: pathToUri(this.root),
      workspaceFolders: [{ uri: pathToUri(this.root), name: "root" }],
      capabilities: {
        textDocument: {
          synchronization: { dynamicRegistration: false },
          publishDiagnostics: {},
          definition: {},
          references: {},
          hover: { contentFormat: ["markdown", "plaintext"] },
          documentSymbol: { hierarchicalDocumentSymbolSupport: true },
        },
      },
    });
    this.conn.notify("initialized", {});
  }

  private async ensureOpen(absPath: string): Promise<string> {
    await this.initialized;
    const uri = pathToUri(absPath);
    const text = readFileSync(absPath, "utf8");
    if (this.opened.has(uri)) {
      this.conn.notify("textDocument/didChange", {
        textDocument: { uri, version: Date.now() },
        contentChanges: [{ text }],
      });
    } else {
      this.conn.notify("textDocument/didOpen", {
        textDocument: { uri, languageId: this.spec.language, version: 1, text },
      });
      this.opened.add(uri);
    }
    return uri;
  }

  async definition(absPath: string, line: number, column: number): Promise<unknown> {
    const uri = await this.ensureOpen(absPath);
    return this.conn.request("textDocument/definition", {
      textDocument: { uri },
      position: toLspPosition(line, column),
    });
  }

  async references(absPath: string, line: number, column: number): Promise<unknown> {
    const uri = await this.ensureOpen(absPath);
    return this.conn.request("textDocument/references", {
      textDocument: { uri },
      position: toLspPosition(line, column),
      context: { includeDeclaration: true },
    });
  }

  async hover(absPath: string, line: number, column: number): Promise<unknown> {
    const uri = await this.ensureOpen(absPath);
    return this.conn.request("textDocument/hover", {
      textDocument: { uri },
      position: toLspPosition(line, column),
    });
  }

  async documentSymbols(absPath: string): Promise<unknown> {
    const uri = await this.ensureOpen(absPath);
    return this.conn.request("textDocument/documentSymbol", { textDocument: { uri } });
  }

  // 诊断由服务器异步推送（publishDiagnostics）；打开后稍等再读最新值。
  async diagnosticsFor(absPath: string, waitMs = 1500): Promise<Diagnostic[]> {
    const uri = await this.ensureOpen(absPath);
    await new Promise((r) => setTimeout(r, waitMs));
    return this.diagnostics.get(uri) ?? [];
  }

  dispose(): void {
    try {
      this.conn.notify("exit", undefined);
      if (process.platform === "win32" && this.child.pid) {
        spawn("taskkill", ["/F", "/T", "/PID", String(this.child.pid)], { stdio: "ignore" });
      } else {
        this.child.kill("SIGKILL");
      }
    } catch {
      /* already gone */
    }
  }
}

export { uriToPath };
