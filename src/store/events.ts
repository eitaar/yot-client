/**
 * Calendars + events, normalized for the UI.
 *
 * Two rules shape this store:
 *
 * 1. **It opens offline.** Every successful sync writes a JSON snapshot to
 *    AsyncStorage (Dates as ISO strings); `hydrate()` restores it at launch so
 *    the first frame shows last-known data instead of a spinner.
 * 2. **Edits are optimistic.** The local copy changes first and the request
 *    follows; a failure restores the exact previous object and surfaces the
 *    message. The server's response body is authoritative on success.
 *
 * Selectors are memoized on the `eventsById` object identity — zustand v5 goes
 * through `useSyncExternalStore`, which throws if a selector returns a fresh
 * array on every call.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { addMonths, endOfMonth, startOfDay, startOfMonth, subMonths } from 'date-fns';
import { create } from 'zustand';
import {
  ApiError,
  deleteEvent as apiDeleteEvent,
  listAllEvents,
  listCalendars,
  updateEvent as apiUpdateEvent,
} from '@/api/client';
import type { ServerEventPayloads, ServerEventType } from '@/api/sse';
import {
  type AppEvent,
  type Calendar,
  type DeletedPayload,
  type EventPatch,
  type YotEvent,
  compareEvents,
  resolveEventColor,
  toAppEvent,
  toWireInstant,
} from '@/api/types';
import { occursOnDay, splitAllDay } from '@/lib/dates';

export const EVENTS_CACHE_KEY = 'yot.events.cache.v1';

/** Inclusive ISO window, matching `GET /events?from&to` (filters `start_at`). */
export interface DateRange {
  from: string;
  to: string;
}

/** App-shaped edit. `null` clears a field; `undefined` leaves it alone. */
export interface AppEventPatch {
  title?: string;
  description?: string | null;
  location?: string | null;
  start?: Date;
  end?: Date;
  allDay?: boolean;
  calendarId?: string;
  imagePath?: string | null;
  url?: string | null;
  context?: string | null;
}

export type MutationResult = { ok: true } | { ok: false; error: string };

export interface EventsState {
  eventsById: Record<string, AppEvent>;
  calendarsById: Record<string, Calendar>;
  /** What the last sync actually covered; `null` before the first one. */
  fetchedRange: DateRange | null;
  lastSyncAt: number | null;
  syncing: boolean;
  /** Human-readable message from the last failure, cleared by a good sync. */
  error: string | null;
  /**
   * Increments every time {@link EventsState.error} is *set*, including when the
   * same message repeats. Subscribe to this rather than to `error` to drive a
   * toast: two identical failures in a row are two events the user should see,
   * but `error` alone does not change between them.
   */
  errorId: number;
  /** `Date.now()` of the last error, or `null` if there has not been one. */
  errorAt: number | null;
  /** True once the AsyncStorage snapshot has been read (hit or miss). */
  hydrated: boolean;
}

export interface EventsActions {
  hydrate: () => Promise<void>;
  sync: (range?: Partial<DateRange>) => Promise<MutationResult>;
  applyServerEvent: <T extends ServerEventType>(type: T, payload: ServerEventPayloads[T]) => void;
  editEvent: (id: string, patch: AppEventPatch) => Promise<MutationResult>;
  removeEvent: (id: string) => Promise<MutationResult>;
  /** Wipe memory + cache (Disconnect). */
  clear: () => Promise<void>;
}

export type EventsStore = EventsState & EventsActions;

/* ------------------------------------------------------------------ ranges */

/**
 * **The event horizon.** How far either side of today the app claims to know
 * about, in whole months.
 *
 * This is a real limit, not an implementation detail, and it used to be
 * invisible: the window was ±1 month, but SSE frames and months the user had
 * scrolled to left events outside it lying in the cache forever. Upcoming and
 * the Feed therefore showed everything for the next few weeks plus an arbitrary
 * sprinkle of far-future entries, and an event deleted on the server outside the
 * window was never removed — nothing ever re-fetched that range to notice.
 *
 * Forward reach is 3 months so "Upcoming" has a defined, useful end rather than
 * a ragged one. Backward reach stays at 1 month: it is only there so today's
 * timeline and the previous month's grid are populated. Each successful sync
 * prunes anything that has fallen off the back — see {@link pruneHorizon}.
 *
 * The UI should say so in empty states: {@link HORIZON_LABEL}.
 */
