// One-shot CodeGraph CLI invocations backing the Code Intelligence management UI
// (status / init / sync / reindex) plus an init-state probe.
//
// CodeGraph ships as a directory bundle (a vendored Node runtime + lib/dist + a
// bin launcher), NOT a single-file binary, so it cannot be a tauri externalBin
// sidecar. build-codegraph.mjs places it under src-tauri/binaries/codegraph and
// tauri.conf.json ships it via `bundle.resources`. We resolve the bundle dir
// (packaged resource first, dev binaries/ fallback) and run the platform
// launcher directly:
//   unix : <dir>/bin/codegraph <args>
//   win32: <dir>/node.exe --liftoff-only <dir>/lib/dist/bin/codegraph.js <args>
// (Windows cannot spawn the bundle's .cmd directly — CVE-2024-27980 hardening —
//  so we invoke the bundled node.exe against the app entry; --liftoff-only also
//  keeps tree-sitter's WASM grammars off V8's turboshaft tier to avoid an OOM.)
use std::path::{Path, PathBuf};
use tauri::Manager;

/// Resolve the CodeGraph bundle directory: packaged resource first (prod),
/// then the dev build output (src-tauri/binaries/codegraph).
fn codegraph_dir(app: &tauri::AppHandle) -> PathBuf {
    if let Ok(p) = app
        .path()
        .resolve("binaries/codegraph", tauri::path::BaseDirectory::Resource)
    {
        if p.is_dir() {
            return p;
        }
    }
    crate::pi::sidecar::pi_package_dir().join("codegraph")
}

/// (program, leading-args) for the bundled launcher on this platform.
fn launcher(dir: &Path) -> (PathBuf, Vec<String>) {
    if cfg!(windows) {
        (
            dir.join("node.exe"),
            vec![
                "--liftoff-only".to_string(),
                // 相对入口（解析自 cwd = bundle dir，见 run_codegraph）。绝对入口若含空格
                // （如 "D:\\OneDrive\\Project Files\\..."），codegraph 在非 TTY / piped 下用
                // child_process 拉起索引 worker 时会在空格处截断入口，报
                // "Cannot find module 'D:\\OneDrive\\Project'" / lstat 'D:'。相对入口规避。
                "lib/dist/bin/codegraph.js".to_string(),
            ],
        )
    } else {
        (dir.join("bin").join("codegraph"), Vec::new())
    }
}

