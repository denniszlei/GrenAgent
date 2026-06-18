import { useLayoutEffect } from 'react';
import { useTheme } from 'antd-style';

/**
 * 把 lobe-ui 当前主题 token 同步到 body 背景与 --gren-* 占位变量，使所有管理面板
 * 配色随主题/方案/明暗统一变化（面板代码无需改）。用 useLayoutEffect 在绘制前写入，
 * 与 antd cssVar 同一帧切换，避免「内容已变、底色慢一拍」的中间异色。自身不渲染 DOM。
 */
export function ThemeBridge() {
  const theme = useTheme();

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme.appearance;
    document.body.style.backgroundColor = theme.colorBgLayout;

    const root = document.documentElement.style;
    root.setProperty('--gren-fg', theme.colorText);
    root.setProperty('--gren-fg-muted', theme.colorTextSecondary);
    root.setProperty('--gren-border', theme.colorBorderSecondary);
    root.setProperty('--gren-rail-active', theme.colorFillTertiary);
    root.setProperty('--gren-bg-1', theme.colorBgContainer);
    root.setProperty('--gren-bg-2', theme.colorFillSecondary);
    root.setProperty('--gren-bg-3', theme.colorFillTertiary);
    root.setProperty('--gren-acc', theme.colorPrimary);
    // 三区分层背景全部取自主题 token：侧栏+标题栏用更深的布局底色，内容区用容器色。
    root.setProperty('--gren-titlebar-bg', theme.colorBgLayout);
    root.setProperty('--gren-sidebar-bg', theme.colorBgLayout);
    root.setProperty('--gren-content-bg', theme.colorBgContainer);
  }, [
    theme.appearance,
    theme.colorBgLayout,
    theme.colorBgContainer,
    theme.colorPrimary,
    theme.colorText,
  ]);

  return null;
}
