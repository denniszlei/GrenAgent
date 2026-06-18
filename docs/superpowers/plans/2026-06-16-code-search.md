# 子项目 D.3：语义代码搜索（code-search）实现计划

> **面向 AI 代理的工作者：** 必需子技能：superpowers:executing-plans。

**目标：** 前置抽出可复用的 `_shared/vector-store.ts` + `_shared/embedding.ts`；新增纯扩展 `extensions/code-search/`：对代码切块 + embedding 建索引（SQLite），`code_search` 工具做余弦语义检索。最低优先级，默认 **关**。

**架构：** `_shared/vector-store`（纯：encode/decode/cosine/topK）+ `_shared/embedding`（参数化 embedTexts，复用 provider-endpoint）；code-search 用 `chunker`（纯）+ `files`（枚举）+ `store`（`_shared/sqlite` BLOB 向量）+ `index`（工具/命令）。零核心改动；无 embedding key 时 fail-soft 禁用。

**技术栈：** TypeScript（ESM `.js`）、node:fs、typebox、`_shared/sqlite`、Vitest。

**规格依据：** `docs/superpowers/specs/2026-06-16-code-search-design.md`

## 关键约束
1. 复用 `_shared/provider-endpoint` 的 `resolveCapabilityEndpoint`/`capabilityFetch`/`capabilityError`（`provider-endpoint.ts:20-85`），embedTexts 镜像 `long-term-memory/embedding.ts:32-54`。
2. 向量存 SQLite BLOB（`_shared/sqlite` `DatabaseSync`），Float32 编解码 + 暴力 cosine（sqlite-vec 为增强）。
3. 默认 `CODE_SEARCH_ENABLED=0`（关）；无 embedding 端点 → 工具/命令 fail-soft 提示。
4. LTM/RAG **不改**（保留各自 embedding，去重为未来工作）；本项只新增 `_shared` 共享件 + code-search。
5. `_shared` 下有用户已暂存文件：提交只 `git add` 新文件，`git commit -- <精确路径>`。禁 emoji。

## 文件结构
| 文件 | 职责 |
|---|---|
| `extensions/_shared/vector-store.ts` | encode/decode/cosineSimilarity/topKByCosine（纯） |
| `extensions/_shared/embedding.ts` | resolveEmbedding/embedTexts（参数化，复用 provider-endpoint） |
| `extensions/code-search/package.json` | Pi 包清单 |
| `extensions/code-search/chunker.ts` | chunkText（纯，行窗口） |
| `extensions/code-search/files.ts` | listCodeFiles（扩展名白名单 + 跳过 node_modules/.git/.pi/dist） |
| `extensions/code-search/store.ts` | CodeIndex（SQLite：mtime 增量 + all） |
| `extensions/code-search/index.ts` | 工厂：code_search 工具 + /code-index 命令 |
| `*.test.ts` | 单测（vector-store/embedding/chunker/files/store/index） |
| 修改 `extensions/index.ts` | 接入 `codeSearch` |

## 任务（TDD）
1. `_shared/vector-store.ts` + test（encode/decode round-trip、cosine 同向≈1/正交=0、topK 排序）。
2. `_shared/embedding.ts` + test（resolveEmbedding 无 registry → disabled）。
3. `code-search/chunker.ts` + test（按行窗口切块、空块过滤）。
4. `code-search/files.ts` + test（临时目录枚举 + 跳过目录）。
5. `code-search/store.ts` + test（临时 db：replaceFile→all 向量保真、mtimeOf）。
6. `code-search/index.ts` + smoke（设 CODE_SEARCH_ENABLED=1 后注册 code_search + /code-index）。
7. 接入 allExtensions（`multiAgent,` 之后）+ bun 导入冒烟（23 true）+ lint + 提交（`git add extensions/_shared/vector-store.ts extensions/_shared/embedding.ts extensions/code-search`，`git commit -- ...`）。

> 完整源码见实现产出文件（与本计划同次提交）。

## 自检
- 规格覆盖：§1.1 前置重构（vector-store+embedding）→ 任务 1-2；§1.2 MVP（chunk/embed/store/cosine 检索、mtime 增量、无 key fail-soft）→ 任务 3-6；§5 fail-soft → index 守卫。
- 占位符：无。
- 类型一致：`EmbeddingConfig`（embedding，index 复用）；`Scored<T>`/`cosineSimilarity`/`topKByCosine`（vector-store，index 复用）；`Chunk`（chunker，index/store 复用）；`ChunkRow`（store，index 复用）。
- 偏差：LTM/RAG 暂不迁移到 `_shared/embedding`（去重为未来工作，避免扩大改动面）。