export const SYNC_HORIZON = { monthsBack: 1, monthsForward: 3 } as const;

/** Human-readable horizon, for empty states ("Nothing scheduled …"). */
export const HORIZON_LABEL = 'the last month through the next 3 months';

/** The default sync window: the horizon around `now`. */
export function defaultRange(now: Date = new Date()): DateRange {
  return {
    from: startOfMonth(subMonths(now, SYNC_HORIZON.monthsBack)).toISOString(),
    to: endOfMonth(addMonths(now, SYNC_HORIZON.monthsForward)).toISOString(),
  };
}

/** Alias of {@link defaultRange}, for callers that mean "the horizon". */
export const horizonRange = defaultRange;

function isWithinRange(event: AppEvent, range: DateRange): boolean {
  const t = event.start.getTime();
  return t >= Date.parse(range.from) && t <= Date.parse(range.to);
}

/**
 * Drop cached events that have fallen off the back of the horizon.
 *
 * The floor is the earlier of the horizon's start and the range just fetched, so
 * deliberately visiting an older month keeps what that visit returned; only
 * events that no sync covers any more are discarded. Nothing is pruned from the
 * front — a far-future event that arrived over SSE is real, and the next sync
 * whose window reaches it will reconcile it properly.
 */
function pruneHorizon(
  eventsById: Record<string, AppEvent>,
  range: DateRange,
  now: Date,
): Record<string, AppEvent> {
  const floor = Math.min(
    Date.parse(range.from),
    startOfMonth(subMonths(now, SYNC_HORIZON.monthsBack)).getTime(),
  );
  const kept: Record<string, AppEvent> = {};
  for (const [id, event] of Object.entries(eventsById)) {
    if (event.end.getTime() >= floor) kept[id] = event;
  }
  return kept;
}

/** Union when the windows touch, otherwise the newer one replaces the old. */
function mergeRange(previous: DateRange | null, next: DateRange): DateRange {
  if (!previous) return next;
  const [pf, pt, nf, nt] = [previous.from, previous.to, next.from, next.to].map((s) =>
    Date.parse(s),
  );
  if (pt < nf || nt < pf) return next;
  return {
    from: new Date(Math.min(pf, nf)).toISOString(),
    to: new Date(Math.max(pt, nt)).toISOString(),
  };
}

/* ------------------------------------------------------------------- cache */

interface CachedEvent {
  id: string;
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay: boolean;
  imagePath?: string;
  color: string;
  /** Added in v2; absent in snapshots written by earlier builds. */
  updatedAt?: string;
}

/** v1 snapshots are still read — they simply have no `updatedAt` per event. */
type CacheVersion = 1 | 2;

interface CacheSnapshot {
  version: CacheVersion;
  events: CachedEvent[];
  calendars: Calendar[];
  fetchedRange: DateRange | null;
  lastSyncAt: number | null;
}

const CACHE_VERSION: CacheVersion = 2;

function serializeEvent(event: AppEvent): CachedEvent {
  return {
    ...event,
    start: event.start.toISOString(),
    end: event.end.toISOString(),
    updatedAt: event.updatedAt?.toISOString(),
  };
}

function deserializeEvent(cached: CachedEvent): AppEvent | null {
  const start = new Date(cached.start);
  const end = new Date(cached.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const updatedAt = cached.updatedAt ? new Date(cached.updatedAt) : undefined;
  return {
    ...cached,
    start,
    end,
    updatedAt: updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : undefined,
  };
}

/** Writes are chained so a fast burst of edits cannot interleave. */
let cacheWrite: Promise<void> = Promise.resolve();

function persistSnapshot(state: EventsState): void {
  const snapshot: CacheSnapshot = {
    version: CACHE_VERSION,
    events: Object.values(state.eventsById).map(serializeEvent),
    calendars: Object.values(state.calendarsById),
    fetchedRange: state.fetchedRange,
    lastSyncAt: state.lastSyncAt,
  };
  cacheWrite = cacheWrite
    .then(() => AsyncStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify(snapshot)))
    .catch(() => {
      // A full disk must not break the app; the next sync retries.
    });
}

