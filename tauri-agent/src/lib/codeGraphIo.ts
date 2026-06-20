import { invoke } from '@tauri-apps/api/core';

export interface FileGraphNode {
  path: string;
  language: string;
  nodeCount: number;
}

export interface FileGraphEdge {
  source: string;
  target: string;
  weight: number;
}

export interface FileGraph {
  nodes: FileGraphNode[];
  edges: FileGraphEdge[];
}

/** 文件依赖图：只读 .codegraph/codegraph.db，按文件归并 import 边。 */
export function getFileGraph(workspace: string, limit?: number): Promise<FileGraph> {
  return invoke<FileGraph>('code_intel_file_graph', { workspace, limit: limit ?? null });
}
