# 通用可停靠 Tab 容器（Dock）设计规格 — 阶段 1 地基

> **面向 AI 代理：** 这是设计规格（spec）。下一步用 `superpowers:writing-plans` 产出实现计划，再用 `superpowers:executing-plans` 内联执行（本仓库**禁止子代理**）。

**目标：** 将右侧面板与底部终端统一为 **Codex/VS Code 风格的通用 Tab 容器系统**——共享 tab 条、＋菜单、关闭、同坞重排与跨坞互拖；阶段 1 接入已有三种内容（终端 / 网页 fetch_url / 子代理），并为后续文件浏览、diff、侧边聊天预留扩展位。

**架构（方案 C）：** 引入 `dockStore` 统一管理 tab 列表与激活态；**终端 tab 钉在 Bottom Dock、不可跨坞移动**；page / subagent 可在 Right ↔ Bottom 间自由移动。外壳布局（`RightPanelShell` / `TerminalShell`）不变。

**技术栈：** React/TypeScript + zustand（persist）+ `@dnd-kit/*`（已用于终端 tab 重排）+ `@lobehub/ui` + antd-style。

---

## 1. 背景与现状

### 1.1 布局（`App.tsx`）

```
┌────────┬──────────────────────────────┬────────┐
│ Sidebar│         Main Chat            │ Right  │
│        │                              │ Dock   │
│        ├──────────────────────────────┤        │
│        │         Bottom Dock          │        │
└────────┴──────────────────────────────┴────────┘
```

- **Right Dock**：`RightPanelShell`（可折叠、可拖拽调宽）
- **Bottom Dock**：`TerminalShell`（可折叠、可拖拽调高），横跨 Main + Right 列宽

### 1.2 现有实现问题

| 模块 | 现状 | 问题 |
|------|------|------|
| `RightPanel.tsx` | 从 messages 派生 subagent tab + `rightPanelStore` 的 page tab | tab 状态分裂；无重排；无 ＋；不可跨坞 |
| `TerminalPanel.tsx` | 本地 `useState(tabs)` + xterm ref map + dnd-kit 同坞重排 | 与右栏重复 tab 条样式；状态未统一 |
| `rightPanelStore.ts` | 仅 page tab | 无法表达 region / kind / 顺序 |
| `features/dock/DockPanel.tsx` | 未接线旧壳 | 应删除或合并 |

### 1.3 已统一的基础

- 各列 header 高度 **44px**（`PanelHeader.HEADER_HEIGHT`）
- Right / Terminal tab 条视觉已对齐（28px tab、elevated header）
- `@dnd-kit/core` + `@dnd-kit/sortable` 已在 `TerminalPanel` 使用

---

## 2. 范围与分阶段

### 2.1 用户确认的 tab 类型（全量愿景）

| kind | 阶段 | 说明 |
|------|------|------|
| `terminal` | **1** | 已有 |
| `page` | **1** | fetch_url 抓取页，已有 |
| `subagent` | **1** | spawn_agent 对话，已有 |
| `file` | 2 | 文件树 + 查看器，新增 |
| `diff` | 3 | 代码审查，新增 |
| `sidechat` | 4 | 侧边聊天，新增 |

**本文档仅覆盖阶段 1（地基 + 已有 3 种 kind）。**

### 2.2 非目标（阶段 1 YAGNI）

- 终端跨坞移动（方案 B 完整可停靠，留待日后）
- 悬浮 / 弹出独立窗口
- tab 右键菜单（重命名、复制等）
- file / diff / sidechat 的具体 UI（仅预留 kind 与注册表扩展位）
- 修改 pi sidecar / Rust 后端

---

## 3. 核心概念

### 3.1 DockRegion

```typescript
type DockRegion = 'right' | 'bottom';
```

- `right`：右侧可折叠列（`RightPanelShell`）
- `bottom`：底部可折叠列（`TerminalShell`）

### 3.2 DockTabKind（阶段 1）

```typescript
type DockTabKind = 'terminal' | 'page' | 'subagent';
// 后续：| 'file' | 'diff' | 'sidechat'
```

### 3.3 DockTab

