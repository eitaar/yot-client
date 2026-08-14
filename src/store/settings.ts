/**
 * User preferences, persisted to AsyncStorage.
 *
 * Nothing here round-trips to the server — Yot has no settings endpoint, and
 * the agent toggles are local intent for a future feature. Everything in the
 * Display group is meant to be *actually read* by the UI (the prototype had
 * several dead rows); the selectors at the bottom are the intended access
 * path so components subscribe to one field rather than the whole object.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { persistStorage } from '@/store/storage';
import type { ThemePreference } from '@/theme/tokens';

export type WeekStart = 'Mon' | 'Sun';
export type TimeFormat = '12h' | '24h';
export type TzMode = 'Auto' | 'Manual';
export type DefaultView = 'calendar' | 'events' | 'feed';
export type FeedLayout = 'dynamic' | 'magazine' | 'mosaic' | 'stories';

export const FEED_LAYOUTS: readonly FeedLayout[] = ['dynamic', 'magazine', 'mosaic', 'stories'];
export const DEFAULT_VIEWS: readonly DefaultView[] = ['calendar', 'events', 'feed'];

/** The device's IANA zone, or `UTC` where `Intl` is unavailable. */
export function deviceTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof zone === 'string' && zone !== '') return zone;
  } catch {
    // Hermes without full-icu; fall through.
  }
  return 'UTC';
}

export interface SettingsState {
  /** First column of the month grid and the week strip. */
  weekStart: WeekStart;
  timeFormat: TimeFormat;
  /** `Auto` follows the device; `Manual` pins {@link SettingsState.timeZone}. */
  tzMode: TzMode;
  /** IANA zone name. Only meaningful when `tzMode === 'Manual'`. */
  timeZone: string;
  /** Tab the app opens on. */
  defaultView: DefaultView;
  feedLayout: FeedLayout;
  /** Light / dark / follow the device. */
  theme: ThemePreference;
  /** Agent preferences — persisted, no backend effect yet. */
  autoSuggest: boolean;
  smartNotifs: boolean;
  /** True once pairing has completed; the router gate reads this. */
  onboarded: boolean;
  /** Normalized base URL of the paired server, for display in Settings. */
  serverUrl: string | null;
  /** False until AsyncStorage has been read — gate navigation on it. */
  hydrated: boolean;
}

export interface SettingsActions {
  setWeekStart: (value: WeekStart) => void;
  setTimeFormat: (value: TimeFormat) => void;
  setTzMode: (value: TzMode) => void;
  setTimeZone: (value: string) => void;
  setDefaultView: (value: DefaultView) => void;
  setFeedLayout: (value: FeedLayout) => void;
  setTheme: (value: ThemePreference) => void;
  setAutoSuggest: (value: boolean) => void;
  setSmartNotifs: (value: boolean) => void;
  setOnboarded: (value: boolean) => void;
  setServerUrl: (value: string | null) => void;
  /** Bulk update, for the pairing flow writing server + onboarded at once. */
  update: (patch: Partial<SettingsState>) => void;
  /** Back to defaults, keeping `hydrated` — used by Disconnect. */
  reset: () => void;
}

export type SettingsStore = SettingsState & SettingsActions;

export const defaultSettings: SettingsState = {
  weekStart: 'Mon',
  timeFormat: '12h',
  tzMode: 'Auto',
  timeZone: deviceTimeZone(),
  defaultView: 'calendar',
  feedLayout: 'dynamic',
  theme: 'system',
  autoSuggest: true,
  smartNotifs: false,
  onboarded: false,
  serverUrl: null,
  hydrated: false,
};

export const SETTINGS_STORAGE_KEY = 'yot.settings.v1';

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...defaultSettings,

      setWeekStart: (weekStart) => set({ weekStart }),
      setTimeFormat: (timeFormat) => set({ timeFormat }),
      setTzMode: (tzMode) => set({ tzMode }),
      setTimeZone: (timeZone) => set({ timeZone }),
      setDefaultView: (defaultView) => set({ defaultView }),
      setFeedLayout: (feedLayout) => set({ feedLayout }),
      setTheme: (theme) => set({ theme }),
      setAutoSuggest: (autoSuggest) => set({ autoSuggest }),
      setSmartNotifs: (smartNotifs) => set({ smartNotifs }),
      setOnboarded: (onboarded) => set({ onboarded }),
      setServerUrl: (serverUrl) => set({ serverUrl }),
      update: (patch) => set(patch),
      reset: () => set({ ...defaultSettings, timeZone: deviceTimeZone(), hydrated: true }),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      storage: createJSONStorage(() => persistStorage),
      version: 1,
      // `hydrated` describes storage, so persisting it would be circular.
      partialize: ({ hydrated: _hydrated, ...rest }) => rest,
      onRehydrateStorage: () => () => {
        // Runs on success *and* on failure; either way the read is over and
        // the app must stop waiting.
        useSettings.setState({ hydrated: true });
      },
    },
  ),
);

/* ------------------------------------------------------------- selectors */

export const selectWeekStart = (s: SettingsStore): WeekStart => s.weekStart;
export const selectTimeFormat = (s: SettingsStore): TimeFormat => s.timeFormat;
export const selectFeedLayout = (s: SettingsStore): FeedLayout => s.feedLayout;
export const selectTheme = (s: SettingsStore): ThemePreference => s.theme;
export const selectDefaultView = (s: SettingsStore): DefaultView => s.defaultView;
export const selectOnboarded = (s: SettingsStore): boolean => s.onboarded;
export const selectHydrated = (s: SettingsStore): boolean => s.hydrated;

/** The zone the UI should format in, honouring Auto vs Manual. */
export const selectTimeZone = (s: SettingsStore): string =>
  s.tzMode === 'Manual' && s.timeZone ? s.timeZone : deviceTimeZone();

export const useWeekStart = (): WeekStart => useSettings(selectWeekStart);
export const useTimeFormat = (): TimeFormat => useSettings(selectTimeFormat);
export const useFeedLayout = (): FeedLayout => useSettings(selectFeedLayout);
export const useThemePreference = (): ThemePreference => useSettings(selectTheme);
export const useDefaultView = (): DefaultView => useSettings(selectDefaultView);
export const useEffectiveTimeZone = (): string => useSettings(selectTimeZone);
export const useSettingsHydrated = (): boolean => useSettings(selectHydrated);

/** Non-reactive read, for callbacks and non-React code. */
export const getSettings = (): SettingsStore => useSettings.getState();
