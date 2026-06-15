import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Appearance = 'light' | 'dark' | 'auto';

/** 主题色名（取值与 @lobehub/ui customTheme.primaryColor 预设一致）。undefined = 库默认色。 */
export type PrimaryColor =
  | 'blue'
  | 'cyan'
  | 'geekblue'
  | 'gold'
  | 'green'
  | 'lime'
  | 'magenta'
  | 'orange'
  | 'purple'
  | 'red'
  | 'volcano'
  | 'yellow';

/** 中性色名（取值与 @lobehub/ui customTheme.neutralColor 预设一致）。undefined = 库默认。 */
export type NeutralColor = 'mauve' | 'olive' | 'sage' | 'sand' | 'slate';

interface ThemeState {
  appearance: Appearance;
  primaryColor?: PrimaryColor;
  neutralColor?: NeutralColor;
  setAppearance: (appearance: Appearance) => void;
  setPrimaryColor: (color?: PrimaryColor) => void;
  setNeutralColor: (color?: NeutralColor) => void;
  toggleAppearance: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      appearance: 'dark',
      primaryColor: undefined,
      neutralColor: undefined,
      setAppearance: (appearance) => set({ appearance }),
      setPrimaryColor: (primaryColor) => set({ primaryColor }),
      setNeutralColor: (neutralColor) => set({ neutralColor }),
      toggleAppearance: () =>
        set((state) => ({ appearance: state.appearance === 'dark' ? 'light' : 'dark' })),
    }),
    {
      name: 'pi-theme',
      partialize: (state) => ({
        appearance: state.appearance,
        primaryColor: state.primaryColor,
        neutralColor: state.neutralColor,
      }),
    },
  ),
);