```typescript
interface DockTab {
  id: string;
  kind: DockTabKind;
  region: DockRegion;
  title: string;
  closable: boolean;
  order: number; // 同 region 内排序
  payload: TerminalPayload | PagePayload | SubAgentPayload;
}

interface TerminalPayload {
  shellId?: string; // 运行时，不 persist
  status: 'idle' | 'starting' | 'running' | 'exited' | 'error';
}

interface PagePayload {
  url: string;
  content: string;
  title?: string;
  chars?: number;
  crawler?: string;
}

interface SubAgentPayload {
  messageId: string; // 对应 tool message id
  toolCallId: string;
}
```

### 3.4 Kind 规则矩阵

| kind | 默认 region | 可跨坞 | closable | 打开方式 |
|------|-------------|--------|----------|----------|
| `terminal` | `bottom` | ❌ | ✅ | Bottom ＋ 菜单 |
| `page` | `right` | ✅ | ✅ | fetch_url 卡片点击 |
| `subagent` | `right` | ✅ | ❌ | spawn_agent 消息自动注册 |

---

## 4. 状态管理：`dockStore`

新建 `tauri-agent/src/stores/dockStore.ts`，**替代** `rightPanelStore.ts`。

### 4.1 State

```typescript
interface DockState {
  tabs: DockTab[];
  activeByRegion: Record<DockRegion, string | null>;

  // actions
  addTab: (input: Omit<DockTab, 'order'> & { order?: number }) => void;
  closeTab: (id: string) => void;
  setActive: (region: DockRegion, id: string) => void;
  reorderTabs: (region: DockRegion, fromIndex: number, toIndex: number) => void;
  moveTabRegion: (id: string, targetRegion: DockRegion, insertIndex?: number) => void;
  openPage: (page: PageView) => void; // 兼容现有 API
  syncSubAgentTabs: (messages: ChatMessage[]) => void;
}
```

### 4.2 行为细则

- **`openPage`**：id = `page:${url}`；同 URL 更新 payload 而非重复；`region: 'right'`；自动 `setActive('right', id)` + `layoutStore.setRightPanelOpen(true)`
- **`closeTab`**：若关闭 active tab，激活同 region 内相邻 tab（优先左侧 index-1）
- **`moveTabRegion`**：拒绝 `kind === 'terminal'` 且 `targetRegion === 'right'`；移动后更新 `order` 并激活；自动展开目标 region 的 shell
- **`syncSubAgentTabs`**：扫描 `kind === 'tool' && toolName === 'spawn_agent'`；新增缺失 tab；移除已不在 messages 中的 subagent tab；不关闭用户手动激活态以外的逻辑由 store 统一处理
- **persist**：保存 `tabs`（strip terminal 的 runtime shellId）、`activeByRegion`；key：`hermes-dock`

### 4.3 与 layoutStore 协作

| 事件 | layoutStore 动作 |
|------|------------------|
| 打开 right region 内首个 tab | `setRightPanelOpen(true)` |
| 打开 bottom region 内 terminal | `setTerminalOpen(true)` |
| 跨坞移动到 right | `setRightPanelOpen(true)` |
| 跨坞移动到 bottom | `setTerminalOpen(true)` |

折叠 shell **不**自动关闭 tab；再次展开恢复上次 active。

---

## 5. 组件架构

### 5.1 组件树

```
App Workspace (chat column)
└─ DockDndProvider          // 单一 DndContext，包裹 Right + Bottom
     ├─ RightPanelShell
     │    └─ DockPanel region="right"
     │         ├─ TabStrip
     │         └─ TabBodyStack
     └─ TerminalShell
          └─ DockPanel region="bottom"
               ├─ TabStrip
               └─ TabBodyStack
```

### 5.2 文件规划

| 文件 | 职责 |
|------|------|
| `stores/dockStore.ts` | 统一 tab 状态 |
| `stores/dockStore.test.ts` | store 单元测试 |
| `features/dock/DockPanel.tsx` | region 入口：TabStrip + TabBodyStack |
| `features/dock/TabStrip.tsx` | 共享 tab 条（dnd、＋、折叠） |
| `features/dock/SortableDockTab.tsx` | 单个可排序 tab |
| `features/dock/TabBodyStack.tsx` | keep-alive 渲染所有 tab body |
| `features/dock/TabBodyRenderer.tsx` | 按 kind 分发 |
| `features/dock/DockDndProvider.tsx` | App 级 DndContext + DragOverlay |
| `features/dock/TerminalBody.tsx` | 从 TerminalPanel 拆出的 xterm 生命周期 |
| `features/dock/dockTabStyles.ts` | 共享 tab 样式（从 Right/Terminal 合并） |