/* --------------------------------------------------- epochs & in-flight frames */

/**
 * Bumped by {@link EventsActions.clear}. Every async continuation captures it
 * before its first `await` and refuses to touch the store or the cache if it
 * has moved.
 *
 * Without this, Disconnect raced its own teardown: an in-flight `sync()` would
 * resolve *after* `clear()` had emptied memory, `set()` the fetched events
 * straight back, and queue a `persistSnapshot` behind `clear()`'s `removeItem`
 * on the same write chain — so the cache ended up holding the old server's
 * events. Pairing with a different server then opened on someone else's data.
 */
let dataEpoch = 0;

/**
 * Frames that arrived while a `sync()` was in flight.
 *
 * `sync()` replaces everything inside its window with what the server returned,
 * but the server answered as of the moment the request was *made*. Anything SSE
 * delivered in between — a created event, a delete, the echo of the user's own
 * PATCH — is not in that response, and the replace silently undid it: new events
 * vanished, deleted ones came back, fresh edits reverted to their pre-edit copy
 * until something else forced a refresh.
 *
 * So frames are applied immediately (the UI stays live) *and* recorded, then
 * replayed on top of the snapshot once it lands. Replay is safe because every
 * frame is an absolute assertion — an upsert or a delete, never a delta — so
 * applying one twice is the same as applying it once.
 */
interface BufferedFrame {
  type: ServerEventType;
  payload: unknown;
}

let syncDepth = 0;
let bufferedFrames: BufferedFrame[] = [];

/**
 * Open a recording window. The returned function closes it exactly once and
 * yields the frames that arrived while *this* sync was in flight — a mark into
 * the shared buffer rather than a flag, so two overlapping syncs each replay
 * their own interval instead of one stealing the other's.
 */
function openSyncWindow(): () => BufferedFrame[] {
  syncDepth += 1;
  const mark = bufferedFrames.length;
  let closed = false;

  return () => {
    if (closed) return [];
    closed = true;
    const frames = bufferedFrames.slice(mark);
    syncDepth = Math.max(0, syncDepth - 1);
    if (syncDepth === 0) bufferedFrames = [];
    return frames;
  };
}

function recordFrame(type: ServerEventType, payload: unknown): void {
  if (syncDepth > 0) bufferedFrames.push({ type, payload });
}

/** Is `a` a strictly newer copy of the same event than `b`? */
function isNewer(a: AppEvent, b: AppEvent): boolean {
  return (a.updatedAt?.getTime() ?? 0) > (b.updatedAt?.getTime() ?? 0);
}

/** Await the pending cache write — for tests and for pre-background flushes. */
export function whenCachePersisted(): Promise<void> {
  return cacheWrite;
}

/* ---------------------------------------------------------------- patching */

/**
 * App patch -> wire patch. Dates become ISO; `null` survives as a clear.
 *
 * `allDay` is the *effective* flag (the patch's, or the event's if the patch
 * does not touch it), because all-day instants are encoded differently: the app
 * holds local midnight, the server stores UTC midnight of the same date. Sending
 * `toISOString()` for one would move a Tokyo user's all-day event to the day
 * before. See `ALL_DAY_END_IS_EXCLUSIVE` in `api/types`.
 */
export function toEventPatch(patch: AppEventPatch, allDay = patch.allDay ?? false): EventPatch {
  const wire: EventPatch = {};
  if (patch.title !== undefined) wire.title = patch.title;
  if (patch.calendarId !== undefined) wire.calendar_id = patch.calendarId;
  if (patch.start !== undefined) wire.start_at = toWireInstant(patch.start, allDay);
  if (patch.end !== undefined) wire.end_at = toWireInstant(patch.end, allDay);
  if (patch.allDay !== undefined) wire.all_day = patch.allDay;
  if (patch.description !== undefined) wire.description = patch.description;
  if (patch.location !== undefined) wire.location = patch.location;
  if (patch.url !== undefined) wire.url = patch.url;
  if (patch.context !== undefined) wire.context = patch.context;
  if (patch.imagePath !== undefined) wire.image_path = patch.imagePath;
  return wire;
}

