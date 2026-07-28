/**
 * Where the pairing key and the server address live.
 *
 * The Yot README (§native clients) is explicit: the API key goes in OS secure
 * storage, never in plain preferences. So on iOS/Android the key uses
 * `expo-secure-store` (Keychain / Keystore) while the base URL — not a secret,
 * and needed synchronously often enough — uses AsyncStorage.
 *
 * SecureStore has no web implementation, so on web both fall back to
 * AsyncStorage. That is a real downgrade (localStorage is readable by any
 * script on the origin), but the web build is a convenience target; the flag
 * {@link isSecureStorageAvailable} lets the UI say so if it ever wants to.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import type { Scope } from './types';

/** SecureStore keys must match `[A-Za-z0-9._-]+`. */
const KEY_STORE_KEY = 'yot_api_key';
const BASE_URL_STORAGE_KEY = 'yot.baseUrl';
const SCOPE_STORAGE_KEY = 'yot.scope';
/** Web-only mirror of KEY_STORE_KEY, kept namespaced like the other entries. */
const WEB_KEY_STORAGE_KEY = 'yot.apiKey';

/** False on web, where the key degrades to AsyncStorage. */
export const isSecureStorageAvailable = Platform.OS !== 'web';

/**
 * What a key is allowed to do. `POST /api/auth/pair` answers with it and the
 * server enforces it (a `read` key gets 403 on every mutating method), so the
 * UI has to hide Edit and Delete rather than let them fail. Not a secret — it
 * lives in AsyncStorage next to the base URL.
 *
 * Assumed `write` when absent, which is both the server's default and what
 * every session paired before this field existed actually has.
 */
export const DEFAULT_SCOPE: Scope = 'write';

function asScope(value: string | null): Scope {
  return value === 'read' ? 'read' : DEFAULT_SCOPE;
}

export interface Session {
  baseUrl: string;
  key: string;
  /** Defaults to `'write'` — see {@link DEFAULT_SCOPE}. */
  scope: Scope;
}

/**
 * Last known session, kept in memory so synchronous callers (image headers,
 * for one) do not have to await storage on every render. `undefined` means
 * "not loaded yet", `null` means "loaded, and there is no session".
 */
let cached: Session | null | undefined;
let inFlight: Promise<Session | null> | null = null;

async function readKey(): Promise<string | null> {
  if (!isSecureStorageAvailable) {
    return AsyncStorage.getItem(WEB_KEY_STORAGE_KEY);
  }
  return SecureStore.getItemAsync(KEY_STORE_KEY);
}

async function writeKey(key: string): Promise<void> {
  if (!isSecureStorageAvailable) {
    await AsyncStorage.setItem(WEB_KEY_STORAGE_KEY, key);
    return;
  }
  await SecureStore.setItemAsync(KEY_STORE_KEY, key);
}

async function removeKey(): Promise<void> {
  if (!isSecureStorageAvailable) {
    await AsyncStorage.removeItem(WEB_KEY_STORAGE_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(KEY_STORE_KEY);
}

/**
 * Read the persisted session. Concurrent callers share one read, and the
 * result is cached until {@link saveSession} / {@link clearSession} /
 * {@link resetSessionCache} moves it.
 */
export function loadSession(): Promise<Session | null> {
  if (cached !== undefined) return Promise.resolve(cached);
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const [key, baseUrl, scope] = await Promise.all([
        readKey(),
        AsyncStorage.getItem(BASE_URL_STORAGE_KEY),
        AsyncStorage.getItem(SCOPE_STORAGE_KEY),
      ]);
      cached = key && baseUrl ? { key, baseUrl, scope: asScope(scope) } : null;
    } catch {
      // A storage failure is indistinguishable from "not paired" for our
      // purposes: either way the app has to send the user to onboarding.
      cached = null;
    } finally {
      inFlight = null;
    }
    return cached;
  })();

  return inFlight;
}

/** What {@link saveSession} accepts: `scope` may be omitted and defaults. */
export type SessionInput = Omit<Session, 'scope'> & { scope?: Scope };

/** Persist every part of the session and prime the cache. */
export async function saveSession(session: SessionInput): Promise<void> {
  const scope = session.scope ?? DEFAULT_SCOPE;
  await Promise.all([
    writeKey(session.key),
    AsyncStorage.setItem(BASE_URL_STORAGE_KEY, session.baseUrl),
    AsyncStorage.setItem(SCOPE_STORAGE_KEY, scope),
  ]);
  cached = { baseUrl: session.baseUrl, key: session.key, scope };
}

/**
 * Remember the server address before a key exists — the onboarding probe
 * finishes before pairing does, and the address is worth keeping if the user
 * backs out mid-PIN.
 */
export async function saveBaseUrl(baseUrl: string): Promise<void> {
  await AsyncStorage.setItem(BASE_URL_STORAGE_KEY, baseUrl);
  if (cached) cached = { ...cached, baseUrl };
}

/**
 * Update the stored scope in place — for a `GET /api/auth/session` that
 * disagrees with what pairing reported (the key was downgraded server-side).
 */
export async function saveScope(scope: Scope): Promise<void> {
  await AsyncStorage.setItem(SCOPE_STORAGE_KEY, scope);
  if (cached) cached = { ...cached, scope };
}

/** Read the stored base URL even when no key has been minted yet. */
export function loadBaseUrl(): Promise<string | null> {
  if (cached) return Promise.resolve(cached.baseUrl);
  return AsyncStorage.getItem(BASE_URL_STORAGE_KEY);
}

/** Forget the key (and the address) — disconnect, or a 401 we cannot recover. */
export async function clearSession(): Promise<void> {
  cached = null;
  await Promise.all([
    removeKey(),
    AsyncStorage.removeItem(BASE_URL_STORAGE_KEY),
    AsyncStorage.removeItem(SCOPE_STORAGE_KEY),
  ]);
}

/**
 * The paired key's scope. Resolves to `'write'` when nothing is paired, so a
 * caller that only wants to gate edit affordances need not special-case it —
 * the request would 401 long before the scope mattered.
 */
export async function loadScope(): Promise<Scope> {
  return (await loadSession())?.scope ?? DEFAULT_SCOPE;
}

/** Synchronous peek at the cached scope; `'write'` before the first load. */
export function getCachedScope(): Scope {
  return cached?.scope ?? DEFAULT_SCOPE;
}

/**
 * Synchronous peek at the cached session. Returns `null` before the first
 * {@link loadSession}, so treat it as an optimisation, never as the source of
 * truth.
 */
export function getCachedSession(): Session | null {
  return cached ?? null;
}

/** Drop the in-memory cache; the next {@link loadSession} re-reads storage. */
export function resetSessionCache(): void {
  cached = undefined;
  inFlight = null;
}
