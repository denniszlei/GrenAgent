//! 跨会话用量聚合:扫描 ~/.pi/agent/sessions 下所有 jsonl,汇总 token / 费用,
//! 按天 / 模型 / 项目 分组 + 最近会话明细,供前端用量图表页(全局总览)使用。
//!
//! 存储版会话 jsonl 中,助手用量在 `{"type":"message","timestamp":"ISO","message":{
//! "role":"assistant","provider":..,"model":..,"usage":{input,output,cacheRead,
//! cacheWrite,totalTokens,cost:{total}}}}`。日期取 timestamp 前 10 位。

use std::cmp::Reverse;
use std::collections::{BTreeMap, BinaryHeap, HashMap};
use std::fs::File;
use std::io::{BufRead, BufReader};

use serde::Serialize;
use serde_json::Value;

use super::sessions::{
    collect_session_files, parse_session_header, read_first_line, read_session_name, sessions_dir,
};

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageTotals {
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write: u64,
    pub total_tokens: u64,
    pub cost: f64,
    pub sessions: u64,
    pub messages: u64,
    pub cache_hit_rate: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayUsage {
    pub date: String,
    pub tokens: u64,
    pub cost: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelUsage {
    pub model: String,
    pub provider: String,
    pub tokens: u64,
    pub cost: f64,
    pub messages: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectUsage {
    pub cwd: String,
    pub name: Option<String>,
    pub tokens: u64,
    pub cost: f64,
    pub sessions: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUsage {
    pub id: String,
    pub name: Option<String>,
    pub cwd: Option<String>,
    pub path: String,
    pub timestamp: Option<String>,
    pub tokens: u64,
    pub cost: f64,
}

/// 单次模型调用（一条 assistant 消息）的用量明细。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CallUsage {
    pub timestamp: Option<String>,
    pub model: String,
    pub provider: String,
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write: u64,
    pub total_tokens: u64,
    pub cost: f64,
}

/// 「最近调用」top-N 堆的元素：按 (timestamp, 单调序号) 排序。
/// 单调序号作为 tiebreak，保证同一时间戳的多条调用不会互相挤掉、顺序稳定。
struct CallEntry {
    sort_key: (String, u64),
    call: CallUsage,
}
impl PartialEq for CallEntry {
    fn eq(&self, other: &Self) -> bool {
        self.sort_key == other.sort_key
    }
}
impl Eq for CallEntry {}
impl PartialOrd for CallEntry {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}
impl Ord for CallEntry {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.sort_key.cmp(&other.sort_key)
    }
}

/// 跨会话「最近调用明细」最多保留条数（与前端展示一致）。
const MAX_RECENT_CALLS: usize = 500;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageReport {
    pub totals: UsageTotals,
    pub by_day: Vec<DayUsage>,
    pub by_model: Vec<ModelUsage>,
    pub by_project: Vec<ProjectUsage>,
    pub recent_sessions: Vec<SessionUsage>,
    /// 跨会话的逐次调用明细，按时间倒序，最多保留 500 条。
    pub calls: Vec<CallUsage>,
}

fn day_of(ts: &str) -> String {
    ts.chars().take(10).collect()
}

struct LineUsage {
    input: u64,
    output: u64,
    cache_read: u64,
    cache_write: u64,
    total_tokens: u64,
    cost: f64,
    model: String,
    provider: String,
    day: String,
    timestamp: Option<String>,
}

/// 解析单行;仅 `type:"message"` 且 `message.role=="assistant"` 且带 usage 的才返回。
fn parse_usage_line(line: &str) -> Option<LineUsage> {
    let v: Value = serde_json::from_str(line.trim().trim_end_matches('\r')).ok()?;
    if v.get("type").and_then(|t| t.as_str()) != Some("message") {
        return None;
    }
    let msg = v.get("message")?;
    if msg.get("role").and_then(|r| r.as_str()) != Some("assistant") {
        return None;
    }
    let usage = msg.get("usage")?;
    let input = usage.get("input").and_then(Value::as_u64).unwrap_or(0);
    let output = usage.get("output").and_then(Value::as_u64).unwrap_or(0);
    let cache_read = usage.get("cacheRead").and_then(Value::as_u64).unwrap_or(0);
    let cache_write = usage.get("cacheWrite").and_then(Value::as_u64).unwrap_or(0);
    let total_tokens = usage
        .get("totalTokens")
        .and_then(Value::as_u64)
        .unwrap_or(input + output + cache_read + cache_write);
    let cost = usage
        .get("cost")
        .and_then(|c| c.get("total"))
        .and_then(Value::as_f64)
        .unwrap_or(0.0);
    let model = msg
        .get("model")
        .and_then(|m| m.as_str())
        .unwrap_or("unknown")
        .to_string();
    let provider = msg
        .get("provider")
        .and_then(|p| p.as_str())
        .unwrap_or("")
        .to_string();
    let timestamp = v
        .get("timestamp")
        .and_then(|t| t.as_str())
        .map(str::to_string);
    let day = timestamp.as_deref().map(day_of).unwrap_or_default();
    Some(LineUsage {
        input,
        output,
        cache_read,
        cache_write,
        total_tokens,
        cost,
        model,
        provider,
        day,
        timestamp,
    })
}

#[tauri::command]
pub async fn usage_report() -> Result<UsageReport, String> {
    let dir = sessions_dir().ok_or("sessions directory unavailable")?;
    let mut files = Vec::new();
    collect_session_files(&dir, &mut files);

    let mut totals = UsageTotals::default();
    let mut by_day: BTreeMap<String, (u64, f64)> = BTreeMap::new();
    // 键用 (provider, model) 复合：不同供应商下的同名模型（如多个代理都叫 gpt-4o）不应被合并。
    let mut by_model: HashMap<(String, String), (u64, f64, u64)> = HashMap::new();
    let mut by_project: HashMap<String, (Option<String>, u64, f64, u64)> = HashMap::new();
    let mut recent: Vec<SessionUsage> = Vec::new();
    let mut calls: BinaryHeap<Reverse<CallEntry>> = BinaryHeap::new();
    let mut call_seq: u64 = 0;

    for path in &files {
        // 跳过首行非法 / 解析失败的会话文件（如 cwd 反斜杠未转义的损坏种子文件），
        // 否则会退化成 id=""/cwd=null/ts=null 的空会话，在前端显示为 "(未命名)" 并虚增会话数。
        let Some(header) = read_first_line(path)
            .ok()
            .and_then(|l| parse_session_header(&l, path.to_string_lossy().as_ref()))
        else {
            continue;
        };
        let cwd = header.cwd.clone();
        let id = header.id.clone();
        let ts = header.timestamp.clone();
        let name = read_session_name(path);
        totals.sessions += 1;

        let mut s_tokens: u64 = 0;
        let mut s_cost: f64 = 0.0;

        if let Ok(file) = File::open(path) {
            for line in BufReader::new(file).lines().map_while(Result::ok) {
                if !line.contains("\"usage\"") {
                    continue;
                }
                let Some(u) = parse_usage_line(&line) else {
                    continue;
                };
                totals.input += u.input;
                totals.output += u.output;
                totals.cache_read += u.cache_read;
                totals.cache_write += u.cache_write;
                totals.total_tokens += u.total_tokens;
                totals.cost += u.cost;
                totals.messages += 1;
                s_tokens += u.total_tokens;
                s_cost += u.cost;

                call_seq += 1;
                let ts_key = u
                    .timestamp
                    .clone()
                    .or_else(|| ts.clone())
                    .unwrap_or_default();
                calls.push(Reverse(CallEntry {
                    sort_key: (ts_key, call_seq),
                    call: CallUsage {
                        timestamp: u.timestamp.clone().or_else(|| ts.clone()),
                        model: u.model.clone(),
                        provider: u.provider.clone(),
                        input: u.input,
                        output: u.output,
                        cache_read: u.cache_read,
                        cache_write: u.cache_write,
                        total_tokens: u.total_tokens,
                        cost: u.cost,
                    },
                }));
                // 只保留最近 MAX_RECENT_CALLS 条：超出即弹出最旧，避免全量调用进内存。
                if calls.len() > MAX_RECENT_CALLS {
                    calls.pop();
                }

                let day = if u.day.is_empty() {
                    ts.as_deref().map(day_of).unwrap_or_default()
                } else {
                    u.day
                };
                let d = by_day.entry(day).or_insert((0, 0.0));
                d.0 += u.total_tokens;
                d.1 += u.cost;

                let m = by_model.entry((u.provider, u.model)).or_insert((0, 0.0, 0));
                m.0 += u.total_tokens;
                m.1 += u.cost;
                m.2 += 1;
            }
        }

        if let Some(c) = cwd.clone() {
            let p = by_project.entry(c).or_insert((name.clone(), 0, 0.0, 0));
            if p.0.is_none() {
                p.0 = name.clone();
            }
            p.1 += s_tokens;
            p.2 += s_cost;
            p.3 += 1;
        }

        recent.push(SessionUsage {
            id,
            name,
            cwd,
            path: path.to_string_lossy().to_string(),
            timestamp: ts,
            tokens: s_tokens,
            cost: s_cost,
        });
    }

    let denom = totals.input + totals.cache_read;
    totals.cache_hit_rate = if denom > 0 {
        totals.cache_read as f64 / denom as f64
    } else {
        0.0
    };

    let by_day: Vec<DayUsage> = by_day
        .into_iter()
        .filter(|(d, _)| !d.is_empty())
        .map(|(date, (tokens, cost))| DayUsage { date, tokens, cost })
        .collect();

    let mut by_model: Vec<ModelUsage> = by_model
        .into_iter()
        .map(|((provider, model), (tokens, cost, messages))| ModelUsage {
            model,
            provider,
            tokens,
            cost,
            messages,
        })
        .collect();
    by_model.sort_by(|a, b| b.tokens.cmp(&a.tokens));

    let mut by_project: Vec<ProjectUsage> = by_project
        .into_iter()
        .map(|(cwd, (name, tokens, cost, sessions))| ProjectUsage {
            cwd,
            name,
            tokens,
            cost,
            sessions,
        })
        .collect();
    by_project.sort_by(|a, b| b.tokens.cmp(&a.tokens));

    recent.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    recent.truncate(50);

    // 最小堆（按 (timestamp, seq)）→ 按时间倒序的 Vec：into_sorted_vec 对 Reverse 升序，
    // 即原元素降序，最新在前，与旧 sort 行为一致。
    let calls: Vec<CallUsage> = calls
        .into_sorted_vec()
        .into_iter()
        .map(|Reverse(e)| e.call)
        .collect();

    Ok(UsageReport {
        totals,
        by_day,
        by_model,
        by_project,
        recent_sessions: recent,
        calls,
    })
}