/** The optimistic projection of a patch onto the local copy. */
export function applyPatchLocally(
  event: AppEvent,
  patch: AppEventPatch,
  calendarsById: Record<string, Calendar>,
): AppEvent {
  const next: AppEvent = { ...event };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.start !== undefined) next.start = patch.start;
  if (patch.end !== undefined) next.end = patch.end;
  if (patch.allDay !== undefined) next.allDay = patch.allDay;
  if (patch.description !== undefined) next.description = patch.description ?? undefined;
  if (patch.location !== undefined) next.location = patch.location ?? undefined;
  if (patch.imagePath !== undefined) next.imagePath = patch.imagePath ?? undefined;
  if (patch.calendarId !== undefined) {
    next.calendarId = patch.calendarId;
    next.color = resolveEventColor({ id: next.id, calendar_id: patch.calendarId }, calendarsById);
  }
  return next;
}

function keyById<T extends { id: string }>(items: T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const item of items) out[item.id] = item;
  return out;
}

/** Re-resolve colours after the calendar list changes. */
function recolor(
  eventsById: Record<string, AppEvent>,
  calendarsById: Record<string, Calendar>,
): Record<string, AppEvent> {
  const next: Record<string, AppEvent> = {};
  for (const [id, event] of Object.entries(eventsById)) {
    const color = resolveEventColor({ id, calendar_id: event.calendarId }, calendarsById);
    next[id] = color === event.color ? event : { ...event, color };
  }
  return next;
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

/* --------------------------------------------------------- frame reduction */

type SetState = (partial: Partial<EventsState>) => void;
type GetState = () => EventsStore;

/**
 * Fold one SSE frame into the store. Shared by {@link EventsActions.applyServerEvent}
 * and by `sync()`'s replay, so a frame is applied identically whichever path it
 * takes. Returns true when the state actually moved (worth persisting).
 *
 * Every case is an absolute assertion about the current server state, never a
 * delta — which is what makes replaying a frame a second time harmless. The one
 * ordering rule is on upserts: a copy the store already holds wins if it is
 * strictly newer, so replaying a stale frame over a fresher snapshot cannot
 * roll the event back.
 */
function reduceServerEvent(
  type: ServerEventType,
  payload: unknown,
  set: SetState,
  get: GetState,
): boolean {
  const state = get();

  switch (type) {
    case 'event.created':
    case 'event.updated': {
      const wire = payload as YotEvent;
      if (!wire?.id) return false;
      const event = toAppEvent(wire, state.calendarsById);
      const held = state.eventsById[event.id];
      if (held && isNewer(held, event)) return false;
      set({ eventsById: { ...state.eventsById, [event.id]: event } });
      return true;
    }
    case 'event.deleted': {
      const { id } = payload as DeletedPayload;
      if (!id || !state.eventsById[id]) return false;
      const eventsById = { ...state.eventsById };
      delete eventsById[id];
      set({ eventsById });
      return true;
    }
    case 'calendar.created':
    case 'calendar.updated': {
      const calendar = payload as Calendar;
      if (!calendar?.id) return false;
      const calendarsById = { ...state.calendarsById, [calendar.id]: calendar };
      set({ calendarsById, eventsById: recolor(state.eventsById, calendarsById) });
      return true;
    }
    case 'calendar.deleted': {
      const { id } = payload as DeletedPayload;
      if (!id || !state.calendarsById[id]) return false;
      const calendarsById = { ...state.calendarsById };
      delete calendarsById[id];
      set({ calendarsById, eventsById: recolor(state.eventsById, calendarsById) });
      return true;
    }
    default:
      // tag.* frames carry no data this store renders.
      return false;
  }
}

/* ------------------------------------------------------------------- store */

const initialState: EventsState = {
  eventsById: {},
  calendarsById: {},
  fetchedRange: null,
  lastSyncAt: null,
  syncing: false,
  error: null,
  errorId: 0,
  errorAt: null,
  hydrated: false,
};

/** The error half of a state update — always moves `errorId`. */
function raise(message: string, current: EventsState): Partial<EventsState> {
  return { error: message, errorId: current.errorId + 1, errorAt: Date.now() };
}

/** Clearing an error leaves `errorId` alone; nothing new happened. */
const cleared: Partial<EventsState> = { error: null };

export const useEvents = create<EventsStore>()((set, get) => ({
  ...initialState,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(EVENTS_CACHE_KEY);
      if (raw) {
        const snapshot = JSON.parse(raw) as CacheSnapshot;
        // v1 snapshots (no per-event `updatedAt`) still load — the field is
        // optional, and dropping a user's offline cache to add it would be a
        // poor trade for one race-resolution hint.
        if (snapshot?.version === 1 || snapshot?.version === 2) {
          const eventsById: Record<string, AppEvent> = {};
          for (const cached of snapshot.events ?? []) {
            const event = deserializeEvent(cached);
            if (event) eventsById[event.id] = event;
          }
          set({
            eventsById,
            calendarsById: keyById(snapshot.calendars ?? []),
            fetchedRange: snapshot.fetchedRange ?? null,
            lastSyncAt: snapshot.lastSyncAt ?? null,
          });
        }
      }
    } catch {
      // Corrupt cache: start empty rather than refusing to launch.
    } finally {
      set({ hydrated: true });
    }
  },

  sync: async (partial) => {
    const now = new Date();
    const range: DateRange = { ...defaultRange(now), ...partial };
    const epoch = dataEpoch;
    set({ syncing: true, ...cleared });
    const closeWindow = openSyncWindow();

    try {
      const [calendars, wireEvents] = await Promise.all([
        listCalendars(),
        listAllEvents({ from: range.from, to: range.to }),
      ]);

      // Disconnected while this was in flight: the store (and the cache) have
      // been wiped on purpose, and this response describes a server the app is
      // no longer paired with. Drop it on the floor — reporting success is
      // right, because nothing failed; there is simply nowhere to put it.
      if (epoch !== dataEpoch) return { ok: true };

      const calendarsById = keyById(calendars);

      // Everything the server returned for this window is the truth for this
      // window: drop what we had inside it, keep what lies outside.
      const eventsById: Record<string, AppEvent> = {};
      for (const [id, event] of Object.entries(get().eventsById)) {
        if (!isWithinRange(event, range)) eventsById[id] = event;
      }
      for (const wire of wireEvents) {
        const event = toAppEvent(wire, calendarsById);
        // An SSE frame that landed mid-flight may already hold a newer copy
        // than the one this response was built from. Keep the newer.
        const held = eventsById[event.id];
        if (held && isNewer(held, event)) continue;
        eventsById[event.id] = event;
      }

      set({
        eventsById: recolor(pruneHorizon(eventsById, range, now), calendarsById),
        calendarsById,
        fetchedRange: mergeRange(get().fetchedRange, range),
        lastSyncAt: Date.now(),
        syncing: false,
        ...cleared,
        hydrated: true,
      });

      // Re-apply whatever arrived while the request was open, on top of the
      // snapshot that did not know about it.
      for (const frame of closeWindow()) reduceServerEvent(frame.type, frame.payload, set, get);

      if (epoch !== dataEpoch) return { ok: true };
      persistSnapshot(get());
      return { ok: true };
    } catch (error) {
      const message = messageOf(error);
      if (epoch !== dataEpoch) return { ok: false, error: message };
      // Keep whatever is on screen — a failed refresh must not empty the app.
      set({ syncing: false, ...raise(message, get()) });
      return { ok: false, error: message };
    } finally {
      // No-op when the success path already closed it.
      closeWindow();
    }
  },

  applyServerEvent: (type, payload) => {
    // Record before applying: `sync()` replays this frame on top of whatever
    // snapshot it lands, so the frame is not lost to the replace-within-range.
    recordFrame(type, payload);
    if (reduceServerEvent(type, payload, set, get)) persistSnapshot(get());
  },

  editEvent: async (id, patch) => {
    const previous = get().eventsById[id];
    if (!previous) return { ok: false, error: 'Event not found' };

    const epoch = dataEpoch;
    const optimistic = applyPatchLocally(previous, patch, get().calendarsById);
    set({ eventsById: { ...get().eventsById, [id]: optimistic }, ...cleared });

    try {
      const allDay = patch.allDay ?? previous.allDay;
      const updated = await apiUpdateEvent(id, toEventPatch(patch, allDay));
      if (epoch !== dataEpoch) return { ok: true };
      // The server may normalise fields (all-day snapping, trimmed strings).
      const authoritative = toAppEvent(updated, get().calendarsById);
      set({ eventsById: { ...get().eventsById, [id]: authoritative } });
      persistSnapshot(get());
      return { ok: true };
    } catch (error) {
      const message = messageOf(error);
      if (epoch !== dataEpoch) return { ok: false, error: message };
      set({
        eventsById: { ...get().eventsById, [id]: previous },
        ...raise(message, get()),
      });
      return { ok: false, error: message };
    }
  },

  removeEvent: async (id) => {
    const previous = get().eventsById[id];
    if (!previous) return { ok: false, error: 'Event not found' };

    const epoch = dataEpoch;
    const optimistic = { ...get().eventsById };
    delete optimistic[id];
    set({ eventsById: optimistic, ...cleared });

    try {
      await apiDeleteEvent(id);
      if (epoch !== dataEpoch) return { ok: true };
      persistSnapshot(get());
      return { ok: true };
    } catch (error) {
      const message = messageOf(error);
      if (epoch !== dataEpoch) {
        return error instanceof ApiError && error.status === 404
          ? { ok: true }
          : { ok: false, error: message };
      }
      // A 404 means it is already gone server-side; the optimistic delete was
      // right, so keep it rather than resurrecting a phantom.
      if (error instanceof ApiError && error.status === 404) {
        persistSnapshot(get());
        return { ok: true };
      }
      set({
        eventsById: { ...get().eventsById, [id]: previous },
        ...raise(message, get()),
      });
      return { ok: false, error: message };
    }
  },

  clear: async () => {
    // Invalidate every in-flight request's continuation *before* emptying the
    // store, so none of them can write the old server's data back.
    dataEpoch += 1;
    bufferedFrames = [];
    set({ ...initialState, errorId: get().errorId, hydrated: true });
    cacheWrite = cacheWrite
      .then(() => AsyncStorage.removeItem(EVENTS_CACHE_KEY))
      .catch(() => undefined);
    await cacheWrite;
  },
}));

