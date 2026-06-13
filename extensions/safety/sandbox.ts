export interface SandboxAdapter {
  isEnabled(): boolean;
  // 预留：future 接 @anthropic-ai/sandbox-runtime / gondolin
  exec?(command: string): Promise<{ stdout: string; stderr: string; code: number }>;
}

export class NoopSandbox implements SandboxAdapter {
  isEnabled() {
    return false;
  }
}
