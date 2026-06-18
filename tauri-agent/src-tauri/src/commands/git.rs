use std::process::Command;

use serde::{Deserialize, Serialize};

use crate::commands::sessions::resolve_workspace_dir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileStatus {
    pub path: String,
    pub status: String, // "modified" | "staged" | "untracked"
}

fn porcelain_to_status(code: &str) -> String {
    if code == "??" {
        return "untracked".to_string();
    }
    let bytes = code.as_bytes();
    let index = bytes.first().copied().unwrap_or(b' ');
    let worktree = bytes.get(1).copied().unwrap_or(b' ');

    if worktree == b'M' || worktree == b'D' {
        return "modified".to_string();
    }
    if matches!(index, b'M' | b'A' | b'D' | b'R' | b'C') {
        return "staged".to_string();
    }
    "modified".to_string()
}

fn parse_porcelain_line(line: &str) -> Option<FileStatus> {
    if line.len() < 3 {
        return None;
    }
    let code = &line[0..2];
    let mut path = line[3..].trim().to_string();
    if let Some((_, new_path)) = path.split_once(" -> ") {
        path = new_path.to_string();
    }
    if path.is_empty() {
        return None;
    }
    Some(FileStatus {
        path,
        status: porcelain_to_status(code),
    })
}

fn run_git(cwd: &std::path::Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("git spawn failed: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git {} failed: {}", args.join(" "), stderr.trim()));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn is_git_repo(cwd: &std::path::Path) -> bool {
    cwd.join(".git").exists()
}

#[tauri::command]
pub async fn get_git_status(workspace_path: String) -> Result<Vec<FileStatus>, String> {
    let cwd = resolve_workspace_dir(&workspace_path)?;
    if !is_git_repo(&cwd) {
        return Ok(vec![]);
    }

    let stdout = run_git(&cwd, &["status", "--porcelain"])?;
    Ok(stdout.lines().filter_map(parse_porcelain_line).collect())
}

#[tauri::command]
pub async fn get_git_diff(workspace_path: String, file_path: String) -> Result<String, String> {
    let cwd = resolve_workspace_dir(&workspace_path)?;
    if !is_git_repo(&cwd) {
        return Err("not a git repository".to_string());
    }

    // 已跟踪文件的改动优先。
    let tracked = run_git(&cwd, &["diff", "--", &file_path]).unwrap_or_default();
    if !tracked.trim().is_empty() {
        return Ok(tracked);
    }

    // 未跟踪 / 新文件：git diff 默认不含未跟踪文件，改用 --no-index 对比空设备展示新增内容。
    // --no-index 在存在差异时返回非 0 退出码，这里只取 stdout，不当作错误处理。
    let output = Command::new("git")
        .args(["diff", "--no-index", "--", "/dev/null", &file_path])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("git spawn failed: {e}"))?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitBranches {
    pub current: String,
    pub branches: Vec<BranchInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitLogEntry {
    pub hash: String,
    pub short_hash: String,
    pub parents: Vec<String>,
    pub author: String,
    pub subject: String,
    pub timestamp: i64,
    pub refs: Vec<String>,
}

/// Parse `%(upstream:track)` like "[ahead 2, behind 1]" / "[ahead 3]" / "[gone]" / "".
fn parse_track(track: &str) -> (u32, u32) {
    let mut ahead = 0u32;
    let mut behind = 0u32;
    let trimmed = track.trim().trim_matches(|c| c == '[' || c == ']');
    for part in trimmed.split(',') {
        let part = part.trim();
        if let Some(n) = part.strip_prefix("ahead ") {
            ahead = n.trim().parse().unwrap_or(0);
        } else if let Some(n) = part.strip_prefix("behind ") {
            behind = n.trim().parse().unwrap_or(0);
        }
    }
    (ahead, behind)
}

#[tauri::command]
pub async fn get_git_branches(workspace_path: String) -> Result<GitBranches, String> {
    let cwd = resolve_workspace_dir(&workspace_path)?;
    if !is_git_repo(&cwd) {
        return Ok(GitBranches {
            current: String::new(),
            branches: vec![],
        });
    }

    let current = run_git(&cwd, &["rev-parse", "--abbrev-ref", "HEAD"])?
        .trim()
        .to_string();

    // \x1f separates fields; one local branch per line.
    let fmt = "%(refname:short)\x1f%(HEAD)\x1f%(upstream:short)\x1f%(upstream:track)";
    let stdout = run_git(&cwd, &["branch", "--format", fmt])?;

    let branches = stdout
        .lines()
        .filter_map(|line| {
            let mut parts = line.split('\x1f');
            let name = parts.next()?.trim().to_string();
            if name.is_empty() {
                return None;
            }
            let head = parts.next().unwrap_or("").trim();
            let upstream = parts.next().unwrap_or("").trim();
            let (ahead, behind) = parse_track(parts.next().unwrap_or(""));
            Some(BranchInfo {
                is_current: head == "*",
                upstream: if upstream.is_empty() {
                    None
                } else {
                    Some(upstream.to_string())
                },
                ahead,
                behind,
                name,
            })
        })
        .collect();

    Ok(GitBranches { current, branches })
}

#[tauri::command]
pub async fn git_checkout(workspace_path: String, branch: String) -> Result<(), String> {
    let cwd = resolve_workspace_dir(&workspace_path)?;
    if !is_git_repo(&cwd) {
        return Err("not a git repository".to_string());
    }
    run_git(&cwd, &["checkout", &branch])?;
    Ok(())
}

#[tauri::command]
pub async fn git_create_branch(
    workspace_path: String,
    name: String,
    checkout: bool,
) -> Result<(), String> {
    let cwd = resolve_workspace_dir(&workspace_path)?;
    if !is_git_repo(&cwd) {
        return Err("not a git repository".to_string());
    }
    if checkout {
        run_git(&cwd, &["checkout", "-b", &name])?;
    } else {
        run_git(&cwd, &["branch", &name])?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_git_log_graph(
    workspace_path: String,
    limit: Option<u32>,
) -> Result<Vec<GitLogEntry>, String> {
    let cwd = resolve_workspace_dir(&workspace_path)?;
    if !is_git_repo(&cwd) {
        return Ok(vec![]);
    }

    let n = limit.unwrap_or(40).to_string();
    // %H full hash, %h short, %P parents, %an author, %ct commit ts, %s subject, %D refs
    let pretty = "--pretty=format:%H\x1f%h\x1f%P\x1f%an\x1f%ct\x1f%s\x1f%D".to_string();
    let stdout = run_git(&cwd, &["log", "-n", &n, &pretty])?;

    let entries = stdout
        .lines()
        .filter_map(|line| {
            let mut parts = line.split('\x1f');
            let hash = parts.next()?.trim().to_string();
            if hash.is_empty() {
                return None;
            }
            let short_hash = parts.next().unwrap_or("").trim().to_string();
            let parents = parts
                .next()
                .unwrap_or("")
                .split_whitespace()
                .map(|s| s.to_string())
                .collect();
            let author = parts.next().unwrap_or("").to_string();
            let timestamp = parts.next().unwrap_or("0").trim().parse().unwrap_or(0);
            let subject = parts.next().unwrap_or("").to_string();
            let refs = parts
                .next()
                .unwrap_or("")
                .split(", ")
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            Some(GitLogEntry {
                hash,
                short_hash,
                parents,
                author,
                subject,
                timestamp,
                refs,
            })
        })
        .collect();

    Ok(entries)
}