/* --------------------------------------------------------------- selectors */

/**
 * Per-`eventsById` memo tables. A WeakMap keyed on the state object means the
 * cache dies with the state it describes — no invalidation to get wrong.
 */
const sortedCache = new WeakMap<object, AppEvent[]>();
const dayCache = new WeakMap<object, Map<string, AppEvent[]>>();
const upcomingCache = new WeakMap<object, Map<string, AppEvent[]>>();
const splitCache = new WeakMap<object, Map<string, DayEvents>>();

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function memoize(
  cache: WeakMap<object, Map<string, AppEvent[]>>,
  eventsById: Record<string, AppEvent>,
  key: string,
  compute: () => AppEvent[],
): AppEvent[] {
  let table = cache.get(eventsById);
  if (!table) {
    table = new Map();
    cache.set(eventsById, table);
  }
  const hit = table.get(key);
  if (hit) return hit;
  const value = compute();
  table.set(key, value);
  return value;
}

/** All known events, chronological. Stable reference per state. */
export function selectSortedEvents(state: EventsState): AppEvent[] {
  const hit = sortedCache.get(state.eventsById);
  if (hit) return hit;
  const sorted = Object.values(state.eventsById).sort(compareEvents);
  sortedCache.set(state.eventsById, sorted);
  return sorted;
}

