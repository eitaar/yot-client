/**
 * Tracking tab — local demo data, no backend.
 *
 * Yot has no concept of "things I am following", so the Tracking tab keeps the
 * prototype's dataset (`Calendar App v15.dc.html` lines 819–845). The design
 * hardcoded abstract day numbers against `trToday = 22`; here each number is
 * anchored to a real date *once*, at seed time (`startDay: 10` → today − 12d,
 * `startDay: 35` → today + 13d, `null` → TBA), and the result is persisted so
 * the countdowns tick down instead of resetting to the same offsets on every
 * launch.
 *
 * The data arrives through {@link TrackingSource}, so replacing the demo with
 * a server-backed implementation later is one `setTrackingSource` call — the
 * store, the derived helpers, and the UI stay as they are.
 */

import { addDays, differenceInCalendarDays, startOfDay } from 'date-fns';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { persistStorage } from '@/store/storage';

/* -------------------------------------------------------------------- types */

export interface Franchise {
  name: string;
  /** Short code for the filter pills ("GI", "HSR"). */
  abbr: string;
  color: string;
}

export type TrackingType = 'gacha' | 'manga' | 'anime' | 'game' | (string & {});

export interface TrackingItem {
  id: string;
  title: string;
  /** Franchise `name`, matching {@link Franchise.name}. */
  franchise: string;
  type: TrackingType;
  /** `null` when the date is unannounced (TBA). */
  start: Date | null;
  end: Date | null;
  desc: string;
}

export type TrackingGroup = 'Active' | 'This Week' | 'Later' | 'TBA';

export const TRACKING_GROUPS: readonly TrackingGroup[] = ['Active', 'This Week', 'Later', 'TBA'];

/** Everything the UI needs about one item at a given moment. */
export interface TrackingDerived {
  isActive: boolean;
  isTBA: boolean;
  /** Whole days until the start (0 once it has begun); `null` when TBA. */
  daysUntil: number | null;
  /** Whole days until the end while active; `null` otherwise. */
  daysLeft: number | null;
  /** 0–1 through a multi-day active range; 0 for everything else. */
  progress: number;
  /** True only for an active multi-day range — the bar's visibility flag. */
  showProgress: boolean;
  group: TrackingGroup;
  /** "3d left" / "Live" / "TBA" / "Today" / "5d". */
  timeLabel: string;
}

/** Swap-in point for a future server-backed implementation. */
export interface TrackingSource {
  load: (now: Date) => Promise<{ franchises: Franchise[]; items: TrackingItem[] }>;
}

/* --------------------------------------------------------- design dataset */

/** The prototype's "today" — every `startDay`/`endDay` is relative to this. */
export const DESIGN_TODAY = 22;

export const designFranchises: readonly Franchise[] = [
  { name: 'Genshin Impact', abbr: 'GI', color: '#E8453C' },
  { name: 'Honkai Star Rail', abbr: 'HSR', color: '#7B61FF' },
  { name: 'Blue Archive', abbr: 'BA', color: '#00B4D8' },
  { name: 'One Piece', abbr: 'OP', color: '#FF6B35' },
  { name: 'Jujutsu Kaisen', abbr: 'JJK', color: '#1B8C5A' },
  { name: 'Frieren', abbr: 'FRN', color: '#4361EE' },
  { name: 'Chainsaw Man', abbr: 'CSM', color: '#D94040' },
  { name: 'Solo Leveling', abbr: 'SL', color: '#7B61FF' },
  { name: 'Zenless Zone Zero', abbr: 'ZZZ', color: '#FF6B35' },
];

interface DesignItem {
  id: string;
  title: string;
  franchise: string;
  type: TrackingType;
  startDay: number | null;
  endDay: number | null;
  desc: string;
}

export const designItems: readonly DesignItem[] = [
  { id: 't1', title: 'Arlecchino Rerun', franchise: 'Genshin Impact', type: 'gacha', startDay: 10, endDay: 34, desc: 'Arlecchino + Lyney dual banner. Soft pity at 74, hard pity 90.' },
  { id: 't2', title: 'One Piece Ch. 1124', franchise: 'One Piece', type: 'manga', startDay: 22, endDay: 22, desc: 'New chapter. Elbaf arc continues.' },
  { id: 't3', title: 'Firefly Rerun', franchise: 'Honkai Star Rail', type: 'gacha', startDay: 12, endDay: 30, desc: 'Firefly + Jade dual banner. Soft pity at 75.' },
  { id: 't4', title: '3rd Anniv Festival', franchise: 'Blue Archive', type: 'gacha', startDay: 15, endDay: 28, desc: 'Guaranteed 3-star at 100 pulls. Free 10-pull daily.' },
  { id: 't5', title: 'JJK Vol. 28', franchise: 'Jujutsu Kaisen', type: 'manga', startDay: 26, endDay: 26, desc: 'Physical volume release. Cover features Sukuna.' },
  { id: 't6', title: 'Version 2.5', franchise: 'Honkai Star Rail', type: 'game', startDay: 27, endDay: 27, desc: 'Penacony Finale. New playable area + story.' },
  { id: 't7', title: 'Episode 29', franchise: 'Frieren', type: 'anime', startDay: 30, endDay: 30, desc: 'Season 2. Magic exam arc.' },
  { id: 't8', title: 'Ch. 1125', franchise: 'One Piece', type: 'manga', startDay: 29, endDay: 29, desc: 'Weekly chapter (expected).' },
  { id: 't9', title: '5.1 Phase 1', franchise: 'Genshin Impact', type: 'gacha', startDay: 35, endDay: 55, desc: 'New Natlan character. Archon quest Act III.' },
  { id: 't10', title: 'Episode 30', franchise: 'Frieren', type: 'anime', startDay: 37, endDay: 37, desc: 'Second exam phase.' },
  { id: 't11', title: 'Season 2 Premiere', franchise: 'Chainsaw Man', type: 'anime', startDay: 40, endDay: 40, desc: 'MAPPA. 24 episodes confirmed.' },
  { id: 't12', title: 'S2 Cour 2', franchise: 'Solo Leveling', type: 'anime', startDay: null, endDay: null, desc: 'Jeju Island raid arc. Fall 2026.' },
  { id: 't13', title: 'Version 1.3', franchise: 'Zenless Zone Zero', type: 'game', startDay: null, endDay: null, desc: 'New S-rank agent leaked. No date.' },
];

