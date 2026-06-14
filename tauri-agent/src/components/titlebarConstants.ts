/**
 * 标题栏高度（Titlebar 样式与 dock 拖拽 modifier 共用）。
 * 单独抽成常量，避免纯逻辑模块（dockDnd）经 Titlebar 传递性导入 Tauri 运行时，
 * 否则在 jsdom 单测里 getCurrentWindow() 会抛错。
 */
export const TITLE_BAR_HEIGHT = 38;
