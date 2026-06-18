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
| 智能合并 | 写入管线 | 写入时 LLM 召回相似旧记忆并决策 **ADD/UPDATE/DELETE/NOOP**,自动消解重复与矛盾(mem0 风格,`MEMORY_SMART=0` 退回朴素 hash 去重) |
| 历史/回滚 | `memory_history` 表 | 每次增改删记审计,支持版本与回滚(`/memory history`、`/memory rollback`) |
| 自动召回 | `before_agent_start` 钩子 | 每次提问自动召回(两级合并)并注入(`MEMORY_AUTO_INJECT=0` 关闭) |
| 自动捕获 | `before_agent_start` 钩子 | 用户说「记住:xxx」/「remember: xxx」时自动存(`MEMORY_AUTO_CAPTURE=0` 关闭) |
| 自动提取 | `agent_end` 钩子 | 每轮对话后**进程内** LLM 抽取要点并智能合并入记忆(`MEMORY_EXTRACT=1` 开启,默认关) |

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
| `MEMORY_SMART` | `1`(开启) | 设 `0` 关闭智能合并,退回朴素 hash 去重 |
| `MEMORY_MODEL` | (继承当前模型) | 智能合并/提取用的模型,格式 `provider/id`(如 `openai/gpt-4o-mini`);留空用当前 agent 模型 |
| `MEMORY_SMART_NOTICE` | `1`(开启) | 设 `0` 关闭「合并时对话提示」 |

## 用法示例

```text
# agent 会在合适时机自动记忆(由 promptGuidelines 引导):
> 以后我的项目都用 pnpm,不要用 npm
  (agent 调 memory_save: "用户偏好用 pnpm 而非 npm",category=preference)

# 之后任意提问,相关记忆会自动注入:
> 帮我加个依赖
  (before_agent_start 自动召回 "用户偏好 pnpm" 并注入 → agent 用 pnpm)

# 智能合并示例(MEMORY_SMART=1,默认):
> 以后我改用 npm 了
  (写入时召回到旧记忆「用户偏好 pnpm」→ LLM 决策 UPDATE → 记忆更新为 npm,不再两条并存)

# 人工查看/管理
/memory list
/memory add <text>
/memory forget <id>
/memory clear [project|global|all]
/memory history [id]          # 变更时间线 / 某条记忆的版本史
/memory rollback <historyId>  # 回滚某次变更
```

## 文件结构

```text
long-term-memory/
├── index.ts        # memory_save / memory_recall 工具 + /memory 命令 + 自动召回注入 + 智能合并接线
├── store.ts        # sqlite 记忆存储(不分块、Float32 BLOB)、cosine / 关键词召回、历史/版本/回滚
├── consolidate.ts  # mem0 风格管线:抽取事实 + 召回相似 + LLM 决策 ADD/UPDATE/DELETE/NOOP
├── llm.ts          # 进程内 LLM 调用(completeSimple / ctx.model) + 宽松 JSON 解析 + 模型解析
├── embedding.ts    # OpenAI 兼容 embedding + 自动降级
├── package.json    # Pi Package 清单
└── README.md
```

## 进阶扩展点

1. **全局 + 项目两级记忆(已内置)**:`memory_save` 支持 `scope: global`,召回自动合并两级、按分数去重。
2. **自动捕获 + 自动提取(均已内置)**:「记住:xxx」即时捕获;`agent_end` 子 agent 从整段对话抽取记忆(`MEMORY_EXTRACT=1` 开启,参考 lobehub memory extractor)。
3. **遗忘策略(已内置)**:召回命中累计 `useCount` / `lastUsedAt`,融入加权排序(近期/常用上浮,久不用下沉;只降权不删除)。
4. **召回优化(已内置,纯 JS)**:结构化过滤(category/时间)缩候选 + 预解码向量缓存消除每次重复解码;未引入 sqlite-vec(Pi 是 bun --compile 单二进制,原生扩展无法嵌入)。

## 注意

- 包名:按官方新名 `@earendil-works/*` + `typebox` 写(实测该 Pi 版本 bundle 的是 `typebox`)。旧包 `@mariozechner/*` / `@sinclair/typebox` 改 `index.ts` 顶部 import 即可。
- 存储用 Node 内置 `node:sqlite`(实验特性),首次加载打印一行 `ExperimentalWarning`,正常无害(需 Node ≥ 22.5)。
- 记忆默认自动注入且 `display: true` 可见;如果觉得吵,`MEMORY_AUTO_INJECT=0` 关闭,改为让 agent 主动 `memory_recall`。
