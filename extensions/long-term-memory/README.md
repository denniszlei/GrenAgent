# pi-long-term-memory

为 [Pi coding agent](https://github.com/earendil-works/pi) 写的**长期记忆扩展**。

让 agent **跨会话记住**用户偏好、项目约定、重要决策——在对话中主动记录(或用户说「记住:xxx」自动捕获),之后每次提问自动召回并注入。支持**项目 + 全局两级**。**开箱即跑**:配了 embedding key 走语义召回,没配自动降级关键词召回(中英文均可)。

> 与 `knowledge-rag` 的区别:知识库存的是用户主动索引的**大块文档**(查资料);记忆存的是 agent 记录的**细粒度事实**(记住你是谁、项目怎么做)。两者可同时启用、互补。

## 能力

| 类型 | 名称 | 说明 |
|---|---|---|
| 工具(LLM 可调) | `memory_save` | 记一条记忆(`scope: project` 默认 / `global`),同内容幂等去重 |
| 工具(LLM 可调) | `memory_recall` | 跨两级(项目 + 全局)召回相关记忆 |
| 命令 | `/memory list` `/memory forget <id>` `/memory clear [project\|global\|all]` | 人工管理 |
| 自动召回 | `before_agent_start` 钩子 | 每次提问自动召回(两级合并)并注入(`MEMORY_AUTO_INJECT=0` 关闭) |
| 自动捕获 | `before_agent_start` 钩子 | 用户说「记住:xxx」/「remember: xxx」时自动存(`MEMORY_AUTO_CAPTURE=0` 关闭) |
| 自动提取 | `agent_end` 钩子 | 每轮对话后用子 agent 抽取要点存入记忆(`MEMORY_EXTRACT=1` 开启,默认关) |

存储(两级):项目级 `<cwd>/.pi/memory/memory.db` + 全局 `~/.pi/agent/long-term-memory.db`(**node:sqlite**,跨重启保留)。记忆**不分块**(每条原子事实),embedding 存 Float32 BLOB,零第三方依赖。

## 安装 / 加载

```bash
# 快速试用
pi -e ./extensions/long-term-memory/index.ts

# 自动发现:放到全局/项目扩展目录
cp -r extensions/long-term-memory ~/.pi/agent/extensions/   # 或 .pi/extensions/

# 作为 Pi Package 安装
pi install git:github.com/<you>/<repo>
```

## 配置

| 变量 | 默认值 | 说明 |
|---|---|---|
| `MEMORY_EMBED_API_KEY` | (回退 `OPENAI_API_KEY`) | 有值即启用语义召回 |
| `MEMORY_EMBED_BASE_URL` | `https://api.openai.com/v1` | OpenAI 兼容端点 |
| `MEMORY_EMBED_MODEL` | `text-embedding-3-small` | embedding 模型 |
| `MEMORY_AUTO_INJECT` | `1`(开启) | 设 `0` 关闭自动召回注入 |
| `MEMORY_AUTO_TOPK` | `5` | 自动注入的记忆条数 |
| `MEMORY_AUTO_CAPTURE` | `1`(开启) | 设 `0` 关闭「记住:xxx」自动捕获 |
| `MEMORY_GLOBAL_DB` | `~/.pi/agent/long-term-memory.db` | 全局记忆库路径(可自定义) |
| `MEMORY_EXTRACT` | `0`(关闭) | 设 `1` 开启「对话自动提取」(每轮多一次 LLM 调用) |
| `PI_BIN` | `pi` | 自动提取用的 pi 可执行(PATH 或绝对路径) |

## 用法示例

```text
# agent 会在合适时机自动记忆(由 promptGuidelines 引导):
> 以后我的项目都用 pnpm,不要用 npm
  (agent 调 memory_save: "用户偏好用 pnpm 而非 npm",category=preference)

# 之后任意提问,相关记忆会自动注入:
> 帮我加个依赖
  (before_agent_start 自动召回 "用户偏好 pnpm" 并注入 → agent 用 pnpm)

# 人工查看/管理
/memory list
/memory forget <id>
/memory clear
```

## 文件结构

```text
long-term-memory/
├── index.ts       # memory_save / memory_recall 工具 + /memory 命令 + 自动召回注入
├── store.ts       # node:sqlite 记忆存储(不分块、Float32 BLOB)、cosine / 关键词召回
├── embedding.ts   # OpenAI 兼容 embedding + 自动降级
├── extractor.ts   # agent_end 用子 agent 从对话抽取记忆
├── package.json   # Pi Package 清单
└── README.md
```

## 进阶扩展点

1. ✅ **全局 + 项目两级记忆(已内置)**:`memory_save` 支持 `scope: global`,召回自动合并两级、按分数去重。
2. ✅ **自动捕获 + 自动提取(均已内置)**:「记住:xxx」即时捕获;`agent_end` 子 agent 从整段对话抽取记忆(`MEMORY_EXTRACT=1` 开启,参考 lobehub memory extractor)。
3. **遗忘策略**:给记忆加 `lastUsedAt` / 命中计数,长期不用的降权或清理。
4. **向量索引**:大量记忆时在 `store.ts` 接 `sqlite-vec` 做 ANN。

## 注意

- 包名:按官方新名 `@earendil-works/*` + `typebox` 写(实测该 Pi 版本 bundle 的是 `typebox`)。旧包 `@mariozechner/*` / `@sinclair/typebox` 改 `index.ts` 顶部 import 即可。
- 存储用 Node 内置 `node:sqlite`(实验特性),首次加载打印一行 `ExperimentalWarning`,正常无害(需 Node ≥ 22.5)。
- 记忆默认自动注入且 `display: true` 可见;如果觉得吵,`MEMORY_AUTO_INJECT=0` 关闭,改为让 agent 主动 `memory_recall`。
