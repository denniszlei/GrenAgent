# 侧边栏 / 会话列表重设计规格说明

**日期**: 2026-06-13
**状态**: 待审查
**作者**: Cursor (Claude Opus 4.8)
**方向**: C · Codex 完整架构（跨项目 + 项目分组）

## 执行摘要

当前侧边栏（`src/features/sessions/SessionList.tsx`）是单层扁平 `List`，只显示**当前工作区**的会话（`name + timestamp`），无分组、无搜索、无操作菜单、无状态指示。

本设计将其重构为 **Codex 风格的跨项目侧边栏**：顶部动作区 + 置顶区 + 项目分组区（按 `cwd` 分组，当前项目优先展开）+ 底部。每个项目/会话行支持 hover 出 `...` 下拉菜单与"在此项目新建会话"快捷键，仅当前活跃会话显示运行状态。

视觉与图标 100% 对齐 lobehub（lucide-react 图标、antd-style token、`NavItem` 式行结构）。

### 核心目标
1. **跨项目浏览**：一处看到所有项目（`cwd`）及其会话，不再局限当前工作区
2. **信息架构清晰**：顶部动作 / 置顶 / 项目三段式，当前项目优先
3. **操作完整**：置顶、重命名、删除、在资源管理器/终端打开，经 `...` 菜单与右键菜单
4. **轻量状态**：仅当前活跃会话显示运行态，零额外持久化成本
5. **风格统一**：复用 lobe token 与 lucide 图标，跟随亮/暗主题

## 关键事实（来自源码核查）

### 后端数据模型 (`src-tauri/src/commands/sessions.rs`)
```rust
pub struct SessionInfo { id, path, cwd, timestamp, name }
```
- `path` = 会话 `.jsonl` 日志文件绝对路径（非项目目录）
- `cwd` = 会话绑定的工作目录 = **"项目"**
- pi 在 `~/.pi/agent/sessions/<cwd-hash>/<id>.jsonl` 下**本就按项目分目录**存储
- `collect_session_files` 已递归扫描所有项目；`list_pi_sessions` 仅做了 `cwd == workspace` 的过滤

### 现有可复用的 IPC（`src/lib/pi.ts` / `src-tauri`）
| 能力 | 命令 | 现状 |
|------|------|------|
| 列出会话 | `list_pi_sessions(workspace)` | 有，但按 cwd 过滤 |
| 打开工作区 | `open_workspace(workspace)` | 有，支持绝对路径 cwd |
| 切换会话 | `agent_switch_session(workspace, sessionPath)` | 有 |
| 新建会话 | `agent_new_session(workspace)` | 有 |
| 删除会话 | `delete_pi_session(workspace, sessionPath)` | 有 |
| 重命名会话 | `agent_set_session_name(workspace, name)` | **后端有，前端未绑定** |

### 活跃状态来源 (`src/stores/agent.ts`)
- 每个 workspace 有独立 agent store，`isStreaming` 标识该会话是否在跑
- `onPiEvent`/`onPiExit` 按 `workspace` 区分 → 天然支持"仅当前活跃会话显示运行态"

## 设计决策（头脑风暴确认）

| # | 决策 | 选择 |
|---|------|------|
| Q1 | 大方向 | **C** 跨项目 + 项目分组 |
| Q2 | 项目区填充 | **②** 当前项目优先展开 + 其余按最近活跃折叠 + 置顶区 |
| Q3 | 状态指示 | **(b)** 仅当前活跃会话运行态（运行中/等待人工），不做全量历史状态 |
| - | 置顶 | 项目 + 会话两级，前端 localStorage 持久化，**无图钉前缀**（仅归入"置顶"区） |
| - | 操作入口 | hover/聚焦行出 `SquarePen`(新建) + `MoreHorizontal`(⋯ 菜单)；右键 = 同一套菜单 |
| - | 会话行 | **无 `#`(Hash) 前缀图标**，仅标题（+ 活跃时运行图标） |
| - | 重命名 | 内联编辑（`agent_set_session_name`） |

## 架构设计

