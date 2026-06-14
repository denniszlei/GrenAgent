import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "../_shared/sqlite.js";

export interface Checkpoint {
  id: string;
  hash: string;
  label: string;
  kind: string;
  files: string; // JSON-encoded FileChange[]
  createdAt: number;
}

interface Row {
  id: string;
  hash: string;
  label: string;
  kind: string;
  files: string;
  createdAt: number;
}

export class CheckpointStore {
  private db: DatabaseSync | undefined;
  constructor(private readonly file: string) {}

  load(): void {
    if (this.db) return;
    mkdirSync(dirname(this.file), { recursive: true });
    this.db = new DatabaseSync(this.file);
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS checkpoints (
         id TEXT PRIMARY KEY,
         hash TEXT NOT NULL,
         label TEXT,
         kind TEXT NOT NULL,
         files TEXT,
         createdAt INTEGER NOT NULL
       );
       CREATE INDEX IF NOT EXISTS idx_cp_created ON checkpoints(createdAt);`,
    );
  }

  close(): void {
    this.db?.close();
    this.db = undefined;
  }

  private get database(): DatabaseSync {
    if (!this.db) this.load();
    return this.db as DatabaseSync;
  }

  add(input: { hash: string; label: string; kind: string; files: string }): { id: string } {
    const id = randomBytes(6).toString("hex");
    this.database
      .prepare("INSERT INTO checkpoints(id, hash, label, kind, files, createdAt) VALUES(?, ?, ?, ?, ?, ?)")
      .run(id, input.hash, input.label, input.kind, input.files, Date.now());
    return { id };
  }

  list(limit = 200): Checkpoint[] {
    return this.database
      .prepare("SELECT id, hash, label, kind, files, createdAt FROM checkpoints ORDER BY createdAt DESC LIMIT ?")
      .all(limit) as unknown as Row[];
  }

  getById(id: string): Checkpoint | undefined {
    return this.database
      .prepare("SELECT id, hash, label, kind, files, createdAt FROM checkpoints WHERE id = ?")
      .get(id) as Row | undefined;
  }

  clear(): void {
    this.database.exec("DELETE FROM checkpoints;");
  }
}
