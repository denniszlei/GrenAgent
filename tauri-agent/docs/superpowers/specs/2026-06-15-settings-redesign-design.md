# 设置页视觉重构设计规格 — 分组导航 / 卡片化 / 控件升级

> **面向 AI 代理：** 这是设计规格（spec）。下一步用 `superpowers:writing-plans` 产出实现计划，再用 `superpowers:executing-plans` 内联执行（本仓库**禁止子代理**）。
>
> 配套计划：`docs/superpowers/plans/2026-06-15-settings-redesign-plan.md`（writing-plans 阶段生成）。视觉方向以已确认的 mockup 为准（lobehub 风格：图标分组导航 + 卡片化 + 描述行 + Switch/步进器/下拉）。

**目标：** 把 `tauri-agent` 设置页从「文字分类 + 字段平铺 + inline style」重构为「**图标分组导航 + 卡片化 + 控件升级 + 描述行**」的清爽排版，提升可读性与质感。

**架构原则：** 纯前端渲染层 + schema 增强。**底层 env 存储、`useSettingsForm`、「保存并重启」交互、字段 env key 全部不变。** 改动限于 `src/features/settings/`。

**技术栈：** React 19 + TypeScript + `@lobehub/ui` + `antd`（Switch/Select/InputNumber/Input）+ `antd-style`(createStyles) + `lucide-react`（图标，合 no-emoji 规范）。

---

## 1. 背景与现状

- `SettingsPanel.tsx`：左右分栏（左 160px 纯文字分类、右字段平铺），大量 inline style，无图标/分组/卡片；顶部「保存并重启」按钮。
- `settingsSchema.ts`：8 个 category（`general`/`knowledge`/`memory`/`image`/`tts`/`web`/`mcp`/`safety`）+ `CONNECTION_FIELDS`。`SettingField` 仅 `key/label/type/placeholder`，长说明硬塞在 `label`。`FieldType`：`text/password/number/boolean`。
- `SettingField.tsx`：单字段渲染。
- `useSettingsForm.ts`：env 字符串存储（`pi.getSettings/setSettings`）+ 保存后 close/open 重启 sidecar。

**缺口**：无视觉层次（图标/分组/卡片/描述行）、控件朴素（boolean/number 无专用控件）、label 过长难读。

---

## 2. 范围

### 2.1 覆盖
- 导航：8 category 各加 `group` + `icon`，按 4 大组渲染分组标题。
- schema 增强：`SettingCategory` 加 `group`/`icon`/可选 `sections`；`SettingField` 加 `description`；`FieldType` 扩展 `select`（带 `options`）。
- 控件升级：Switch / InputNumber / Select / Input(Password)。
- 卡片化：category 可选 `sections`（每 section 一张卡）。
- 组件重写：`SettingsPanel` / `SettingField` + 新增 `SettingCard`，用 `antd-style` 替代 inline style。

### 2.2 非目标（YAGNI）
- 不改 env 存储 / `useSettingsForm` / 「保存并重启」交互 / 字段 env key。
- 不拆 `web` category、不把 `CONNECTION_FIELDS`(im-gateway) 并入设置页。
- 不动其它面板（`ExtensionsPanel` 等）。
- 不加即时保存 / 富 slider / segmented（基线范围之外）。

---

## 3. 导航分组映射

8 个 category 保持不变，新增 `group` 归类 + `icon`（lucide-react）：

| group（大分组） | category | id | 图标 |
|------|----------|----|----|
| 核心 | 通用与模型 | general | `Settings2` |
| 能力 | 知识库 | knowledge | `BookOpen` |
| 能力 | 记忆 | memory | `Brain` |
| 能力 | 图像生成 | image | `Image` |
| 能力 | 语音 TTS | tts | `AudioLines` |
| 联网 | 网页/搜索/子代理 | web | `Globe` |
| 扩展与安全 | MCP 服务器 | mcp | `Boxes` |
| 扩展与安全 | 安全 | safety | `ShieldCheck` |

导航按 `group` 顺序（核心 → 能力 → 联网 → 扩展与安全）渲染：每组一个灰色小字标题，下面是该组的 category 项（图标 + 标题，选中态：高亮竖条 + 浅底块）。

---

## 4. schema 增强（`settingsSchema.ts`）

```ts
import type { LucideIcon } from 'lucide-react';

export type FieldType = 'text' | 'password' | 'number' | 'boolean' | 'select';
export type SettingGroup = '核心' | '能力' | '联网' | '扩展与安全';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SettingField {
  key: string; // env 名（不变）
  label: string;
  type: FieldType;
  description?: string; // 从原 label 拆出的说明，渲染为灰字描述行
  placeholder?: string;
  options?: SelectOption[]; // 仅 type === 'select'
}

export interface SettingSection {
  title: string; // 卡片小标题
  fields: SettingField[];
}

export interface SettingCategory {
  id: string;
  title: string;
  group: SettingGroup;
  icon: LucideIcon;
  fields?: SettingField[]; // 无 sections 时整组一张卡
  sections?: SettingSection[]; // 有则每 section 一张卡
}
```

- 每个字段补 `description`（把现在塞 `label` 的「（1/0）」「留空＝…」等说明拆出来），`label` 精简为短名。
- `env key` 一律不变（存储兼容）。

