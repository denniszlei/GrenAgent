# 子项目 D.3：语义代码搜索（设计/规格）

- 日期：2026-06-16
- 状态：草案 — 已实地核验（npm 运行时 `@earendil-works/pi-coding-agent@0.79.x`），待用户审查
- 主题：对代码文件建 embedding 索引，提供 `code_search({query, topK})` 语义检索
- 载体：纯新扩展 `extensions/code-search/` + **前置重构**：把向量设施 hoist 到 `_shared`
- 优先级：**最低**（grep 已覆盖关键词；本项 YAGNI 色彩最浓）
- 上游总览：`docs/superpowers/specs/2026-06-16-pi-enhancement-roadmap-design.md` §4.D.3

> 锚点约定：`_shared` = `extensions/_shared/`；embedding 现状锚点见 `long-term-memory/`、`knowledge-rag/`。

## 0. 实地核验要点（修正总览「复用 embedding 基础设施」的粒度）

总览 §4.D.3 称「复用 embedding 基础设施」。核验后**部分成立**：

| 设施 | 可否 as-is 复用 | 锚点 |
|---|---|---|
| HTTP/端点解析 | **可** | `_shared/provider-endpoint.ts` 的 `resolveCapabilityEndpoint`/`capabilityFetch`/`capabilityError` |
| 配置 | **可** | `_shared/runtime-config.ts` 的 `getConfig` |
| SQLite | **可** | `_shared/sqlite.ts` 的 `DatabaseSync`（BLOB 可存 Float32 向量） |
| `embedTexts` | **不可（重复）** | `long-term-memory/embedding.ts` 与 `knowledge-rag/embedding.ts` 各一份，仅 env 键不同（`MEMORY_EMBED_*` vs `KB_EMBED_*`） |
| 向量存取/相似度 | **不可（重复）** | LTM `store.ts`（encode/decode Float32 BLOB + 全表 cosine + `ranking.ts`）与 RAG `store.ts`（同款 cosine）各一套；`knowledge-rag/store.ts:4` 注释「Swapping to sqlite-vec later only touches this file」 |

**结论**：D.3 不能「直接复用」向量库。**前置重构**：抽 `_shared/embedding.ts`（参数化 env 键的 `embedTexts`/`resolveEmbeddingConfig`）+ `_shared/vector-store.ts`（Float32 BLOB 编解码 + 暴力 cosine + 关键词降级）。该重构同时惠及 LTM/RAG 去重与 D.1 语义增强，是本项最大价值点。

## 1. 目标与范围

### 1.1 前置重构（与 D.3 同一计划）
- 新建 `_shared/embedding.ts`：`embedTexts(texts, { providerKey, modelKey, fallbackModel }, registry, signal)`，内部用 `provider-endpoint`。
- 新建 `_shared/vector-store.ts`：`encode/decode`（Float32 ↔ BLOB）、`cosineSearch(query, rows, topK)`、`keywordFallback`。
- LTM/RAG **可选**迁移到该共享层（非本项必须，避免扩大改动面；至少 D.3 与未来 D.1 语义增强用它）。

### 1.2 MVP
- 索引：枚举项目代码文件（受 `.gitignore`/扩展名白名单约束）→ 切块（行窗口）→ `_shared.embedTexts` → Float32 BLOB 存 `<cwd>/.pi/code-index/index.db`。
- 工具 `code_search({ query, topK? })` → 暴力 cosine → 返回 `{ file, lineStart, lineEnd, score, snippet }[]`。
- 增量：按文件 mtime/hash 跳过未变更文件。

### 1.3 成功标准
1. 索引后语义查询（如「写文件的工具实现」）能返回相关代码块，非纯关键词匹配。
2. 无 embedding key/端点 → 工具禁用 + 明确提示（fail-soft），不报错。
3. 重复运行按 mtime 增量，不全量重嵌。

### 1.4 不在范围（增强）
- 符号级（函数/类）AST 切块（MVP 用行窗口）。
- 与 grep 融合排序。
- sqlite-vec 加速（暴力 cosine 足够小仓用，注释已留迁移点）。

## 2. 代码依据（实地核验）

| 能力 | 锚点 |
|---|---|
| embedding HTTP | `long-term-memory/embedding.ts`（`resolveEmbeddingConfig`/`embedTexts`，`POST {baseUrl}/embeddings {model,input}`，`embedding.ts:40-46`）；`knowledge-rag/embedding.ts:21-23` |
| 端点解析 | `_shared/provider-endpoint.ts`（`resolveCapabilityEndpoint`，fallback `text-embedding-3-small`） |
| 向量存取现状（待 hoist） | LTM `store.ts`（Float32→Uint8Array BLOB `store.ts:64-67/89-92`，cosine `:493-517`）；RAG `store.ts`（cosine `:58-68/208-213`） |
| 切块参考 | `knowledge-rag`（chunk + embed + store 流水线，`index.ts`/`store.ts`） |
| SQLite | `_shared/sqlite.ts` `DatabaseSync` |
| 工具注册 | `registerTool`（`types.d.ts:335-361,840`），返回 `{content,details}`（`web-fetch/index.ts:102-144`） |

