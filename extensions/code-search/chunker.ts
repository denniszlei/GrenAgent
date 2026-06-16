export interface Chunk {
  startLine: number;
  endLine: number;
  text: string;
}

/** Split text into fixed line-window chunks; skips windows that are only whitespace. */
export function chunkText(text: string, linesPerChunk: number): Chunk[] {
  const lines = text.split(/\r?\n/);
  const size = Math.max(1, linesPerChunk);
  const chunks: Chunk[] = [];
  for (let i = 0; i < lines.length; i += size) {
    const slice = lines.slice(i, i + size);
    if (slice.join("").trim().length === 0) continue;
    chunks.push({ startLine: i + 1, endLine: Math.min(i + size, lines.length), text: slice.join("\n") });
  }
  return chunks;
}
