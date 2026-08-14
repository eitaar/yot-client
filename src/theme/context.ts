import { createContext, useContext } from 'react';

import { themes, type Colors, type ThemeName } from '@/theme/tokens';

export interface ThemeValue {
  theme: ThemeName;
  colors: Colors;
}

/**
 * The resolved palette for the current theme. `ThemeProvider` supplies it;
 * `useTheme` is deliberately free of any store dependency so leaf components
 * (icons, UI kit, plugin catalog) can read the palette without pulling in
 * AsyncStorage through the settings store.
 */
export const ThemeContext = createContext<ThemeValue>({ theme: 'light', colors: themes.light });

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
