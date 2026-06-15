import { invoke } from '@tauri-apps/api/core';

export function readMcpPolicy(): Promise<string> {
  return invoke<string>('read_mcp_policy');
}

export function writeMcpPolicy(content: string): Promise<void> {
  return invoke<void>('write_mcp_policy', { content });
}

export function readMcpAudit(): Promise<string> {
  return invoke<string>('read_mcp_audit');
}