/** Design day number -> real date (midnight local). `null` stays TBA. */
export function anchorDay(day: number | null, now: Date): Date | null {
  if (day === null || day === undefined) return null;
  return addDays(startOfDay(now), day - DESIGN_TODAY);
}

export function buildSeedItems(now: Date = new Date()): TrackingItem[] {
  return designItems.map(({ startDay, endDay, ...rest }) => ({
    ...rest,
    start: anchorDay(startDay, now),
    end: anchorDay(endDay, now),
  }));
}

/** The demo implementation. Anchors the design data to the current date. */
export const demoTrackingSource: TrackingSource = {
  load: async (now) => ({
    franchises: designFranchises.map((f) => ({ ...f })),
    items: buildSeedItems(now),
  }),
};

/* ------------------------------------------------------- derived (pure) */

/**
 * All comparisons are in whole calendar days, matching the design's integer
 * day arithmetic — an event starting "today" reads as Today all day, not from
 * the moment the clock passes its start.
 */
function dayDiff(target: Date, now: Date): number {
  return differenceInCalendarDays(target, now);
}

export function isTBA(item: TrackingItem): boolean {
  return item.start === null;
}

export function isActive(item: TrackingItem, now: Date = new Date()): boolean {
  if (!item.start) return false;
  if (dayDiff(item.start, now) > 0) return false;
  return item.end === null || dayDiff(item.end, now) >= 0;
}

/** Days until the start, floored at 0 once it has begun. `null` when TBA. */
export function daysUntil(item: TrackingItem, now: Date = new Date()): number | null {
  if (!item.start) return null;
  return Math.max(0, dayDiff(item.start, now));
}

/** Days until the end while active; `null` when inactive or open-ended. */
export function daysLeft(item: TrackingItem, now: Date = new Date()): number | null {
  if (!item.end || !isActive(item, now)) return null;
  return dayDiff(item.end, now);
}

/** True when the item spans more than one day. */
export function isRange(item: TrackingItem): boolean {
  if (!item.start || !item.end) return false;
  return differenceInCalendarDays(item.end, item.start) > 0;
}

/** Fraction elapsed through an active multi-day range, clamped to 0–1. */
export function progress(item: TrackingItem, now: Date = new Date()): number {
  if (!item.start || !item.end) return 0;
  if (!isActive(item, now)) return 0;
  const span = differenceInCalendarDays(item.end, item.start);
  if (span <= 0) return 0;
  const elapsed = differenceInCalendarDays(startOfDay(now), item.start);
  return Math.min(1, Math.max(0, elapsed / span));
}

export function group(item: TrackingItem, now: Date = new Date()): TrackingGroup {
  if (isActive(item, now)) return 'Active';
  if (isTBA(item)) return 'TBA';
  const until = daysUntil(item, now);
  return until !== null && until <= 7 ? 'This Week' : 'Later';
}

export function timeLabel(item: TrackingItem, now: Date = new Date()): string {
  const active = isActive(item, now);
  const left = daysLeft(item, now);
  if (active && left !== null) return `${left}d left`;
  if (active) return 'Live';
  if (isTBA(item)) return 'TBA';
  const until = daysUntil(item, now);
  return until === 0 ? 'Today' : `${until}d`;
}

/** Every derived field in one pass — what a list row wants. */
export function describe(item: TrackingItem, now: Date = new Date()): TrackingDerived {
  const active = isActive(item, now);
  return {
    isActive: active,
    isTBA: isTBA(item),
    daysUntil: daysUntil(item, now),
    daysLeft: daysLeft(item, now),
    progress: progress(item, now),
    showProgress: active && isRange(item),
    group: group(item, now),
    timeLabel: timeLabel(item, now),
  };
}

