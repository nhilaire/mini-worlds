import { createContext, ReactNode, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import type { ThemeSetting } from '../game/core/save';
import { Scheme, ThemeColors, THEMES } from './theme';

export type Theme = { scheme: Scheme; colors: ThemeColors };

const ThemeContext = createContext<Theme>({ scheme: 'dark', colors: THEMES.dark });

/** Resolves the theme: the player's choice, else the phone's scheme (dark when unknown). */
export function resolveScheme(setting: ThemeSetting, phone: string | null | undefined): Scheme {
  if (setting === 'light' || setting === 'dark') return setting;
  return phone === 'light' ? 'light' : 'dark';
}

export function ThemeProvider({ setting, children }: { setting: ThemeSetting; children: ReactNode }) {
  const phone = useColorScheme();
  const value = useMemo(() => {
    const scheme = resolveScheme(setting, phone);
    return { scheme, colors: THEMES[scheme] };
  }, [setting, phone]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export { ThemeContext };
