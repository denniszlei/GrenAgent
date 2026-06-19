import { describe, expect, it, vi } from "vitest";
import { WslSandbox } from "./wsl.js";

function fakeRun() {
  const calls: Array<{ file: string; args: string[] }> = [];
  const run = vi.fn(async (file: string, args: string[]) => {
    calls.push({ file, args });
    return { stdout: "ok", stderr: "", code: 0 };
  });
  return { run, calls };
}

describe("WslSandbox.exec", () => {
  it("builds wsl + srt argv with cwd mapped and a settings file", async () => {
    const { run, calls } = fakeRun();
    const sbx = new WslSandbox({ distro: "Ubuntu", run, writeSettings: async () => "/tmp/s.json" });
    const r = await sbx.exec("echo hi", { cwd: "D:\\proj" });
    expect(r).toEqual({ stdout: "ok", stderr: "", code: 0 });
    expect(calls[0].file).toBe("wsl.exe");
    expect(calls[0].args).toEqual([
      "-d",
      "Ubuntu",
      "--cd",
      "/mnt/d/proj",
      "--",
      "srt",
      "--settings",
      "/tmp/s.json",
      "bash",
      "-lc",
      "echo hi",
    ]);
  });

  it("passes the timeout through to run", async () => {
    const { run, calls } = fakeRun();
    void calls;
    const sbx = new WslSandbox({ distro: "Ubuntu", run, writeSettings: async () => "/tmp/s.json" });
    await sbx.exec("sleep 1", { cwd: "D:\\proj", timeoutMs: 5000 });
    expect(run).toHaveBeenCalledWith("wsl.exe", expect.any(Array), 5000);
  });
});