**废弃/薄包装：**

- 删除 `stores/rightPanelStore.ts`（调用方改 import `dockStore`）
- 删除旧 `features/dock/DockPanel.tsx`（未接线版）并替换为新实现
- `RightPanel.tsx` → 导出 `<DockPanel region="right" onCollapse={...} />` 或直接在 `App.tsx` 引用 `DockPanel`
- `TerminalPanel.tsx` → 同上 `region="bottom"`

### 5.3 TabStrip UI

与现有 terminal/right 对齐：

- Header：44px，`colorBgElevated`，底边框
- Tab：28px 高，max-width 180px，ellipsis 标题
- 图标：terminal/subagent → 状态点（success/warning/error）；page → Globe 12px
- 关闭：terminal/page 显示 ×；subagent 用 spacer 对齐
- 右侧：＋ ActionIcon；right dock 另有折叠 ActionIcon（`PanelRightClose`）
- 空 tab 列表：TabBody 区显示引导文案

### 5.4 ＋菜单

| region | 阶段 1 菜单项 |
|--------|---------------|
| `bottom` | 新建终端 |
| `right` | 占位提示（「从 fetch_url 卡片或 spawn_agent 打开」）；阶段 2+ 扩展 file/diff/sidechat |

### 5.5 TabBody keep-alive

```tsx
tabs.filter(t => t.region === region).map(tab => (
  <div key={tab.id} hidden={tab.id !== activeId}>
    <TabBodyRenderer tab={tab} />
  </div>
))
```

- **TerminalBody**：xterm + FitAddon + shell 绑定逻辑从现 `TerminalPanel` 迁移；ref map keyed by tab.id
- **Page**：复用 `PageContentViewer`
- **SubAgent**：复用 `SubAgentConversation`；payload 仅存 id，渲染时从 messages 取最新 result/status

---

## 6. 拖拽交互

### 6.1 DndContext 范围

- 放在 chat 列内，**同时包裹** Right Dock 与 Bottom Dock 的 `TabStrip`
- 复用 terminal 现有：`PointerSensor` distance 6、`closestCenter`、`restrictToWindowBelowTitlebar` modifier
- `DragOverlay` portal 到 `document.body`，内联 `useTheme()` 色值（避免 cssVar 脱离主题容器）

### 6.2 Droppable 目标

| id | 含义 |
|----|------|
| `dock:right` | 右坞 tab 条（含空白区） |
| `dock:bottom` | 底坞 tab 条 |
| 各 tab.id | 插入到该 tab 位置 |

### 6.3 规则

| 操作 | 行为 |
|------|------|
| 同 region 重排 | `arrayMove` → `dockStore.reorderTabs` |
| page/subagent 跨 region | `dockStore.moveTabRegion` |
| terminal 拖向 right | `onDragEnd` 忽略，视觉弹回 |
| terminal 仅在 bottom 内重排 | 允许 |
| 跨 region 成功后 | 激活 moved tab + 展开目标 shell |

---

## 7. 数据流

```
fetch_url 卡片 ──openPage()──► dockStore ──► Right Dock TabBody
spawn_agent 消息 ──syncSubAgentTabs()──► dockStore ──► Right Dock
Bottom ＋ ──addTab(terminal)──► dockStore ──► TerminalBody (lazy start shell)
layoutStore ◄── openTab / moveTabRegion ── dockStore
```

**调用方迁移：**

- `extensionCards.tsx`：`useRightPanelStore` → `useDockStore`
- `SubAgentInline.tsx` / `ChatMessageItems.tsx`：打开 subagent tab → `dockStore.setActive('right', messageId)`

---

## 8. 错误处理与边界

