import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "../_shared/sqlite.js";
import { decodeVector, encodeVector } from "../_shared/vector-store.js";

export interface ChunkRow {
  file: string;
  startLine: number;
  endLine: number;
  mtime: number;
  text: string;
  vector: number[];
}

export class CodeIndex {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS chunks (file TEXT, start_line INTEGER, end_line INTEGER, mtime INTEGER, text TEXT, embedding BLOB)",
    );
    this.db.exec("CREATE INDEX IF NOT EXISTS chunks_file_idx ON chunks(file)");
  }

  /** Latest indexed mtime for a file, or undefined if not indexed. */
  mtimeOf(file: string): number | undefined {
    const row = this.db.prepare("SELECT MAX(mtime) AS m FROM chunks WHERE file = ?").get(file) as
      | { m: number | null }
      | undefined;
    return row?.m ?? undefined;
  }

  /** Replace all chunks for a file with a fresh set. */
  replaceFile(
    file: string,
    mtime: number,
    rows: Array<{ startLine: number; endLine: number; text: string; vector: number[] }>,
  ): void {
    this.db.prepare("DELETE FROM chunks WHERE file = ?").run(file);
    const ins = this.db.prepare(
      "INSERT INTO chunks (file, start_line, end_line, mtime, text, embedding) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const r of rows) ins.run(file, r.startLine, r.endLine, mtime, r.text, encodeVector(r.vector));
  }

  all(): ChunkRow[] {
    const rows = this.db.prepare("SELECT file, start_line, end_line, mtime, text, embedding FROM chunks").all() as Array<{
      file: string;
      start_line: number;
      end_line: number;
      mtime: number;
      text: string;
      embedding: Uint8Array;
    }>;
    return rows.map((r) => ({
      file: r.file,
      startLine: r.start_line,
      endLine: r.end_line,
      mtime: r.mtime,
      text: r.text,
      vector: decodeVector(r.embedding),
    }));
  }

  close(): void {
    this.db.close();
  }
}
