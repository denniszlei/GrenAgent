# A3 Sub-agent 修复 + UI 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法跟踪进度。

**目标：** 修复桌面环境下 `spawn_agent`（子代理）与 `MEMORY_EXTRACT` 记忆提取无法工作的问题，使其复用 GrenAgent sidecar 二进制本体（而非依赖系统全局 `pi`），并补齐设置项与 UI 呈现。

**父 spec：** `docs/superpowers/specs/2026-06-13-grenagent-subproject-a-extensions-safety-design.md`（§4.6 模块 3：sub-agent 修复 + UI）

---

## 关键发现（实现前排查，修正 spec §4.6）

spec §4.6 假设「runner 默认 spawn 系统 `pi`、`PI_BIN` 未注入」是唯一问题，注入 `PI_BIN` 即可。实际排查代码后发现 **spec 不完整**，真正的阻塞链是：

1. **`extensions/multi-agent/runner.ts` 已经支持 `PI_BIN`** —— `resolvePiCommand()` 已是 `process.env.PI_BIN ?? "pi"`（先前提交已改）。`extensions/long-term-memory/extractor.ts` 同样已支持。**spec 描述的这两处 TS 修改其实已完成。**

2. **`tauri-agent/src-tauri/src/pi/sidecar.rs` 未注入 `PI_BIN`** —— `spawn_pi_client` 注入了 `PI_PACKAGE_DIR` 与调用方 `env`，但没有 `PI_BIN`，所以 sidecar 进程内 `process.env.PI_BIN` 为 undefined → fallback 到系统 `pi` → 桌面无全局 `pi` 时失败。

3. **【核心阻塞】`cli/src/main.ts` 只支持 `--mode rpc`，不解析 argv** —— 它直接 `await runRpcMode(runtime)`，忽略所有命令行参数。所以即便把 `PI_BIN` 指向 sidecar 二进制，子代理执行 `<sidecar> --mode json -p --no-session <task>` 也**不会**跑一次性任务，而是进入 RPC 模式干等 stdin。**这是 spec 完全没覆盖的点，也是 A3 的真正核心。**

4. **pi 0.78.1 包能力**（已核对 `@earendil-works/pi-coding-agent` 的 `dist/*.d.ts`）：
   - `runPrintMode(runtime, options: PrintModeOptions): Promise<number>`，`PrintModeOptions = { mode: "text" | "json"; initialMessage?: string; messages?: string[]; initialImages?: ImageContent[] }`。这正是 `pi -p` / `pi --mode json` 的单次执行入口。
   - `main(args: string[], options?: { extensionFactories?: ExtensionFactory[] }): Promise<void>` —— 官方完整 CLI 入口，自己解析 argv 并分发到各模式，且接受我们的 `extensionFactories`。
   - `runRpcMode(runtime): Promise<never>`（现状已用）。

5. **`settingsSchema.ts` 无 `PI_BIN` 字段**，但「网页抓取 / 子代理」分类已有 `SUBAGENT_TIMEOUT_MS`。

6. **前端 `SpawnAgentCard` 已存在**（`extensionCards.tsx`，注册在 `EXTENSION_CARDS.spawn_agent`），展示子代理数量/失败数 + Markdown 输出。`multi-agent` / `long-term-memory` **均无测试文件**。

---

## 方案与权衡

### 决策 1：sidecar 如何支持子代理的一次性 print 模式（核心）

| 方案 | 做法 | 优点 | 缺点 |
|------|------|------|------|
| **A2（推荐）** | 保留现有 `runRpcMode` 入口不变，在 `cli/main.ts` 新增 argv 检测：识别 `-p` / `--mode json\|text` 时构建 runtime 后调 `runPrintMode`，否则维持 `runRpcMode` | 不动已稳定的 Tauri RPC 路径（最高优先：不破坏现有功能）；解析范围受控（参数由我们自己的 runner 生成）；隔离、低风险 | 需手写一小段 argv 解析，与官方 `main` 有少量重复 |
| **A1（备选）** | `cli/main.ts` 直接复用 `main(process.argv.slice(2), { extensionFactories: allExtensions })`，sidecar = 完整 pi CLI | 代码最少；自动支持全部模式/参数；与官方对齐 | 替换已稳定的 RPC 入口；需先验证官方 `main` 是否识别 `--mode rpc`（不确定，pi CLI 可能不公开暴露 rpc 子命令），否则会破坏 Tauri 连接 |

**推荐 A2**：以"不破坏现有 RPC"为第一原则。A1 留作后续优化（需先验证 `--mode rpc` 被官方 `main` 支持）。