## 3. 架构与组件
- `_shared/embedding.ts`、`_shared/vector-store.ts`（前置重构，见 §1.1）。
- `extensions/code-search/index.ts` —— 工厂 + `code_search` 工具 + `/code-index` 命令（重建/状态）。
- `extensions/code-search/indexer.ts` —— 文件枚举 + 切块 + 增量 + 调 `_shared.embedTexts` + 写 `_shared/vector-store`。
- `extensions/code-search/files.ts` —— 扩展名白名单 + ignore 过滤（复用 `ignore` 包，已在依赖树）。

DB：`<cwd>/.pi/code-index/index.db`，表 `chunks(file, line_start, line_end, mtime, text, embedding BLOB)`。

## 4. 数据流
```
/code-index rebuild 或工具首调   → indexer.ensureIndex(ctx)：枚举→过滤→切块→embedTexts→vector-store.upsert（mtime 增量）
code_search({query, topK})       → embedTexts([query]) → vector-store.cosineSearch → topK → {file,lineStart,lineEnd,score,snippet}
                                 → 无 embedding 配置：返回禁用提示（fail-soft）
```

## 5. 错误处理（fail-soft）
- 无 embedding key/端点（`resolveCapabilityEndpoint.enabled=false`）→ 工具与命令均返回明确「未配置 embedding」提示，不抛。
- 单文件读/嵌入失败 → 跳过该文件继续。
- 大仓：批量 embed 限并发 + 进度（`onUpdate`）；超大文件按窗口分块。
- 嵌入维度不一致（换模型）→ 检测到维度变化则提示重建索引。

## 6. 配置（`getConfig`）
- `CODE_SEARCH_ENABLED`（默认 **关**，最低优先级、按需开）。
- `CODE_EMBED_PROVIDER` / `CODE_EMBED_MODEL`（或复用 `KB_EMBED_*`）。
- `CODE_SEARCH_EXTS`（默认 `.ts,.tsx,.js,.py,.rs,.go,...`）、`CODE_SEARCH_CHUNK_LINES`（默认 60）。

## 7. 测试
- `_shared/vector-store.test.ts`：encode/decode round-trip、cosine 排序、关键词降级。
- `_shared/embedding.test.ts`：config 解析（provider/model/fallback），mock fetch。
- `indexer.test.ts`：切块边界、mtime 增量、ignore 过滤。
- `code-search`：空索引/无 key 降级。
- jiti smoke。

## 8. 实现文件清单
| 文件 | 职责 |
|---|---|
| `extensions/_shared/embedding.ts` | 共享 embedTexts/config（前置重构） |
| `extensions/_shared/vector-store.ts` | 共享向量编解码 + cosine + 降级（前置重构） |
| `extensions/code-search/index.ts` | 工厂 + 工具 + 命令 |
| `extensions/code-search/indexer.ts` | 枚举/切块/增量/嵌入 |
| `extensions/code-search/files.ts` | 白名单 + ignore |
| `*.test.ts` | 单测 |
| `extensions/package.json` | 追加 `./code-search/index.ts` |

## 9. 排序建议
最低优先级。建议落地顺序：先做 §1.1 `_shared` 重构（独立价值：LTM/RAG 去重 + D.1 语义增强复用），再视需要做 D.3 索引/工具。若团队认为 grep 已足够，可只做 `_shared` 重构而暂缓 D.3 工具本体。

## 可选增强（YAGNI）
- 符号级 AST 切块；文件变更增量精修；与 grep 融合排序；sqlite-vec 加速。

## 规格自检（2026-06-16）
- [x] 无占位；前置重构与 D.3 本体边界清晰
- [x] 复用粒度据核验定稿（HTTP/config 可复用，向量库需 hoist）
- [x] 范围可单一实现计划覆盖（含 `_shared` 重构）
- [x] fail-soft + 最低优先级定位明确

## 代码核对修订（2026-06-16，实地核验 v1，来自 D 区只读审计）
- [x] embedding 复用粒度属实：HTTP/config 可复用；`embedTexts` 与向量库在 LTM/RAG 重复（`long-term-memory/embedding.ts`、`knowledge-rag/embedding.ts`/`store.ts`）
- [x] 向量存取现状属实：Float32 BLOB + 全表 cosine + 关键词降级（LTM `store.ts:493-517`、RAG `store.ts:58-68`）
- [x] 迁移点已留：`knowledge-rag/store.ts:4`「Swapping to sqlite-vec later only touches this file」
- [x] SQLite/工具签名属实：`_shared/sqlite.ts`、`types.d.ts:335-361`
