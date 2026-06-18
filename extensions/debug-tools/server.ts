// 本地运行时日志收集器：一个仅监听 127.0.0.1 的 HTTP server，被调试程序把诊断
// 数据 POST 到 /log，收集后交给回调（落内存 + 落盘）。对标 Cursor Debug Mode 的
// "spins up a server to capture logs"。单例生命周期由 debug_log 工具的 start/stop 管理。

import { createServer, type Server } from "node:http";

export interface LogServerHandlers {
  onLog: (entry: { tag?: unknown; data?: unknown }) => void;
}

// 单条日志体上限，防止被调试程序误发超大 payload 撑爆内存。
const MAX_BODY_BYTES = 1_000_000;

function corsHeaders(): Record<string, string> {
  // 被调试的本地前端（浏览器）也可能发日志；server 只在回环地址，放开 CORS 无额外风险。
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

// 是否回环 Host。listen 已绑定 127.0.0.1，再校验 Host 头可挡 DNS rebinding
// （恶意页面把自有域名解析到 127.0.0.1，借浏览器向本机收集器投递日志）。
function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  const hostname = host.startsWith("[") ? host.slice(1, host.indexOf("]")) : host.split(":")[0];
  const h = hostname.trim().toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1";
}

export class LogServer {
  private server: Server | undefined;
  private boundPort: number | undefined;

  get port(): number | undefined {
    return this.boundPort;
  }

  get running(): boolean {
    return this.server !== undefined;
  }

  /** 起 server（已运行则复用，返回现有端口）。listen(0) 让 OS 分配空闲端口。 */
  start(handlers: LogServerHandlers): Promise<number> {
    if (this.server && this.boundPort !== undefined) return Promise.resolve(this.boundPort);
    return new Promise<number>((resolve, reject) => {
      const server = createServer((req, res) => {
        // 仅接受回环 Host，挡 DNS rebinding；合法被调试程序 POST 到 127.0.0.1/localhost 不受影响。
        if (!isLoopbackHost(req.headers.host)) {
          res.writeHead(403, corsHeaders());
          res.end();
          return;
        }
        if (req.method === "OPTIONS") {
          res.writeHead(204, corsHeaders());
          res.end();
          return;
        }
        if (req.method === "GET" && req.url === "/health") {
          res.writeHead(200, corsHeaders());
          res.end("ok");
          return;
        }
        if (req.method === "POST" && req.url === "/log") {
          let body = "";
          let tooLarge = false;
          req.on("data", (chunk: Buffer | string) => {
            body += chunk;
            if (body.length > MAX_BODY_BYTES) {
              tooLarge = true;
              req.destroy();
            }
          });
          req.on("end", () => {
            if (tooLarge) return;
            try {
              const parsed = JSON.parse(body) as { tag?: unknown; data?: unknown };
              handlers.onLog({ tag: parsed?.tag, data: parsed?.data });
            } catch {
              // 非 JSON：原样作为 data 收下，避免丢失。
              handlers.onLog({ tag: "raw", data: body });
            }
            res.writeHead(204, corsHeaders());
            res.end();
          });
          return;
        }
        res.writeHead(404, corsHeaders());
        res.end();
      });
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        const port = typeof addr === "object" && addr !== null ? addr.port : 0;
        this.server = server;
        this.boundPort = port;
        server.removeListener("error", reject);
        resolve(port);
      });
    });
  }

  stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    this.boundPort = undefined;
    if (!server) return Promise.resolve();
    return new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
