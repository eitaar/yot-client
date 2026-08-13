/**
 * Client-side plugin "install" state, persisted to AsyncStorage.
 *
 * `added` holds full metadata for the plugins the user has selected (from the
 * server list, or onboarding), so titles are available offline. The feed's
 * segmented control renders one segment per added plugin.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { PluginMeta } from '@/plugins/schema';
import { persistStorage } from '@/store/storage';

export interface PluginsState {
  added: PluginMeta[];
}

export interface PluginsActions {
  add: (meta: PluginMeta) => void;
  remove: (id: string) => void;
  toggle: (meta: PluginMeta) => void;
}

export type PluginsStore = PluginsState & PluginsActions;

export const PLUGINS_STORAGE_KEY = 'yot.plugins.v1';

export const usePlugins = create<PluginsStore>()(
  persist(
    (set) => ({
      added: [],

      add: (meta) =>
        set((s) => (s.added.some((a) => a.id === meta.id) ? s : { added: [...s.added, meta] })),

      remove: (id) => set((s) => ({ added: s.added.filter((a) => a.id !== id) })),

      toggle: (meta) =>
        set((s) =>
          s.added.some((a) => a.id === meta.id)
            ? { added: s.added.filter((a) => a.id !== meta.id) }
            : { added: [...s.added, meta] },
        ),
    }),
    {
      name: PLUGINS_STORAGE_KEY,
      storage: createJSONStorage(() => persistStorage),
      version: 1,
    },
  ),
);
