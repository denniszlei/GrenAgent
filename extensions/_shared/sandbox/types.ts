// 统一沙箱契约：消费者只依赖这里，不关心 WSL/srt 细节。
export interface SandboxSpec {
  /** Windows workspace 绝对路径（如 D:\proj）。 */
  cwd: string;
  /** 可写根（Windows 路径）；默认 [cwd]。 */
  writableRoots?: string[];
  /** 网络：默认 "none"（全拒）。 */
  network?: "none" | { allowDomains: string[] };
  /** 执行超时（ms）。 */
  timeoutMs?: number;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface SandboxAdapter {
  isAvailable(): Promise<boolean>;
  exec(command: string, spec: SandboxSpec): Promise<SandboxResult>;
}