/** Active first, then earliest start; TBA sinks to the bottom (design order). */
export function compareTrackingItems(
  a: TrackingItem,
  b: TrackingItem,
  now: Date = new Date(),
): number {
  const aActive = isActive(a, now);
  const bActive = isActive(b, now);
  if (aActive && !bActive) return -1;
  if (!aActive && bActive) return 1;
  const aStart = a.start ? a.start.getTime() : Number.POSITIVE_INFINITY;
  const bStart = b.start ? b.start.getTime() : Number.POSITIVE_INFINITY;
  if (aStart !== bStart) return aStart - bStart;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/* ------------------------------------------------------------------- store */

export interface TrackingState {
  franchises: Franchise[];
  items: TrackingItem[];
  /** When the design offsets were anchored; `null` before the first seed. */
  seededAt: string | null;
  hydrated: boolean;
}

export interface TrackingActions {
  /** Seed from the source if empty. Safe to call on every mount. */
  ensureSeeded: (now?: Date) => Promise<void>;
  /** Re-anchor from the source, discarding the persisted copy. */
  reseed: (now?: Date) => Promise<void>;
  clear: () => void;
}

export type TrackingStore = TrackingState & TrackingActions;

export const TRACKING_STORAGE_KEY = 'yot.tracking.v1';

let source: TrackingSource = demoTrackingSource;

/** Point the store at a different backend. Call before the first seed. */
export function setTrackingSource(next: TrackingSource): void {
  source = next;
}

/** `JSON.stringify` applies `Date.prototype.toJSON` before the replacer runs,
 * so the raw value is read off the holder via `this` to spot real Dates. */
function dateReplacer(this: Record<string, unknown>, key: string, value: unknown): unknown {
  const raw = this?.[key];
  if (raw instanceof Date) return { __date: raw.toISOString() };
  return value;
}

function dateReviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && '__date' in (value as Record<string, unknown>)) {
    const iso = (value as { __date: unknown }).__date;
    if (typeof iso === 'string') {
      const parsed = new Date(iso);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  return value;
}

export const useTracking = create<TrackingStore>()(
  persist(
    (set, get) => ({
      franchises: [],
      items: [],
      seededAt: null,
      hydrated: false,

      ensureSeeded: async (now = new Date()) => {
        if (get().items.length > 0) return;
        const { franchises, items } = await source.load(now);
        set({ franchises, items, seededAt: now.toISOString() });
      },

      reseed: async (now = new Date()) => {
        const { franchises, items } = await source.load(now);
        set({ franchises, items, seededAt: now.toISOString() });
      },

      clear: () => set({ franchises: [], items: [], seededAt: null }),
    }),
    {
      name: TRACKING_STORAGE_KEY,
      storage: createJSONStorage(() => persistStorage, {
        replacer: dateReplacer,
        reviver: dateReviver,
      }),
      version: 1,
      partialize: ({ franchises, items, seededAt }) => ({ franchises, items, seededAt }),
      onRehydrateStorage: () => () => {
        useTracking.setState({ hydrated: true });
      },
    },
  ),
);

/* --------------------------------------------------------------- selectors */

const sortedCache = new WeakMap<object, Map<string, TrackingItem[]>>();

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/** Sorted per the design, memoized on the items array so refs stay stable. */
export function sortedItems(state: TrackingState, now: Date = new Date()): TrackingItem[] {
  const key = dayKey(now);
  let table = sortedCache.get(state.items);
  if (!table) {
    table = new Map();
    sortedCache.set(state.items, table);
  }
  const hit = table.get(key);
  if (hit) return hit;
  const sorted = [...state.items].sort((a, b) => compareTrackingItems(a, b, now));
  table.set(key, sorted);
  return sorted;
}

/** `null` franchise = the "All" pill. */
export function filteredItems(
  state: TrackingState,
  franchise: string | null,
  now: Date = new Date(),
): TrackingItem[] {
  const sorted = sortedItems(state, now);
  if (!franchise) return sorted;
  return sorted.filter((item) => item.franchise === franchise);
}

/** Only franchises that actually have items — the design's pill list. */
export function activeFranchises(state: TrackingState): Franchise[] {
  return state.franchises.filter((f) => state.items.some((i) => i.franchise === f.name));
}

export function franchiseFor(state: TrackingState, name: string): Franchise | undefined {
  return state.franchises.find((f) => f.name === name);
}

export interface TrackingGroupBucket {
  group: TrackingGroup;
  items: TrackingItem[];
}

/** Non-empty buckets in Active / This Week / Later / TBA order. */
export function groupedItems(
  state: TrackingState,
  franchise: string | null = null,
  now: Date = new Date(),
): TrackingGroupBucket[] {
  const items = filteredItems(state, franchise, now);
  return TRACKING_GROUPS.map((name) => ({
    group: name,
    items: items.filter((item) => group(item, now) === name),
  })).filter((bucket) => bucket.items.length > 0);
}

export function itemById(state: TrackingState, id: string): TrackingItem | undefined {
  return state.items.find((item) => item.id === id);
}

export const useTrackingItem = (id: string): TrackingItem | undefined =>
  useTracking((s) => itemById(s, id));

/** Non-reactive read, for callbacks and non-React code. */
export const getTrackingState = (): TrackingStore => useTracking.getState();
