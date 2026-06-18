use std::path::{Path, PathBuf};

use rusqlite::{Connection, OpenFlags};
use serde::Serialize;

use crate::commands::sessions::resolve_workspace_dir;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KbStats {
    pub chunks: i64,
    pub sources: i64,
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KbSource {
    pub source: String,
    pub chunks: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KbChunk {
    pub id: String,
    pub text: String,
}

/// 只读打开一个 sqlite 文件；文件不存在时返回 None（上层据此返回空/零值）。
pub(crate) fn open_readonly(path: &Path) -> Result<Option<Connection>, String> {
    if !path.exists() {
        return Ok(None);
    }
    Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map(Some)
        .map_err(|e| e.to_string())
}

fn kb_db_path(workspace: &str) -> Result<PathBuf, String> {
    let cwd = resolve_workspace_dir(workspace)?;
    Ok(cwd.join(".pi").join("knowledge").join("default.db"))
}

fn read_kb_stats(path: &Path) -> Result<KbStats, String> {
    let Some(conn) = open_readonly(path)? else {
        return Ok(KbStats {
            chunks: 0,
            sources: 0,
            model: None,
        });
    };
    let chunks: i64 = conn
        .query_row("SELECT COUNT(*) FROM chunks", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let sources: i64 = conn
        .query_row("SELECT COUNT(DISTINCT source) FROM chunks", [], |r| {
            r.get(0)
        })
        .map_err(|e| e.to_string())?;
    // model 行可能不存在（keyword 模式）；用 .ok() 容忍。
    let model: Option<String> = conn
        .query_row("SELECT value FROM meta WHERE key = 'model'", [], |r| {
            r.get(0)
        })
        .ok();
    Ok(KbStats {
        chunks,
        sources,
        model,
    })
}

fn read_kb_sources(path: &Path) -> Result<Vec<KbSource>, String> {
    let Some(conn) = open_readonly(path)? else {
        return Ok(vec![]);
    };
    let mut stmt = conn
        .prepare("SELECT source, COUNT(*) AS n FROM chunks GROUP BY source ORDER BY source")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(KbSource {
                source: r.get(0)?,
                chunks: r.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn read_kb_chunks(path: &Path, source: &str) -> Result<Vec<KbChunk>, String> {
    let Some(conn) = open_readonly(path)? else {
        return Ok(vec![]);
    };
    let mut stmt = conn
        .prepare("SELECT id, text FROM chunks WHERE source = ?1 ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([source], |r| {
            Ok(KbChunk {
                id: r.get(0)?,
                text: r.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command]
pub fn kb_stats(workspace: String) -> Result<KbStats, String> {
    read_kb_stats(&kb_db_path(&workspace)?)
}

#[tauri::command]
pub fn kb_sources(workspace: String) -> Result<Vec<KbSource>, String> {
    read_kb_sources(&kb_db_path(&workspace)?)
}

#[tauri::command]
pub fn kb_chunks(workspace: String, source: String) -> Result<Vec<KbChunk>, String> {
    read_kb_chunks(&kb_db_path(&workspace)?, &source)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn make_kb(path: &Path) {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch(
            "CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
             CREATE TABLE chunks(id TEXT PRIMARY KEY, source TEXT NOT NULL, text TEXT NOT NULL, embedding BLOB);
             INSERT INTO meta(key,value) VALUES('model','test-model');
             INSERT INTO chunks(id,source,text,embedding) VALUES('c1','a.md','hello',NULL);
             INSERT INTO chunks(id,source,text,embedding) VALUES('c2','a.md','world',NULL);
             INSERT INTO chunks(id,source,text,embedding) VALUES('c3','b.md','foo',NULL);",
        )
        .unwrap();
    }

    fn tmp_db() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("kbtest-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join("default.db")
    }

    #[test]
    fn stats_counts_chunks_sources_model() {
        let db = tmp_db();
        make_kb(&db);
        let s = read_kb_stats(&db).unwrap();
        assert_eq!(s.chunks, 3);
        assert_eq!(s.sources, 2);
        assert_eq!(s.model.as_deref(), Some("test-model"));
        std::fs::remove_dir_all(db.parent().unwrap()).ok();
    }

    #[test]
    fn missing_db_returns_zero() {
        let s = read_kb_stats(Path::new("/no/such/default.db")).unwrap();
        assert_eq!(s.chunks, 0);
        assert_eq!(s.sources, 0);
        assert!(s.model.is_none());
    }

    #[test]
    fn sources_grouped_and_chunks_by_source() {
        let db = tmp_db();
        make_kb(&db);
        let srcs = read_kb_sources(&db).unwrap();
        assert_eq!(srcs.len(), 2);
        assert_eq!(srcs[0].source, "a.md");
        assert_eq!(srcs[0].chunks, 2);
        let chunks = read_kb_chunks(&db, "a.md").unwrap();
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].id, "c1");
        std::fs::remove_dir_all(db.parent().unwrap()).ok();
    }
}
