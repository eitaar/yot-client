/**
 * Client-side plugin "install" state, persisted to AsyncStorage.
 *
 * `added` holds full metadata for the plugins the user has selected (from the
 * server list, or onboarding), so titles are available offline. `activeId` +
 * `activeTitle` remember which plugin is currently shown — the feed header
 * reflects the active title.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { PluginMeta } from '@/plugins/schema';
import { persistStorage } from '@/store/storage';

export interface PluginsState {
  added: PluginMeta[];
  activeId: string | null;
  activeTitle: string | null;
}

export interface PluginsActions {
  add: (meta: PluginMeta) => void;
  remove: (id: string) => void;
  setActive: (id: string, title: string) => void;
}

export type PluginsStore = PluginsState & PluginsActions;

export const PLUGINS_STORAGE_KEY = 'yot.plugins.v1';

export const usePlugins = create<PluginsStore>()(
  persist(
    (set) => ({
      added: [],
      activeId: null,
      activeTitle: null,

      add: (meta) =>
        set((s) => (s.added.some((a) => a.id === meta.id) ? s : { added: [...s.added, meta] })),

      remove: (id) =>
        set((s) => ({
          added: s.added.filter((a) => a.id !== id),
          activeId: s.activeId === id ? null : s.activeId,
          activeTitle: s.activeId === id ? null : s.activeTitle,
        })),

      setActive: (id, title) => set({ activeId: id, activeTitle: title }),
    }),
    {
      name: PLUGINS_STORAGE_KEY,
      storage: createJSONStorage(() => persistStorage),
      version: 1,
    },
  ),
);