### 决策 2：`PI_BIN` 如何解析到 sidecar 自身

- sidecar 是 `bun build --compile` 的单文件 exe；**在该 exe 内 `process.execPath` 指向 exe 自身**。Tauri（生产与 dev）都经 `app.shell().sidecar("pi")` spawn 这个编译产物 → runner 运行其中时 `process.execPath` 即正确的 sidecar 路径。
- **方案**：`runner.ts` / `extractor.ts` 的 fallback 从 `?? "pi"` 改为 `?? process.execPath`（生产/Tauri dev 自包含）；`PI_BIN` env 仍可显式覆盖（纯 node+tsx 调试 sidecar 时用）。
- **Rust 注入 `PI_BIN`（任务 4）降级为可选**：有了 `process.execPath` 兜底后非必需；仍提供显式注入作为保险/可控项，但若实现成本高可跳过（实测 `process.execPath` 生效即可）。

### 决策 3：UI

- `SpawnAgentCard` 已满足基本展示（数量/失败/输出）。
- spec 提的「右面板子代理列表/进度」：子代理是 `await spawnPiAgent` **同步执行**、无中间进度流，做实时进度列表收益低 → **MVP 不做，留作增强**（与 A2 的「步骤卡片」处理一致）。

---

## 文件结构

- 修改 `extensions/multi-agent/runner.ts` — `resolvePiCommand` fallback → `process.execPath`
- 创建 `extensions/multi-agent/runner.test.ts` — 单测 `resolvePiCommand` / `extractFinalText`
- 创建 `extensions/multi-agent/package.json` — `pi-multi-agent`（若不存在；供独立 vitest）
- 修改 `extensions/long-term-memory/extractor.ts` — `resolvePiCommand` fallback → `process.execPath`
- 创建 `extensions/long-term-memory/extractor.test.ts` — 单测 `resolvePiCommand` / `parseExtracted`
- 修改 `cli/src/main.ts` — argv 解析 + `runPrintMode` 分支（保留 `runRpcMode`）
- 创建 `cli/src/args.ts` + `cli/src/args.test.ts` — 纯函数 `parseSidecarArgs` 可单测
- 修改 `tauri-agent/src/features/settings/settingsSchema.ts` — 「子代理」分类加 `PI_BIN`
- （可选）修改 `tauri-agent/src-tauri/src/pi/sidecar.rs` — 注入 `PI_BIN`
- 重建 sidecar + 端到端冒烟验证

---

## 任务 1：runner / extractor 的 PI_BIN fallback → process.execPath（+ 单测）

**文件：** `extensions/multi-agent/runner.ts`、`extensions/multi-agent/runner.test.ts`、`extensions/multi-agent/package.json`、`extensions/long-term-memory/extractor.ts`、`extensions/long-term-memory/extractor.test.ts`

- [ ] **步骤 1：先读现状** — 确认 `multi-agent` / `long-term-memory` 是否已有 `package.json`（缺则按 `plan-mode/package.json` 同构创建，name 分别 `pi-multi-agent` / 现有 LTM 名）。
- [ ] **步骤 2：写失败测试** `runner.test.ts`

```ts
import { afterEach, describe, expect, it } from "vitest";
import { extractFinalText, resolvePiCommand } from "./runner.js";

const orig = process.env.PI_BIN;
afterEach(() => { if (orig === undefined) delete process.env.PI_BIN; else process.env.PI_BIN = orig; });

describe("resolvePiCommand", () => {
  it("prefers PI_BIN when set", () => {
    process.env.PI_BIN = "/custom/pi";
    expect(resolvePiCommand().cmd).toBe("/custom/pi");
  });
  it("falls back to the current executable (sidecar self), not bare 'pi'", () => {
    delete process.env.PI_BIN;
    expect(resolvePiCommand().cmd).toBe(process.execPath);
  });
});

describe("extractFinalText", () => {
  it("returns the last assistant text from JSONL", () => {
    const jsonl = [
      JSON.stringify({ role: "assistant", content: "first" }),
      JSON.stringify({ message: { role: "assistant", content: [{ type: "text", text: "final answer" }] } }),
    ].join("\n");
    expect(extractFinalText(jsonl)).toBe("final answer");
  });
});
```

- [ ] **步骤 3：运行确认失败** — `cd extensions/multi-agent && & "../../tauri-agent/node_modules/.bin/vitest.CMD" run` → FAIL（fallback 仍是 `"pi"`）
- [ ] **步骤 4：实现** — `runner.ts` 改：

