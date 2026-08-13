import { useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { useSettings } from '@/store/settings';
import { ThemeContext } from '@/theme/context';
import { themes, type ThemeName } from '@/theme/tokens';

/**
 * Resolves the user's theme preference (light/dark/system) to a concrete
 * palette and provides it through {@link ThemeContext}. `system` follows the
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
