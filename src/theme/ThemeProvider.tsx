import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { useSettings } from '@/store/settings';
import { themes, type Colors, type ThemeName } from '@/theme/tokens';

interface ThemeValue {
  theme: ThemeName;
  colors: Colors;
}

const ThemeContext = createContext<ThemeValue>({ theme: 'light', colors: themes.light });

/**
 * Resolves the user's theme preference (light/dark/system) to a concrete
 * palette and makes it available via `useTheme()`. `system` follows the
 * device through React Native's `useColorScheme`.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useSettings((s) => s.theme);
  const system = useColorScheme();
  const theme: ThemeName =
    preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  const value = useMemo(() => ({ theme, colors: themes[theme] }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
