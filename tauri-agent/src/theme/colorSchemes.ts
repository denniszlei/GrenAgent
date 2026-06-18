// 主流暗/亮色配色预设。每个方案给一组 antd token 覆盖（表面/文字/边框/主色），
// 经 App 的 ThemeProvider theme.token 注入；ThemeBridge 再把 --gren-* 派生出去，全局一致。
// 取值参考各方案官方调色板（GitHub Dark / One Dark / Dracula / Nord / Tokyo Night /
// Catppuccin / Linear），非纯黑、按亮度分层、正文高对比。

export interface SchemeTokens {
  colorBgLayout: string;
  colorBgContainer: string;
  colorBgElevated: string;
  colorBorder: string;
  colorBorderSecondary: string;
  colorText: string;
  colorTextSecondary: string;
  colorTextTertiary: string;
  colorPrimary: string;
}

export interface ColorScheme {
  id: string;
  label: string;
  /** 选择器预览用：[底色, 表面色, 主色]。 */
  preview: [string, string, string];
  dark?: SchemeTokens;
  light?: SchemeTokens;
}

export const DEFAULT_COLOR_SCHEME = 'github';

export const COLOR_SCHEMES: ColorScheme[] = [
  {
    id: 'default',
    label: '库默认',
    preview: ['#1f1f1f', '#2a2a2a', '#1677ff'],
  },
  {
    id: 'github',
    label: 'GitHub',
    preview: ['#0d1117', '#161b22', '#58a6ff'],
    dark: {
      colorBgLayout: '#0d1117',
      colorBgContainer: '#161b22',
      colorBgElevated: '#1c2128',
      colorBorder: '#30363d',
      colorBorderSecondary: '#21262d',
      colorText: '#e6edf3',
      colorTextSecondary: '#8b949e',
      colorTextTertiary: '#6e7681',
      colorPrimary: '#58a6ff',
    },
    light: {
      colorBgLayout: '#f6f8fa',
      colorBgContainer: '#ffffff',
      colorBgElevated: '#ffffff',
      colorBorder: '#d1d9e0',
      colorBorderSecondary: '#d1d9e0',
      colorText: '#1f2328',
      colorTextSecondary: '#59636e',
      colorTextTertiary: '#818b98',
      colorPrimary: '#0969da',
    },
  },
  {
    id: 'onedark',
    label: 'One Dark',
    preview: ['#21252b', '#282c34', '#61afef'],
    dark: {
      colorBgLayout: '#21252b',
      colorBgContainer: '#282c34',
      colorBgElevated: '#2f343d',
      colorBorder: '#3e4451',
      colorBorderSecondary: '#21252b',
      colorText: '#abb2bf',
      colorTextSecondary: '#828997',
      colorTextTertiary: '#5c6370',
      colorPrimary: '#61afef',
    },
    light: {
      colorBgLayout: '#fafafa',
      colorBgContainer: '#ffffff',
      colorBgElevated: '#ffffff',
      colorBorder: '#dbdbdc',
      colorBorderSecondary: '#e5e5e6',
      colorText: '#383a42',
      colorTextSecondary: '#696c77',
      colorTextTertiary: '#a0a1a7',
      colorPrimary: '#4078f2',
    },
  },
  {
    id: 'dracula',
    label: 'Dracula',
    preview: ['#21222c', '#282a36', '#bd93f9'],
    dark: {
      colorBgLayout: '#21222c',
      colorBgContainer: '#282a36',
      colorBgElevated: '#343746',
      colorBorder: '#44475a',
      colorBorderSecondary: '#343746',
      colorText: '#f8f8f2',
      colorTextSecondary: '#c5c8d6',
      colorTextTertiary: '#6272a4',
      colorPrimary: '#bd93f9',
    },
    light: {
      colorBgLayout: '#f8f8f2',
      colorBgContainer: '#ffffff',
      colorBgElevated: '#ffffff',
      colorBorder: '#d5d8e0',
      colorBorderSecondary: '#e3e5ee',
      colorText: '#1f1f1f',
      colorTextSecondary: '#57555c',
      colorTextTertiary: '#8c8ca0',
      colorPrimary: '#644ac9',
    },
  },
  {
    id: 'nord',
    label: 'Nord',
    preview: ['#2e3440', '#3b4252', '#88c0d0'],
    dark: {
      colorBgLayout: '#2e3440',
      colorBgContainer: '#3b4252',
      colorBgElevated: '#434c5e',
      colorBorder: '#4c566a',
      colorBorderSecondary: '#3b4252',
      colorText: '#eceff4',
      colorTextSecondary: '#d8dee9',
      colorTextTertiary: '#7b88a1',
      colorPrimary: '#88c0d0',
    },
    light: {
      colorBgLayout: '#eceff4',
      colorBgContainer: '#ffffff',
      colorBgElevated: '#ffffff',
      colorBorder: '#d8dee9',
      colorBorderSecondary: '#e5e9f0',
      colorText: '#2e3440',
      colorTextSecondary: '#4c566a',
      colorTextTertiary: '#7b88a1',
      colorPrimary: '#5e81ac',
    },
  },
  {
    id: 'tokyo',
    label: 'Tokyo Night',
    preview: ['#16161e', '#1a1b26', '#7aa2f7'],
    dark: {
      colorBgLayout: '#16161e',
      colorBgContainer: '#1a1b26',
      colorBgElevated: '#24283b',
      colorBorder: '#3b4261',
      colorBorderSecondary: '#24283b',
      colorText: '#c0caf5',
      colorTextSecondary: '#a9b1d6',
      colorTextTertiary: '#565f89',
      colorPrimary: '#7aa2f7',
    },
    light: {
      colorBgLayout: '#e1e2e7',
      colorBgContainer: '#ffffff',
      colorBgElevated: '#ffffff',
      colorBorder: '#c4c8da',
      colorBorderSecondary: '#d6d8e0',
      colorText: '#343b58',
      colorTextSecondary: '#6172b0',
      colorTextTertiary: '#848cb5',
      colorPrimary: '#2e7de9',
    },
  },
  {
    id: 'catppuccin',
    label: 'Catppuccin',
    preview: ['#181825', '#1e1e2e', '#cba6f7'],
    dark: {
      colorBgLayout: '#181825',
      colorBgContainer: '#1e1e2e',
      colorBgElevated: '#313244',
      colorBorder: '#45475a',
      colorBorderSecondary: '#313244',
      colorText: '#cdd6f4',
      colorTextSecondary: '#a6adc8',
      colorTextTertiary: '#6c7086',
      colorPrimary: '#cba6f7',
    },
    light: {
      colorBgLayout: '#e6e9ef',
      colorBgContainer: '#eff1f5',
      colorBgElevated: '#ffffff',
      colorBorder: '#ccd0da',
      colorBorderSecondary: '#dce0e8',
      colorText: '#4c4f69',
      colorTextSecondary: '#6c6f85',
      colorTextTertiary: '#9ca0b0',
      colorPrimary: '#8839ef',
    },
  },
  {
    id: 'linear',
    label: 'Linear',
    preview: ['#08090a', '#101113', '#5e6ad2'],
    dark: {
      colorBgLayout: '#08090a',
      colorBgContainer: '#101113',
      colorBgElevated: '#18191b',
      colorBorder: '#23252a',
      colorBorderSecondary: '#1a1b1d',
      colorText: '#f7f8f8',
      colorTextSecondary: '#b4b8c0',
      colorTextTertiary: '#6f7178',
      colorPrimary: '#5e6ad2',
    },
    light: {
      colorBgLayout: '#f9f9fb',
      colorBgContainer: '#ffffff',
      colorBgElevated: '#ffffff',
      colorBorder: '#e6e6ea',
      colorBorderSecondary: '#ededf0',
      colorText: '#16171a',
      colorTextSecondary: '#61656c',
      colorTextTertiary: '#8a8f98',
      colorPrimary: '#5e6ad2',
    },
  },
];

const SCHEME_MAP = new Map(COLOR_SCHEMES.map((s) => [s.id, s]));

/** 取某方案在指定明暗下的 token 覆盖；'default' 或未知 id 返回 undefined（用库默认）。 */
export function schemeTokens(id: string | undefined, isDark: boolean): SchemeTokens | undefined {
  const scheme = id ? SCHEME_MAP.get(id) : undefined;
  if (!scheme) return undefined;
  return isDark ? scheme.dark : scheme.light;
}