### 信息架构（从上到下）
```
┌─ Pi Agent（标题栏，复用现有 Titlebar / PanelHeader）
├─ 动作区
│   • 新建会话      MessageSquarePlus
│   • 搜索会话      Search（点开变输入框，按标题 + 项目名过滤）
├─ 置顶（SECTION，被 pin 的项目/会话；空则不渲染该区）
│   • <项目行> / <会话行>
├─ 项目（SECTION）
│   • 当前项目（FolderOpen，默认展开，"当前"徽标）
│       ├ 会话行…（默认最近 5 条）
│       └ 查看全部 N 条  ChevronDown（N = 该项目会话总数；≤5 条时不显示此行）
│   • 其它项目（FolderClosed，折叠，按最近活跃倒序）
└─ 底部
    • 设置 Settings    • 主题 Sun/Moon（复用现有切换）
```

### 组件拆分（`src/features/sessions/`）
| 组件 | 职责 | 依赖 |
|------|------|------|
| `Sidebar.tsx` | 顶层容器：动作区 + 滚动区 + 底部；组装下列子组件 | layoutStore, themeStore |
| `SidebarActions.tsx` | 新建 / 搜索入口 | - |
| `SearchBox.tsx` | 搜索输入 + 过滤态 | useSessionStore（搜索关键字） |
| `ProjectGroup.tsx` | 单个项目折叠组：项目头 + 会话列表 + 查看全部 | - |
| `ProjectItem.tsx` | 项目头行：折叠箭头 + 文件夹图标 + 名称 + 徽标 + hover 操作 | useProjectMenu |
| `SessionItem.tsx` | 会话行：标题 + 活跃运行态 + hover 操作；内联重命名 | useSessionMenu |
| `RowActions.tsx` | 行尾 `SquarePen` + `MoreHorizontal` 通用操作区 | - |
| `useProjectMenu.ts` | 项目下拉/右键菜单项构造 | - |
| `useSessionMenu.ts` | 会话下拉/右键菜单项构造 | - |

每个单元职责单一、可独立测试。`Sidebar` 只负责布局组装，业务逻辑下沉到 hooks 与 store。

### 数据层
两个 store 职责分离：**持久化偏好** 用新建的 `sidebarPrefsStore`（persist）；**运行时 UI 态** 扩展现有 `useSessionStore`（`src/store/session.ts`，不持久化）。

| 单元 | 职责 |
|------|------|
| `list_all_sessions`（新增 Rust 命令） | 复用 `collect_session_files`，**不按 cwd 过滤**，返回全部 `SessionInfo`；前端按 `cwd` 分组 |
| `pi.setSessionName`（新增前端绑定） | 调 `agent_set_session_name` |
| `useProjectGroups.ts`（新增 hook） | 把 `SessionInfo[]` 按 `cwd` 聚合成项目组 + 各组按 timestamp 排序 + 项目按最近活跃排序 |
| `sidebarPrefsStore.ts`（新增，**persist**，key `pi-sidebar`） | 置顶项目/会话 id 集合、项目别名、隐藏项目、各项目组展开态 |
| `useSessionStore` 扩展（**不持久化**，运行时态） | 新增 `activeWorkspace`（替代常量 `WORKSPACE`）、`searchKeyword`；保留现有 `sessions` / `activeSessionPath` |

### 菜单项（lucide 图标）
**项目菜单**（`useProjectMenu`）：
- 置顶 / 取消置顶 `Pin` / `PinOff`
- 在资源管理器中打开 `FolderOpen`
- 在终端打开 `SquareTerminal`
- 重命名（别名）`PencilLine`
- 从列表隐藏 `EyeOff`（危险区）

**会话菜单**（`useSessionMenu`）：
- 置顶 / 取消置顶 `Pin` / `PinOff`
- 重命名 `PencilLine`（内联）
- 删除 `Trash2`（危险红）

> "在终端打开"如后端暂无对应命令，则首版置灰或省略，二期补；"从列表隐藏"仅前端 localStorage 标记，不删磁盘文件。