/**
 * Events overlapping the calendar day — a multi-day or all-day event appears
 * on each day it touches, which is what the timeline and month dots expect.
 *
 * Membership is {@link occursOnDay}: **end-exclusive**. Anything that walks days
 * itself (the month grid's dots, a week strip) must use the same helper rather
 * than reimplement the comparison, or the two will disagree about a 22:00–24:00
 * event.
 */
export function eventsOnDay(state: EventsState, date: Date): AppEvent[] {
  const key = dayKey(date);
  return memoize(dayCache, state.eventsById, key, () =>
    selectSortedEvents(state).filter((event) => occursOnDay(event, date)),
  );
}

/** Empty, frozen, and reference-stable — so memoized selectors stay stable. */
const NO_EVENTS: AppEvent[] = [];
const EMPTY_DAY: DayEvents = { allDay: NO_EVENTS, timed: NO_EVENTS };

/** A day's events, separated the way the calendar screen draws them. */
export interface DayEvents {
  /** All-day entries: a chip row above the timeline. */
  allDay: AppEvent[];
  /** Everything else — and the **only** thing `layoutDay` may be given. */
  timed: AppEvent[];
}

/**
 * {@link eventsOnDay}, pre-split into all-day and timed.
 *
 * Feeding an all-day event to `layoutDay` wrecks the timeline: it spans the
 * whole day, so the window opens to 00:00–24:00 and every timed event on that
 * day is squeezed into half a lane from midnight to midnight. Screens should
 * take `timed` for the layout and render `allDay` separately.
 */