---

## 5. 控件映射（`SettingField.tsx` 重写）

| `type` | 控件 | 读 | 写（落 env 字符串） |
|--------|------|----|----|
| `boolean` | antd `Switch` | `value === '1'` | `'1'` / `'0'` |
| `number` | antd `InputNumber` | `Number(value)` | `String(n)` |
| `select` | antd `Select` | `value` | `option.value` |
| `text` | antd `Input` | `value` | 原样 |
| `password` | antd `Input.Password` | `value` | 原样 |

每行布局：左侧 label(粗体) + description(灰字)，右侧控件，行间分隔。

> boolean 存 `'1'/'0'` 沿用现状（schema 里现有 boolean 字段 label 标注「（1/0）」即印证）。控件层只改展示，不改存储编码。

---

## 6. 卡片分组

- category 有 `sections` → 每个 section 渲染一张 `SettingCard`（卡带 `section.title` 小标题）。
- category 无 `sections`（只有 `fields`）→ 整组渲染一张 `SettingCard`（不显示卡内小标题，页顶已有 category 标题）。
- 示例：`memory` 拆「记忆召回」「记忆维护」两卡：
  - 召回：`MEMORY_AUTO_INJECT` / `MEMORY_AUTO_TOPK` / `MEMORY_AUTO_CAPTURE` / `MEMORY_EMBED_API_KEY` / `MEMORY_EMBED_MODEL`
  - 维护：`MEMORY_SMART` / `MEMORY_MODEL` / `MEMORY_EXTRACT` / `MEMORY_SMART_NOTICE`
- 其余 category 可先不分 section（整组一卡），后续按需补。

---

## 7. 组件结构

- **`SettingsPanel.tsx`（重写）**：`useSettingsForm` + 选中 category state。左导航按 group 渲染（分组标题 + 图标项 + 选中态）；右内容渲染页标题 + 遍历 `sections ?? [{fields}]` 输出 `SettingCard`。
- **`SettingCard.tsx`（新增）**：卡片容器（圆角/边框/内边距 + 可选小标题 + children 行）。
- **`SettingField.tsx`（重写）**：一行（label+description 左 / 控件右），按 `type` 分发控件。
- **样式**：`antd-style` 的 `createStyles`，替换现有 inline style；颜色沿用 `--gren-*` CSS 变量体系。

---

## 8. 不变约束

- `useSettingsForm`（env 读写、close/open 重启）不改。
- 「保存并重启」按钮与流程不改。
- 所有字段 env key 不改（存储完全兼容旧值）。
- boolean='1'/'0'、number=字符串 的存储编码不变。

---

## 9. 测试（vitest + @testing-library/react）

- `SettingsPanel.test.tsx`（更新）：
  - 按 group 渲染分组标题与 category 项；
  - 点击 category 切换右侧内容；
  - 渲染卡片（含 section 标题）；
  - 控件交互：Switch 切换写 `'1'/'0'`、Select 选择写 option.value、InputNumber 改值写字符串；
  - 保存按钮调用 `save`。
- 控件「值↔控件」的编解码（如 boolean `'1'`↔checked）可抽小函数单测，降低组件测试脆弱性。

---

## 10. 决策记录

| 决策 | 选项 | 结论 | 理由 |
|------|------|------|------|
| 范围 | 渲染重写 / +即时保存 / +富控件 | **基线（渲染+schema 增强）** | 聚焦视觉、风险小、增量可控 |
| 存储 | 改结构化 / 保持 env 字符串 | **保持 env 字符串** | 零迁移、完全向后兼容 |
| 保存交互 | 即时保存 / 显式按钮 | **沿用「保存并重启」** | env 改动需重启 sidecar，显式更稳 |
| web 分类 | 拆「搜索/子代理」/ 保持一组 | **保持一组** | 最小改动；mockup 的拆分留待后续 |
| 连接(im-gateway) | 并入 / 保持 ConnectionsPanel | **保持现状** | 超出本次范围 |
| 卡片分组 | 一 category 一卡 / 可选 sections | **可选 sections** | 复杂页（记忆）可分卡，简单页一卡 |
| 控件库 | base-ui / antd | **antd + @lobehub/ui** | 项目现用栈，Switch/Select/InputNumber 现成 |

---

## 11. 相关文件

- `tauri-agent/src/features/settings/settingsSchema.ts` — 类型增强 + 逐字段补 group/icon/description/options（**主改**）
- `tauri-agent/src/features/settings/SettingsPanel.tsx` — 重写：分组导航 + 卡片内容（**重写**）
- `tauri-agent/src/features/settings/SettingField.tsx` — 重写：行布局 + 控件分发（**重写**）
- `tauri-agent/src/features/settings/SettingCard.tsx` — 卡片容器（**新增**）
- `tauri-agent/src/features/settings/SettingsPanel.test.tsx` — 更新测试
- `tauri-agent/src/features/settings/useSettingsForm.ts` — **不改**

---

**状态：** 设计已经用户批准（基线范围，视觉方向见 mockup），待 writing-plans 定稿计划。下一步 → `superpowers:writing-plans` 产出 `2026-06-15-settings-redesign-plan.md`。