```ts
export function resolvePiCommand(): { cmd: string; baseArgs: string[] } {
  // PI_BIN 显式覆盖；否则复用当前 sidecar 可执行文件本体（bun --compile 下即自身）。
  const piBin = process.env.PI_BIN;
  if (piBin) return { cmd: piBin, baseArgs: [] };
  return { cmd: process.execPath, baseArgs: [] };
}
```

- [ ] **步骤 5：extractor.ts 同改 + 测试** `extractor.test.ts`（`resolvePiCommand()` → `process.env.PI_BIN ?? process.execPath`；测 `parseExtracted` 去编号/裁剪逻辑）
- [ ] **步骤 6：运行确认通过**
- [ ] **步骤 7：Commit** — `feat(multi-agent): resolve sub-agent binary to sidecar self via process.execPath (A3)`

---

## 任务 2：cli/main.ts 支持 print 模式（核心，方案 A2）

**文件：** `cli/src/args.ts`、`cli/src/args.test.ts`、`cli/src/main.ts`

- [ ] **步骤 1：写失败测试** `cli/src/args.test.ts` — 纯函数 `parseSidecarArgs`

```ts
import { describe, expect, it } from "vitest";
import { parseSidecarArgs } from "./args.js";

describe("parseSidecarArgs", () => {
  it("defaults to rpc mode", () => {
    expect(parseSidecarArgs(["--mode", "rpc"]).kind).toBe("rpc");
    expect(parseSidecarArgs([]).kind).toBe("rpc");
  });
  it("detects json print mode with a task", () => {
    const r = parseSidecarArgs(["--mode", "json", "-p", "--no-session", "do the thing"]);
    expect(r).toMatchObject({ kind: "print", printMode: "json", task: "do the thing" });
  });
  it("detects text print mode via -p only", () => {
    expect(parseSidecarArgs(["-p", "hello"])).toMatchObject({ kind: "print", printMode: "text", task: "hello" });
  });
  it("ignores --model value when picking the task", () => {
    const r = parseSidecarArgs(["--mode", "json", "-p", "--model", "gpt-x", "the task"]);
    expect(r).toMatchObject({ kind: "print", task: "the task" });
  });
});
```

- [ ] **步骤 2：实现** `cli/src/args.ts`

```ts
export type SidecarArgs =
  | { kind: "rpc" }
  | { kind: "print"; printMode: "text" | "json"; task: string; model?: string };

// 仅需解析我们自己的 runner/extractor 生成的参数：
//   --mode rpc | --mode json|text | -p | --no-session | --model <m> | <task>
const FLAGS_WITH_VALUE = new Set(["--model", "--mode"]);

export function parseSidecarArgs(argv: string[]): SidecarArgs {
  let print = false;
  let printMode: "text" | "json" = "text";
  let model: string | undefined;
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-p" || a === "--print") { print = true; continue; }
    if (a === "--mode") {
      const v = argv[++i];
      if (v === "rpc") return { kind: "rpc" };
      if (v === "json") { print = true; printMode = "json"; }
      else if (v === "text") { print = true; printMode = "text"; }
      continue;
    }
    if (a === "--model") { model = argv[++i]; continue; }
    if (a === "--no-session") continue;
    if (a.startsWith("-")) { if (FLAGS_WITH_VALUE.has(a)) i++; continue; }
    positionals.push(a);
  }

  if (!print) return { kind: "rpc" };
  return { kind: "print", printMode, task: positionals.join(" ").trim(), model };
}
```

- [ ] **步骤 3：运行确认通过** — `cd cli && npx vitest run`（或用 tauri-agent vitest.CMD；cli 暂无 vitest，按需加 devDep 或复用）
- [ ] **步骤 4：接线 `cli/src/main.ts`** — 保留 `runRpcMode`，新增 print 分支：

```ts
import { /* ...现有... */ runPrintMode } from "@earendil-works/pi-coding-agent";
import { parseSidecarArgs } from "./args.js";

async function main(): Promise<void> {
  const cwd = process.cwd();
  const args = parseSidecarArgs(process.argv.slice(2));
  const runtime = await createAgentSessionRuntime(createRuntime, {
    cwd, agentDir: getAgentDir(), sessionManager: SessionManager.create(cwd),
  });
  if (args.kind === "print") {
    const code = await runPrintMode(runtime, { mode: args.printMode, initialMessage: args.task });
    process.exit(code);
  }
  await runRpcMode(runtime);
}
```

