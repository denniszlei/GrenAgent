// 调试适配器探测。一期仅 Python(debugpy)；Go(dlv dap)/native(lldb-dap) 列二期。
import { spawnSync } from "node:child_process";

export interface AdapterSpec {
  language: string;
  cmd: string;
  args: string[];
  adapterId: string;
}

// 探测可用且装有 debugpy 的解释器，返回其 adapter spec；不可用返回 undefined。
export function detectPythonAdapter(): AdapterSpec | undefined {
  const candidates = process.platform === "win32" ? ["py", "python", "python3"] : ["python3", "python"];
  for (const cmd of candidates) {
    try {
      const probe = cmd === "py" ? ["-3", "-c", "import debugpy"] : ["-c", "import debugpy"];
      const r = spawnSync(cmd, probe, { stdio: "ignore", timeout: 5000 });
      if (!r.error && r.status === 0) {
        const base = cmd === "py" ? ["-3"] : [];
        return { language: "python", cmd, args: [...base, "-m", "debugpy.adapter"], adapterId: "debugpy" };
      }
    } catch {
      /* try next */
    }
  }
  return undefined;
}