async fn run_codegraph(app: &tauri::AppHandle, args: &[&str]) -> Result<String, String> {
    let dir = codegraph_dir(app);
    let (program, mut full_args) = launcher(&dir);
    full_args.extend(args.iter().map(|s| s.to_string()));
    // cwd = bundle dir（不是 workspace）：win32 相对入口据此解析，且让 codegraph 的索引
    // worker 子进程以无空格的相对入口启动。workspace 始终经命令行参数显式传入
    // （init/status/sync/index <workspace>），不依赖 cwd。
    let output = tokio::process::Command::new(&program)
        .args(&full_args)
        .current_dir(&dir)
        .output()
        .await
        .map_err(|e| format!("codegraph spawn failed ({}): {e}", program.display()))?;
    if !output.status.success() {
        return Err(format!(
            "codegraph {:?} exited ({:?}): {}",
            args,
            output.status.code(),
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Index status + statistics (`codegraph status <ws>`), human-readable text.
#[tauri::command]
pub async fn code_intel_status(app: tauri::AppHandle, workspace: String) -> Result<String, String> {
    run_codegraph(&app, &["status", workspace.as_str()]).await
}

/// Initialize CodeGraph and build the initial index (`codegraph init <ws>`).
/// Idempotent: re-running on an initialized project is a no-op/refresh upstream.
#[tauri::command]
pub async fn code_intel_init(app: tauri::AppHandle, workspace: String) -> Result<String, String> {
    run_codegraph(&app, &["init", workspace.as_str()]).await
}

/// Incremental sync since last index (`codegraph sync <ws>`).
#[tauri::command]
pub async fn code_intel_sync(app: tauri::AppHandle, workspace: String) -> Result<String, String> {
    run_codegraph(&app, &["sync", workspace.as_str()]).await
}

/// Full rebuild (`codegraph index -f <ws>`).
#[tauri::command]
pub async fn code_intel_reindex(
    app: tauri::AppHandle,
    workspace: String,
) -> Result<String, String> {
    run_codegraph(&app, &["index", "-f", workspace.as_str()]).await
}

/// Whether the workspace already has an index (presence of `.codegraph/`).
#[tauri::command]
pub async fn code_intel_is_initialized(workspace: String) -> Result<bool, String> {
    Ok(Path::new(&workspace).join(".codegraph").is_dir())
}

// ── 文件依赖图（代码图谱可视化） ─────────────────────────────────────────────
// 直接只读 CodeGraph 的 SQLite 索引（.codegraph/codegraph.db），把符号级/文件级的
// `imports` 边按文件归并成「文件 → 文件」依赖图，供前端 reactflow 渲染。
// schema 取自 CodeGraph 源码：nodes(id,kind,name,file_path,...) / edges(source,target,kind,...)
// / files(path,language,node_count,...)；edges.source/target 为 nodes.id。

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileGraphNode {
    pub path: String,
    pub language: String,
    pub node_count: i64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileGraphEdge {
    pub source: String,
    pub target: String,
    pub weight: i64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileGraph {
    pub nodes: Vec<FileGraphNode>,
    pub edges: Vec<FileGraphEdge>,
}

/// 只读打开 codegraph.db。路径含空格/反斜杠时直接传 Path（非 URI）最稳。
fn open_codegraph_db(workspace: &str) -> Result<rusqlite::Connection, String> {
    let db = Path::new(workspace)
        .join(".codegraph")
        .join("codegraph.db");
    if !db.is_file() {
        return Err("当前 workspace 尚未建立 CodeGraph 索引（请先在「索引」里初始化）".to_string());
    }
    rusqlite::Connection::open_with_flags(&db, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| format!("打开 codegraph.db 失败: {e}"))
}

/// 文件依赖图：节点=文件，边=文件间 import（按符号级 import 归并、按 weight 取前 N）。
/// 只返回参与 import 边的文件（连通子图），避免孤立文件刷屏。
#[tauri::command]
pub async fn code_intel_file_graph(
    workspace: String,
    limit: Option<u32>,
) -> Result<FileGraph, String> {
    let conn = open_codegraph_db(&workspace)?;
    let max_edges = limit.unwrap_or(1500).clamp(1, 20000);

    // import 边按文件归并（对符号级与文件级 import 都鲁棒）；按 weight 取前 N。
    let mut stmt = conn
        .prepare(
            "SELECT src.file_path AS source, tgt.file_path AS target, COUNT(*) AS weight \
             FROM edges e \
             JOIN nodes src ON e.source = src.id \
             JOIN nodes tgt ON e.target = tgt.id \
             WHERE e.kind = 'imports' AND src.file_path <> tgt.file_path \
             GROUP BY src.file_path, tgt.file_path \
             ORDER BY weight DESC \
             LIMIT ?1",
        )
        .map_err(|e| format!("查询依赖边失败: {e}"))?;
    let edges: Vec<FileGraphEdge> = stmt
        .query_map([max_edges], |row| {
            Ok(FileGraphEdge {
                source: row.get(0)?,
                target: row.get(1)?,
                weight: row.get(2)?,
            })
        })
        .map_err(|e| format!("查询依赖边失败: {e}"))?
        .collect::<Result<_, _>>()
        .map_err(|e| format!("读取依赖边失败: {e}"))?;

    // 连通文件集合。
    let mut paths: std::collections::HashSet<String> = std::collections::HashSet::new();
    for e in &edges {
        paths.insert(e.source.clone());
        paths.insert(e.target.clone());
    }

    // 文件元信息（language / node_count），仅对连通集合产出节点。
    let mut meta = conn
        .prepare("SELECT path, language, node_count FROM files")
        .map_err(|e| format!("查询文件失败: {e}"))?;
    let mut by_path: std::collections::HashMap<String, (String, i64)> =
        std::collections::HashMap::new();
    let rows = meta
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .map_err(|e| format!("查询文件失败: {e}"))?;
    for r in rows {
        let (path, language, node_count) = r.map_err(|e| format!("读取文件失败: {e}"))?;
        by_path.insert(path, (language, node_count));
    }

    let mut nodes: Vec<FileGraphNode> = paths
        .into_iter()
        .map(|p| {
            let (language, node_count) = by_path.get(&p).cloned().unwrap_or_default();
            FileGraphNode {
                path: p,
                language,
                node_count,
            }
        })
        .collect();
    nodes.sort_by(|a, b| a.path.cmp(&b.path));

    Ok(FileGraph { nodes, edges })
}