> 注：`--model` MVP 暂不接（runtime 用 sidecar 默认 model；`spawn_agent` 的 model 参数为可选，绝大多数调用不传）。如需支持，后续在创建 runtime 时按 args.model 选 model。`--no-session` 在 print 模式天然单次，不额外持久化处理（MVP）。

- [ ] **步骤 5：typecheck** — `cd cli && npm run typecheck`（tsc --noEmit）→ 0
- [ ] **步骤 6：Commit** — `feat(sidecar): support single-shot print/json mode for sub-agents (A3)`

---

## 任务 3：settingsSchema 加 PI_BIN 字段

**文件：** `tauri-agent/src/features/settings/settingsSchema.ts`（如有 `settingsSchema.test.ts` 一并更新）

- [ ] **步骤 1**：在 `id: 'web'`（「网页抓取 / 子代理」）分类的 `fields` 增加：

```ts
{ key: 'PI_BIN', label: '子代理可执行文件（留空＝复用本体）', type: 'text', placeholder: '默认：sidecar 自身' },
```

- [ ] **步骤 2**：若存在 settings 相关测试/快照，跑一次确保通过；否则跳过。
- [ ] **步骤 3：Commit** — `feat(settings): expose PI_BIN override for sub-agent binary (A3)`

---

## 任务 4（可选）：sidecar.rs 注入 PI_BIN（显式保险）

**文件：** `tauri-agent/src-tauri/src/pi/sidecar.rs`

> 前置判断：先做完任务 5 的端到端冒烟。若 `process.execPath` 兜底已让子代理跑通，本任务可**跳过**（YAGNI）。仅当需要显式可控 / dev 调试一致性时实现。

- [ ] **步骤 1**：在 `spawn_pi_client` 解析 sidecar 自身路径，spawn 前 `.env("PI_BIN", <path>)`（仅当调用方未在 `env` 里提供 `PI_BIN` 时）。开发期路径＝`pi_package_dir()` 旁的 `pi-<triple>.exe`；生产期＝主 exe 同目录。
- [ ] **步骤 2**：`cargo test` / `cargo check` 通过。
- [ ] **步骤 3：Commit** — `feat(sidecar): inject PI_BIN pointing at sidecar binary (A3)`

---

## 任务 5：重建 sidecar + 端到端冒烟验证

- [ ] **步骤 1：重建** — 先确认无 GrenAgent 进程占用 exe，`cd tauri-agent && node scripts/build-sidecar.mjs` → `GrenAgent sidecar ready`，无 `Could not resolve`。
- [ ] **步骤 2：验证 RPC 未回归** — 确认 sidecar 默认（无 print 参数）仍进 RPC 模式（启动 GrenAgent 冒烟，或对二进制发一条 RPC JSONL 看响应）。
- [ ] **步骤 3：验证 print 模式** — 直接运行编译产物：
  `& "src-tauri/binaries/pi-x86_64-pc-windows-msvc.exe" --mode json -p --no-session "say hi in one word"`
  预期：输出 JSONL 事件流并退出（exit 0），而非挂起等待 stdin。
- [ ] **步骤 4：验证子代理链路** — 在 GrenAgent 内触发 `spawn_agent`（或设 `MEMORY_EXTRACT=1`），确认子进程用 sidecar 自身、返回结果，`SpawnAgentCard` 正常渲染。
- [ ] **步骤 5：Commit（如有构建产物外的改动）** + 勾选本计划复选框。

---

## 自检

**规格覆盖度（对照 spec §4.6）：**
- 修 runner spawn 用 `PI_BIN` → 任务 1（已有 PI_BIN，补 `process.execPath` 兜底）✅
- sidecar.rs 注入 `PI_BIN` → 任务 4（降级为可选；`process.execPath` 兜底）✅/⚠️
- `settingsSchema` 加 `PI_BIN` → 任务 3 ✅
- 修 `long-term-memory/extractor.ts` spawn 路径 → 任务 1 ✅
- `SpawnAgentCard` + 右面板子代理列表 → SpawnAgentCard 已有 ✅；右面板进度 = ⚠️ MVP 未含（同步执行无中间进度，留作增强）
- **【spec 未覆盖但必须做】sidecar 支持 print 模式** → 任务 2（核心）✅

**风险：**
- 任务 2 改 `cli/main.ts` 入口：必须验证 RPC 未回归（任务 5 步骤 2）。
- `process.execPath`：仅在 compiled sidecar 下＝自身；纯 node+tsx dev 调试需手设 `PI_BIN`（任务 1 注释说明）。
- OneDrive 路径含空格：spawn 时 `cmd` 作为单一 argv（非 shell 拼接），`node:child_process` 不经 shell，安全。
