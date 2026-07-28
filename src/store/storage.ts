/**
 * The storage backend the persisted zustand stores write through.
 *
 * On web, `expo export` pre-renders every route in Node ("output": "static").
 * AsyncStorage's web implementation is `localStorage`, so the very first
 * persist write during that render throws `ReferenceError: window is not
 * defined` and takes the build down. Nothing useful can be persisted in a
 * server render anyway, so there we hand back an inert store; the real one
 * takes over as soon as the bundle hydrates in the browser.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export interface AsyncKeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** True while a web bundle is being rendered in Node rather than a browser. */
export const isServerRender = Platform.OS === 'web' && typeof window === 'undefined';

const inert: AsyncKeyValueStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

export const persistStorage: AsyncKeyValueStorage = isServerRender ? inert : AsyncStorage;

export default persistStorage;