export function dayEvents(state: EventsState, date: Date): DayEvents {
  const events = eventsOnDay(state, date);
  if (events.length === 0) return EMPTY_DAY;
  let table = splitCache.get(state.eventsById);
  if (!table) {
    table = new Map();
    splitCache.set(state.eventsById, table);
  }
  const key = dayKey(date);
  const hit = table.get(key);
  if (hit) return hit;
  const value = splitAllDay(events);
  table.set(key, value);
  return value;
}

/** Everything not yet finished, from the start of `from`'s day onward. */
export function upcoming(state: EventsState, from: Date = new Date()): AppEvent[] {
  const key = dayKey(from);
  return memoize(upcomingCache, state.eventsById, key, () => {
    const cutoff = startOfDay(from).getTime();
    return selectSortedEvents(state).filter((event) => event.end.getTime() >= cutoff);
  });
}

export const selectEventsOnDay =
  (date: Date) =>
  (state: EventsState): AppEvent[] =>
    eventsOnDay(state, date);

export const selectUpcoming =
  (from: Date) =>
  (state: EventsState): AppEvent[] =>
    upcoming(state, from);

export const selectEvent =
  (id: string) =>
  (state: EventsState): AppEvent | undefined =>
    state.eventsById[id];

export const selectCalendar =
  (id: string) =>
  (state: EventsState): Calendar | undefined =>
    state.calendarsById[id];

export const selectDayEvents =
  (date: Date) =>
  (state: EventsState): DayEvents =>
    dayEvents(state, date);

export const selectSyncing = (state: EventsState): boolean => state.syncing;
export const selectLastSyncAt = (state: EventsState): number | null => state.lastSyncAt;

/* ---------------------------------------------------------- error signal */

/**
 * A failure the UI can react to. `id` moves on every new error — including a
 * repeat of the same message — so `useEffect(..., [signal.id])` fires a toast
 * once per failure and never twice for one.
 */
export interface ErrorSignal {
  message: string;
  id: number;
  at: number;
}

/**
 * The latest signal, memoized so repeated calls on the same state return the
 * same object — zustand v5 goes through `useSyncExternalStore`, which loops
 * forever if a selector builds a fresh object each time.
 */
let lastSignal: ErrorSignal | null = null;

/** `null` while everything is fine. Reference-stable between changes. */
export function selectErrorSignal(state: EventsState): ErrorSignal | null {
  if (!state.error) return null;
  if (lastSignal && lastSignal.id === state.errorId && lastSignal.message === state.error) {
    return lastSignal;
  }
  lastSignal = { message: state.error, id: state.errorId, at: state.errorAt ?? 0 };
  return lastSignal;
}

export const useErrorSignal = (): ErrorSignal | null => useEvents(selectErrorSignal);

/* -------------------------------------------------------------------- hooks */

export const useEventsOnDay = (date: Date): AppEvent[] => useEvents((s) => eventsOnDay(s, date));
/** All-day and timed events for a day, already separated. See {@link dayEvents}. */
export const useDayEvents = (date: Date): DayEvents => useEvents((s) => dayEvents(s, date));
export const useUpcomingEvents = (from: Date = new Date()): AppEvent[] =>
  useEvents((s) => upcoming(s, from));
export const useEvent = (id: string): AppEvent | undefined => useEvents((s) => s.eventsById[id]);
export const useCalendar = (id: string): Calendar | undefined =>
  useEvents((s) => s.calendarsById[id]);
export const useSyncing = (): boolean => useEvents(selectSyncing);

/** Non-reactive read, for callbacks and non-React code. */
export const getEventsState = (): EventsStore => useEvents.getState();
