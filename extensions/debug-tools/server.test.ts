import { afterEach, describe, expect, it } from "vitest";
import { LogServer } from "./server.js";

let active: LogServer | undefined;
afterEach(async () => {
  await active?.stop();
  active = undefined;
});

describe("LogServer", () => {
  it("captures POSTed JSON logs via the bound port", async () => {
    const got: Array<{ tag?: unknown; data?: unknown }> = [];
    const server = new LogServer();
    active = server;
    const port = await server.start({ onLog: (e) => got.push(e) });
    expect(server.running).toBe(true);
    expect(port).toBeGreaterThan(0);

    const res = await fetch(`http://127.0.0.1:${port}/log`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tag: "hypo1", data: { count: 7 } }),
    });
    expect(res.status).toBe(204);
    expect(got).toHaveLength(1);
    expect(got[0].tag).toBe("hypo1");
    expect(got[0].data).toEqual({ count: 7 });
  });

  it("falls back to raw data for non-JSON bodies", async () => {
    const got: Array<{ tag?: unknown; data?: unknown }> = [];
    const server = new LogServer();
    active = server;
    const port = await server.start({ onLog: (e) => got.push(e) });
    await fetch(`http://127.0.0.1:${port}/log`, { method: "POST", body: "not-json" });
    expect(got[0].tag).toBe("raw");
    expect(got[0].data).toBe("not-json");
  });

  it("reuses the same port when started twice", async () => {
    const server = new LogServer();
    active = server;
    const p1 = await server.start({ onLog: () => {} });
    const p2 = await server.start({ onLog: () => {} });
    expect(p2).toBe(p1);
  });

  it("answers health checks and stops cleanly", async () => {
    const server = new LogServer();
    active = server;
    const port = await server.start({ onLog: () => {} });
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);
    await server.stop();
    expect(server.running).toBe(false);
    expect(server.port).toBeUndefined();
  });
});