| 场景 | 处理 |
|------|------|
| 关闭最后一个 terminal | 允许；显示 bottom 空状态；不强制 `terminalOpen=false` |
| workspace 切换 | dispose 所有 terminal shell/xterm；清空 terminal tabs 或重置为 1 个 idle tab；page tab 保留结构；subagent 由 sync 重建 |
| persist 恢复 terminal tab | 无 shellId；首次激活时 `startTab` |
| 同 URL 重复 openPage | 更新 content，不新增 tab |
| subagent 消息删除 | sync 移除 tab；若 active 被删则 fallback 同 region 相邻 tab |
| dnd 取消 | 清除 draggingTabId，不 mutate store |

---

## 9. 实现顺序

| 步 | 内容 | 验证 |
|----|------|------|
| 1 | `dockStore` + 测试 | 单元测试通过 |
| 2 | `TabStrip` + `SortableDockTab` + 样式合并 | 渲染测试 |
| 3 | `DockPanel` + `TabBodyStack` + `TabBodyRenderer` | 空状态、切换 |
| 4 | `TerminalBody` 拆分迁移 | 新建/关闭/切换/fit |
| 5 | 替换 App 中 RightPanel/TerminalPanel | E2E 手动：fetch_url、spawn_agent |
| 6 | `DockDndProvider` + 跨坞互拖 | 手动：page 拖到底部；terminal 不可拖出 |

---

## 10. 测试计划

### 10.1 单元测试（`dockStore.test.ts`）

- `openPage` 去重与 active
- `closeTab` active 回退
- `moveTabRegion` page/subagent 跨坞；terminal 拒绝
- `reorderTabs`
- `syncSubAgentTabs` 增删

### 10.2 组件测试

- `TabStrip`：active 样式、关闭按钮
- `DockPanel`：空状态、region 过滤
- 迁移 `RightPanel.test.tsx` → `DockPanel.test.tsx`

### 10.3 手动清单

1. 两个 terminal tab 切换，回滚保留
2. fetch_url → 右坞 page tab
3. spawn_agent → 右坞 subagent tab，无关闭按钮
4. page tab 拖到底部 → 内容正常
5. subagent tab 在 right/bottom 间互拖
6. terminal 拖向 right 被阻止
7. 折叠/展开右坞与底坞，tab 状态保留
8. 重启应用，tab 列表恢复（terminal 重新 spawn）

---

## 11. 后续阶段接口（预留）

`TabBodyRenderer` 使用 kind 注册表：

```typescript
const BODY_RENDERERS: Record<DockTabKind, ComponentType<{ tab: DockTab }>> = {
  terminal: TerminalBody,
  page: PageBody,
  subagent: SubAgentBody,
  // file: FileBody,      // 阶段 2
  // diff: DiffBody,      // 阶段 3
  // sidechat: SideChatBody, // 阶段 4
};
```

Right Dock ＋菜单在阶段 2+ 仅追加 menu item + payload 类型，**不改动** DockRegion / DndContext / TabStrip 契约。

---

## 12. 决策记录

| 决策 | 选项 | 结论 | 理由 |
|------|------|------|------|
| 架构方案 | A 轻量 / B 完整 / **C 统一+终端钉底** | **C** | 统一模型 + 跨坞互拖，避开 xterm 跨坞 keep-alive 复杂度 |
| 阶段拆分 | 一次全做 / 分阶段 | **分阶段** | 6 种 tab 中 3 种需新建大型 UI |
| 终端跨坞 | 允许 / 禁止 | **禁止（阶段 1）** | 降低风险；日后可升级方案 B |
| subagent 关闭 | 可关 / 不可关 | **不可关** | 与消息生命周期绑定 |
| tab body 策略 | 卸载 / keep-alive | **keep-alive** | 终端 xterm 实例昂贵 |

---

## 13. 相关文件（现状）

- `tauri-agent/src/App.tsx` — 布局组装
- `tauri-agent/src/features/layout/PanelShells.tsx` — Right/Terminal shell
- `tauri-agent/src/features/panels/RightPanel.tsx` — 待替换
- `tauri-agent/src/features/terminal/TerminalPanel.tsx` — 待拆分
- `tauri-agent/src/stores/rightPanelStore.ts` — 待删除
- `tauri-agent/src/stores/layoutStore.ts` — 折叠/尺寸 persist
- `tauri-agent/src/features/tools/extensionCards.tsx` — openPage 调用方

---

**状态：** 设计已定稿（用户确认三节 + write）。下一步 → `writing-plans` 产出 `2026-06-14-dock-tab-container-plan.md`。
