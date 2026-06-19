import type { SandboxAdapter, SandboxResult, SandboxSpec } from "./types.js";

export class NoopSandbox implements SandboxAdapter {
  async isAvailable(): Promise<boolean> {
    return false;
  }
  async exec(_command: string, _spec: SandboxSpec): Promise<SandboxResult> {
    throw new Error(
      "沙箱不可用（NoopSandbox）：消费者应在 isAvailable() 为 false 时走降级路径，而非调用 exec",
    );
  }
}