### 跨项目切换流程
点击非当前项目的会话：
```
open_workspace(session.cwd)  →  agent_switch_session(session.cwd, session.path)
  →  loadMessages(force)  →  更新 activeWorkspace + activeSessionPath
```
即把"workspace"从固定 `'.'` 升级为"当前选中项目的 cwd"。需引入 `activeWorkspace` 状态（替代 `App.tsx` 里的常量 `WORKSPACE`）。

**利好（源码核查）**：`AgentStoreProvider`（`src/stores/AgentStoreContext.tsx`）已实现 "`workspace` 变化时 `useMemo` 重建 store、旧 store 自动 `destroy` 取消订阅"。因此只需把 `<AgentStoreProvider workspace={activeWorkspace}>` 的 prop 接上状态，切项目时 agent store 会自动重建并重新订阅新 cwd 的 `pi://event`，无需手动管理多 store 生命周期。`activeWorkspace` 放在扩展后的 `useSessionStore`（见数据层）。

## 状态指示（仅活跃会话）
- 当前活跃 workspace + 该会话且 `isStreaming` → `LoaderCircle`（金色旋转）
- pi 上报 `waitingForHuman` 类 UI 请求挂起 → `Hand` 图标
- 其余会话**不显示**任何状态图标（零持久化）

## 数据流
```
list_all_sessions (Rust)
  → useProjectGroups: 按 cwd 分组 + 排序
  → 叠加 sidebarPrefsStore（置顶/别名/隐藏/展开）
  → Sidebar 渲染（置顶区 + 项目区）
  → 点击会话 → open_workspace(cwd) + switch_session(path) → agent store loadMessages
  → 活跃会话运行态由对应 workspace 的 isStreaming 驱动
```

## 错误处理
- `list_all_sessions` 失败 → 顶部 inline 错误 + 重试；不清空已有列表
- 跨项目 `open_workspace` 失败 → Toast 报错，保持当前会话不变
- 删除失败 → Toast，保留行
- 重命名空值 → 回退原名，不调用后端
- localStorage 读取失败 → 回退默认（无置顶/无别名/全部展开）

## 测试策略
- `useProjectGroups`：分组、排序（最近活跃）、当前项目置顶逻辑 — 单元测试
- `sidebarPrefsStore`：置顶增删、别名、隐藏、持久化 round-trip — 单元测试
- `useSessionMenu` / `useProjectMenu`：菜单项随置顶态切换 — 单元测试
- `SessionItem`：活跃态渲染运行图标、hover 出操作、内联重命名提交/取消 — 组件测试
- 跨项目切换：mock pi，验证 open_workspace + switch_session 调用顺序 — 集成测试

## 范围边界（YAGNI）
- **不做**：全量历史会话状态（完成/失败）解析、会话拖拽排序、多选批量操作、项目颜色标签
- **首版可降级**：搜索可先做纯标题/项目名前端过滤（不接后端全文搜索）；"在终端打开"可二期

## 复用的 lobehub 模式
- `NavItem` 行结构（icon + title + 第二行 + actions + active + contextMenu）
- `Actions` + `dropdownMenu`（hover 出 `MoreHorizontal`，点开下拉）
- 时间/项目分组思路（lobehub `TopicListContent` 的 ByTimeMode/ByProjectMode）
- 运行/等待状态图标（lobehub `Topic/List/Item`：`LoaderCircle` / `Hand`）

## 涉及文件
**新增**：
- `src/features/sessions/{Sidebar,SidebarActions,SearchBox,ProjectGroup,ProjectItem,SessionItem,RowActions}.tsx`
- `src/features/sessions/{useProjectMenu,useSessionMenu,useProjectGroups}.ts`
- `src/stores/sidebarPrefsStore.ts`
- `src-tauri/src/commands/sessions.rs` 内新增 `list_all_sessions`

**修改**：
- `src/App.tsx`：`WORKSPACE` 常量 → `activeWorkspace` 状态；接 Sidebar
- `src/lib/pi.ts`：新增 `listAllSessions`、`setSessionName` 绑定
- `src/store/session.ts`：扩展为多项目模型（或保留 + 新增 store）
- `src-tauri/src/lib.rs`：注册 `list_all_sessions`
- 旧 `SessionList.tsx`：被 `Sidebar.tsx` 取代（删除）
