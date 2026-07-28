/**
 * Events store tests: sync normalization, offline cache round-trip,
 * optimistic edit/delete with rollback, and SSE patching.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { setFetchImplementation, setUnauthorizedHandler } from '@/api/client';
import { clearSession, resetSessionCache, saveSession } from '@/api/session';
import type { AppEvent, Calendar, YotEvent } from '@/api/types';
import { paletteColorForId } from '@/api/types';
import { occursOnDay } from '@/lib/dates';
import {
  EVENTS_CACHE_KEY,
  HORIZON_LABEL,
  SYNC_HORIZON,
  dayEvents,
  defaultRange,
  eventsOnDay,
  selectErrorSignal,
  selectSortedEvents,
  upcoming,
  useEvents,
  whenCachePersisted,
} from '@/store/events';

const BASE = 'https://cal.example.com';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  } as unknown as Response;
}

function wireEvent(overrides: Partial<YotEvent> = {}): YotEvent {
  return {
    id: 'evt_1',
    calendar_id: 'cal_work',
    title: 'Team sync',
    description: null,
    context: null,
    location: null,
    start_at: '2026-07-28T09:00:00.000Z',
    end_at: '2026-07-28T10:00:00.000Z',
    all_day: false,
    image_path: null,
    url: null,
    source_uid: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    tags: [],
    reminders: [],
    ...overrides,
  };
}

const workCalendar: Calendar = {
  id: 'cal_work',
  name: 'Work',
  color: '#3b82f6',
  description: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

/** Routes /calendars and /events; everything else 404s. */
function serveDataset(calendars: Calendar[], events: YotEvent[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  setFetchImplementation(async (url, init) => {
    calls.push({ url, init });
    if (url.includes('/api/calendars')) return jsonResponse(calendars);
    if (url.includes('/api/events?')) return jsonResponse(events);
    return jsonResponse({ error: { code: 'not_found', message: 'Not found' } }, 404);
  });
  return calls;
}

/** A normalized store event, for tests that seed `eventsById` directly. */
function toAppEventFixture(id: string): AppEvent {
  return {
    id,
    calendarId: 'cal_work',
    title: id,
    start: new Date('2026-07-28T09:00:00.000Z'),
    end: new Date('2026-07-28T10:00:00.000Z'),
    allDay: false,
    color: '#3b82f6',
  };
}

const initial = { ...useEvents.getState() };

beforeEach(async () => {
  setUnauthorizedHandler(null);
  await AsyncStorage.clear();
  resetSessionCache();
  await saveSession({ baseUrl: BASE, key: 'cal_secret' });
  useEvents.setState({
    ...initial,
    eventsById: {},
    calendarsById: {},
    fetchedRange: null,
    lastSyncAt: null,
    syncing: false,
    error: null,
    hydrated: false,
  });
});

afterEach(async () => {
  setFetchImplementation(null);
  await clearSession();
  resetSessionCache();
});

describe('sync', () => {
  it('normalizes wire events (ISO→Date, calendar colour) and records the range', async () => {
    serveDataset([workCalendar], [wireEvent()]);

    const result = await useEvents.getState().sync();

    expect(result).toEqual({ ok: true });
    const state = useEvents.getState();
    const event = state.eventsById.evt_1;
    expect(event.start).toBeInstanceOf(Date);
    expect(event.start.toISOString()).toBe('2026-07-28T09:00:00.000Z');
    expect(event.calendarId).toBe('cal_work');
    expect(event.color).toBe('#3b82f6');
    expect(state.fetchedRange).not.toBeNull();
    expect(state.lastSyncAt).toEqual(expect.any(Number));
    expect(state.syncing).toBe(false);
    expect(state.error).toBeNull();
  });

  it('falls back to the hashed palette colour when the calendar has none', async () => {
    serveDataset([{ ...workCalendar, color: null }], [wireEvent()]);
    await useEvents.getState().sync();
    expect(useEvents.getState().eventsById.evt_1.color).toBe(paletteColorForId('evt_1'));
  });

  it('replaces events inside the synced range and keeps ones outside it', async () => {
    const range = { from: '2026-07-01T00:00:00.000Z', to: '2026-07-31T23:59:59.999Z' };
    serveDataset([workCalendar], [wireEvent({ id: 'evt_in' })]);
    await useEvents.getState().sync(range);

    // A stale in-range event and a cached out-of-range one.
    const inRangeStale = {
      ...useEvents.getState().eventsById.evt_in,
      id: 'evt_stale',
      title: 'Deleted on server',
    };
    const outOfRange = {
      ...useEvents.getState().eventsById.evt_in,
      id: 'evt_far',
      start: new Date('2026-10-01T09:00:00.000Z'),
      end: new Date('2026-10-01T10:00:00.000Z'),
    };
    useEvents.setState((s) => ({
      eventsById: { ...s.eventsById, evt_stale: inRangeStale, evt_far: outOfRange },
    }));

    serveDataset([workCalendar], [wireEvent({ id: 'evt_in', title: 'Fresh' })]);
    await useEvents.getState().sync(range);

    const ids = Object.keys(useEvents.getState().eventsById).sort();
    expect(ids).toEqual(['evt_far', 'evt_in']);
    expect(useEvents.getState().eventsById.evt_in.title).toBe('Fresh');
  });

  it('keeps existing data and surfaces the message when the fetch fails', async () => {
    serveDataset([workCalendar], [wireEvent()]);
    await useEvents.getState().sync();

    setFetchImplementation(async () => {
      throw new TypeError('Network request failed');
    });
    const result = await useEvents.getState().sync();

    expect(result.ok).toBe(false);
    const state = useEvents.getState();
    expect(state.eventsById.evt_1).toBeDefined();
    expect(state.error).toEqual(expect.any(String));
    expect(state.syncing).toBe(false);
  });

  it('uses the horizon as the default window', () => {
    const range = defaultRange(new Date('2026-07-28T12:00:00.000Z'));
    expect(Date.parse(range.from)).toBeLessThanOrEqual(Date.parse('2026-06-01T23:59:59.000Z'));
    expect(Date.parse(range.to)).toBeGreaterThanOrEqual(Date.parse('2026-10-31T00:00:00.000Z'));
  });
});

describe('offline cache', () => {
  it('hydrate() restores the last synced snapshot with real Dates', async () => {
    serveDataset([workCalendar], [wireEvent()]);
    await useEvents.getState().sync();
    await whenCachePersisted();

    // Fresh launch: blank memory, same storage.
    useEvents.setState({
      eventsById: {},
      calendarsById: {},
      fetchedRange: null,
      lastSyncAt: null,
      hydrated: false,
    });
    await useEvents.getState().hydrate();

    const state = useEvents.getState();
    expect(state.hydrated).toBe(true);
    expect(state.eventsById.evt_1.start).toBeInstanceOf(Date);
    expect(state.eventsById.evt_1.start.toISOString()).toBe('2026-07-28T09:00:00.000Z');
    expect(state.calendarsById.cal_work.name).toBe('Work');
    expect(state.lastSyncAt).toEqual(expect.any(Number));
  });

  it('survives a corrupt cache by starting empty', async () => {
    await AsyncStorage.setItem(EVENTS_CACHE_KEY, '{not json');
    await useEvents.getState().hydrate();
    expect(useEvents.getState().hydrated).toBe(true);
    expect(useEvents.getState().eventsById).toEqual({});
  });
});

describe('optimistic edit', () => {
  beforeEach(async () => {
    serveDataset([workCalendar], [wireEvent()]);
    await useEvents.getState().sync();
  });

  it('applies immediately, then adopts the server copy on success', async () => {
    setFetchImplementation(async (url, init) => {
      expect(init?.method).toBe('PATCH');
      expect(url).toContain('/api/events/evt_1');
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({ title: 'Renamed (server-trimmed)'.trim(), location: null });
      return jsonResponse(
        wireEvent({ title: 'Renamed (server-trimmed)', location: null, updated_at: 'x' }),
      );
    });

    const promise = useEvents.getState().editEvent('evt_1', {
      title: 'Renamed (server-trimmed)',
      location: null,
    });
    // Optimistic copy is visible before the request resolves.
    expect(useEvents.getState().eventsById.evt_1.title).toBe('Renamed (server-trimmed)');

    await expect(promise).resolves.toEqual({ ok: true });
    expect(useEvents.getState().eventsById.evt_1.title).toBe('Renamed (server-trimmed)');
    expect(useEvents.getState().eventsById.evt_1.location).toBeUndefined();
  });

  it('rolls back to the exact previous object when the PATCH fails', async () => {
    const before = useEvents.getState().eventsById.evt_1;
    setFetchImplementation(async () =>
      jsonResponse({ error: { code: 'validation_error', message: 'Invalid body' } }, 400),
    );

    const promise = useEvents.getState().editEvent('evt_1', { title: 'Doomed edit' });
    expect(useEvents.getState().eventsById.evt_1.title).toBe('Doomed edit');

    const result = await promise;
    expect(result).toEqual({ ok: false, error: 'Invalid body' });
    expect(useEvents.getState().eventsById.evt_1).toBe(before); // same reference
    expect(useEvents.getState().error).toBe('Invalid body');
  });

  it('refuses to edit an unknown event', async () => {
    await expect(useEvents.getState().editEvent('ghost', { title: 'x' })).resolves.toEqual({
      ok: false,
      error: 'Event not found',
    });
  });
});

describe('optimistic delete', () => {
  beforeEach(async () => {
    serveDataset([workCalendar], [wireEvent()]);
    await useEvents.getState().sync();
  });

  it('removes immediately and stays removed on 204', async () => {
    setFetchImplementation(async (_url, init) => {
      expect(init?.method).toBe('DELETE');
      return jsonResponse(undefined, 204);
    });

    const promise = useEvents.getState().removeEvent('evt_1');
    expect(useEvents.getState().eventsById.evt_1).toBeUndefined();
    await expect(promise).resolves.toEqual({ ok: true });
    expect(useEvents.getState().eventsById.evt_1).toBeUndefined();
  });

  it('restores the event when the DELETE fails', async () => {
    const before = useEvents.getState().eventsById.evt_1;
    setFetchImplementation(async () =>
      jsonResponse({ error: { code: 'internal_error', message: 'boom' } }, 500),
    );

    const result = await useEvents.getState().removeEvent('evt_1');

    expect(result).toEqual({ ok: false, error: 'boom' });
    expect(useEvents.getState().eventsById.evt_1).toBe(before);
  });

  it('treats a 404 as success — the event was already gone', async () => {
    setFetchImplementation(async () =>
      jsonResponse({ error: { code: 'not_found', message: 'Not found' } }, 404),
    );
    await expect(useEvents.getState().removeEvent('evt_1')).resolves.toEqual({ ok: true });
    expect(useEvents.getState().eventsById.evt_1).toBeUndefined();
  });
});

describe('applyServerEvent', () => {
  it('upserts on event.created/updated and drops on event.deleted', () => {
    const store = useEvents.getState();
    store.applyServerEvent('event.created', wireEvent({ id: 'sse_1', title: 'From SSE' }));
    expect(useEvents.getState().eventsById.sse_1.title).toBe('From SSE');

    useEvents
      .getState()
      .applyServerEvent('event.updated', wireEvent({ id: 'sse_1', title: 'Edited elsewhere' }));
    expect(useEvents.getState().eventsById.sse_1.title).toBe('Edited elsewhere');

    useEvents.getState().applyServerEvent('event.deleted', { id: 'sse_1' });
    expect(useEvents.getState().eventsById.sse_1).toBeUndefined();
  });

  it('recolours events when their calendar changes colour', () => {
    useEvents.getState().applyServerEvent('calendar.created', { ...workCalendar, color: null });
    useEvents.getState().applyServerEvent('event.created', wireEvent({ id: 'e_col' }));
    expect(useEvents.getState().eventsById.e_col.color).toBe(paletteColorForId('e_col'));

    useEvents
      .getState()
      .applyServerEvent('calendar.updated', { ...workCalendar, color: '#123456' });
    expect(useEvents.getState().eventsById.e_col.color).toBe('#123456');
  });
});

/**
 * M2: these used to assert local-calendar-day membership against fixtures
 * written as UTC instants, so the whole block only held in UTC — `09:00Z` on the
 * 28th is 18:00 local in Tokyo and 05:00 in New York, and `22:00Z` is the *29th*
 * in Tokyo. Fixtures now name a local wall-clock time and are converted to the
 * instant the server would have sent, which means the same thing everywhere.
 */
const JUL = 6;

/** The ISO instant a server would store for this local wall-clock time. */
function localIso(year: number, month: number, day: number, hour = 0, minute = 0): string {
  return new Date(year, month, day, hour, minute, 0, 0).toISOString();
}

/** Local midnight, for day arguments to the selectors. */
function localDay(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 0, 0, 0, 0);
}

describe('selectors', () => {
  beforeEach(() => {
    for (const [id, start, end] of [
      ['a', localIso(2026, JUL, 28, 9), localIso(2026, JUL, 28, 10)],
      ['b', localIso(2026, JUL, 28, 22), localIso(2026, JUL, 29, 2)], // crosses midnight
      ['c', localIso(2026, JUL, 30, 9), localIso(2026, JUL, 30, 10)],
      ['d', localIso(2026, JUL, 20, 9), localIso(2026, JUL, 20, 10)], // past
    ] as const) {
      useEvents
        .getState()
        .applyServerEvent('event.created', wireEvent({ id, start_at: start, end_at: end }));
    }
  });

  it('eventsOnDay includes multi-day overlaps and sorts chronologically', () => {
    const state = useEvents.getState();
    expect(eventsOnDay(state, localDay(2026, JUL, 29)).map((e) => e.id)).toEqual(['b']);
    expect(eventsOnDay(state, localDay(2026, JUL, 28)).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('upcoming drops finished events and keeps order', () => {
    const list = upcoming(useEvents.getState(), new Date(localIso(2026, JUL, 28, 12)));
    expect(list.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns stable references for unchanged state', () => {
    const state = useEvents.getState();
    const day = localDay(2026, JUL, 28);
    expect(eventsOnDay(state, day)).toBe(eventsOnDay(state, day));
    expect(upcoming(state, day)).toBe(upcoming(state, day));
    expect(selectSortedEvents(state)).toBe(selectSortedEvents(state));
    expect(dayEvents(state, day)).toBe(dayEvents(state, day));
  });
});

/* ------------------------------------------------------------------- M1 */

describe('eventsOnDay membership (M1)', () => {
  it('keeps an event ending exactly at midnight off the next day', () => {
    // 22:00 → 00:00. End-inclusive membership drew a 3px blip at 00:00 on the
    // 29th, and if it was that day's only event the window collapsed to 0:00–1:00.
    useEvents.getState().applyServerEvent(
      'event.created',
      wireEvent({ id: 'late', start_at: localIso(2026, JUL, 28, 22), end_at: localIso(2026, JUL, 29) }),
    );

    const state = useEvents.getState();
    expect(eventsOnDay(state, localDay(2026, JUL, 28)).map((e) => e.id)).toEqual(['late']);
    expect(eventsOnDay(state, localDay(2026, JUL, 29))).toEqual([]);
  });

  it('exposes the same membership rule the day-walking UI must reuse', () => {
    const event = {
      start: new Date(localIso(2026, JUL, 28, 22)),
      end: new Date(localIso(2026, JUL, 29)),
    };
    expect(occursOnDay(event, localDay(2026, JUL, 28))).toBe(true);
    expect(occursOnDay(event, localDay(2026, JUL, 29))).toBe(false);
  });
});

/* ------------------------------------------------------------------- H3 */

describe('all-day events (H3)', () => {
  /** Yot's storage form: UTC midnight of the calendar date. */
  const allDayWire = (id: string, from: string, to: string) =>
    wireEvent({ id, all_day: true, start_at: `${from}T00:00:00.000Z`, end_at: `${to}T00:00:00.000Z` });

  it('lands on its own calendar day, in any time zone', () => {
    useEvents.getState().applyServerEvent('event.created', allDayWire('holiday', '2026-07-28', '2026-07-28'));

    const state = useEvents.getState();
    expect(eventsOnDay(state, localDay(2026, JUL, 27))).toEqual([]);
    expect(eventsOnDay(state, localDay(2026, JUL, 28)).map((e) => e.id)).toEqual(['holiday']);
    expect(eventsOnDay(state, localDay(2026, JUL, 29))).toEqual([]);
  });

  it('spans every calendar day of a multi-day entry', () => {
    useEvents.getState().applyServerEvent('event.created', allDayWire('trip', '2026-07-28', '2026-07-31'));

    const state = useEvents.getState();
    for (const day of [28, 29, 30]) {
      expect(eventsOnDay(state, localDay(2026, JUL, day)).map((e) => e.id)).toEqual(['trip']);
    }
    expect(eventsOnDay(state, localDay(2026, JUL, 31))).toEqual([]);
    expect(eventsOnDay(state, localDay(2026, JUL, 27))).toEqual([]);
  });

  it('never reaches the timeline input: dayEvents splits it out', () => {
    const store = useEvents.getState();
    store.applyServerEvent('event.created', allDayWire('holiday', '2026-07-28', '2026-07-28'));
    store.applyServerEvent(
      'event.created',
      wireEvent({ id: 'standup', start_at: localIso(2026, JUL, 28, 9), end_at: localIso(2026, JUL, 28, 10) }),
    );

    const { allDay, timed } = dayEvents(useEvents.getState(), localDay(2026, JUL, 28));

    expect(allDay.map((e) => e.id)).toEqual(['holiday']);
    expect(timed.map((e) => e.id)).toEqual(['standup']);
    // Feeding the all-day entry to layoutDay would open the window to the whole
    // day and squeeze the standup into half a lane from midnight to midnight.
    expect(timed.every((e) => !e.allDay)).toBe(true);
  });

  it('reports an empty, stable split for a day with nothing on it', () => {
    const state = useEvents.getState();
    const empty = dayEvents(state, localDay(2026, JUL, 28));
    expect(empty).toEqual({ allDay: [], timed: [] });
    expect(dayEvents(state, localDay(2026, JUL, 29))).toBe(empty);
  });
});

/**
 * M2: a deliberate non-UTC case. The instants below carry explicit offsets, so
 * they mean one fixed moment whatever zone the suite runs in — which is exactly
 * how a real payload from a server in another zone looks.
 */
describe('explicit-offset payloads (M2)', () => {
  it('places a timed event on the calendar day it falls on locally', () => {
    // 2026-07-28 09:00+09:00 == 2026-07-28T00:00:00Z.
    useEvents.getState().applyServerEvent(
      'event.created',
      wireEvent({ id: 'tokyo', start_at: '2026-07-28T09:00:00+09:00', end_at: '2026-07-28T10:00:00+09:00' }),
    );

    const event = useEvents.getState().eventsById.tokyo;
    expect(event.start.toISOString()).toBe('2026-07-28T00:00:00.000Z');
    // Whatever the local day of that instant is, the selector agrees with it.
    expect(eventsOnDay(useEvents.getState(), event.start).map((e) => e.id)).toEqual(['tokyo']);
  });

  it('ignores the offset for an all-day event and uses the date part', () => {
    // A server that writes all-day entries with a non-Z offset still means the
    // date it names; -05:00 must not drag it back to the 27th.
    useEvents.getState().applyServerEvent(
      'event.created',
      wireEvent({
        id: 'party',
        all_day: true,
        start_at: '2026-07-28T00:00:00.000Z',
        end_at: '2026-07-29T00:00:00.000Z',
      }),
    );

    const event = useEvents.getState().eventsById.party;
    expect(event.start.getDate()).toBe(28);
    expect(event.start.getHours()).toBe(0);
    expect(eventsOnDay(useEvents.getState(), localDay(2026, JUL, 28)).map((e) => e.id)).toEqual([
      'party',
    ]);
    expect(eventsOnDay(useEvents.getState(), localDay(2026, JUL, 27))).toEqual([]);
  });
});

/* ------------------------------------------------------------------- H2 */

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * Serve `/events` only once the returned gate is released, so a test can slip
 * SSE frames into the window while the request is in flight.
 */
function serveGated(calendars: Calendar[], events: YotEvent[]) {
  const gate = deferred<void>();
  setFetchImplementation(async (url) => {
    if (url.includes('/api/calendars')) return jsonResponse(calendars);
    if (url.includes('/api/events?')) {
      await gate.promise;
      return jsonResponse(events);
    }
    return jsonResponse({ error: { code: 'not_found', message: 'Not found' } }, 404);
  });
  return gate;
}

const RANGE = { from: '2026-07-01T00:00:00.000Z', to: '2026-07-31T23:59:59.999Z' };

describe('SSE frames racing a sync (H2)', () => {
  it('keeps an event created while the sync was in flight', async () => {
    const gate = serveGated([workCalendar], [wireEvent({ id: 'evt_known' })]);
    const syncing = useEvents.getState().sync(RANGE);

    // The server answered as of the moment the request was made, so this event
    // is not in the response — the replace-within-range used to delete it.
    useEvents
      .getState()
      .applyServerEvent('event.created', wireEvent({ id: 'evt_new', title: 'Born mid-sync' }));
    expect(useEvents.getState().eventsById.evt_new).toBeDefined();

    gate.resolve();
    await expect(syncing).resolves.toEqual({ ok: true });

    expect(useEvents.getState().eventsById.evt_new?.title).toBe('Born mid-sync');
    expect(useEvents.getState().eventsById.evt_known).toBeDefined();
  });

  it('keeps an event deleted while the sync was in flight deleted', async () => {
    serveDataset([workCalendar], [wireEvent({ id: 'evt_doomed' })]);
    await useEvents.getState().sync(RANGE);
    expect(useEvents.getState().eventsById.evt_doomed).toBeDefined();

    // The in-flight response still contains it — it was deleted after the query.
    const gate = serveGated([workCalendar], [wireEvent({ id: 'evt_doomed' })]);
    const syncing = useEvents.getState().sync(RANGE);

    useEvents.getState().applyServerEvent('event.deleted', { id: 'evt_doomed' });
    expect(useEvents.getState().eventsById.evt_doomed).toBeUndefined();

    gate.resolve();
    await syncing;

    // It used to be resurrected by the snapshot.
    expect(useEvents.getState().eventsById.evt_doomed).toBeUndefined();
  });

  it('keeps the newer copy when an update echo races the snapshot', async () => {
    // The snapshot carries the pre-edit copy; the echo of the user's own PATCH
    // arrives mid-flight and is newer.
    const gate = serveGated(
      [workCalendar],
      [wireEvent({ id: 'evt_1', title: 'Before', updated_at: '2026-07-01T00:00:00.000Z' })],
    );
    const syncing = useEvents.getState().sync(RANGE);

    useEvents.getState().applyServerEvent(
      'event.updated',
      wireEvent({ id: 'evt_1', title: 'After', updated_at: '2026-07-02T00:00:00.000Z' }),
    );

    gate.resolve();
    await syncing;

    expect(useEvents.getState().eventsById.evt_1.title).toBe('After');
  });

  it('lets the snapshot win when it is the newer copy', async () => {
    const gate = serveGated(
      [workCalendar],
      [wireEvent({ id: 'evt_1', title: 'Server truth', updated_at: '2026-07-09T00:00:00.000Z' })],
    );
    const syncing = useEvents.getState().sync(RANGE);

    useEvents.getState().applyServerEvent(
      'event.updated',
      wireEvent({ id: 'evt_1', title: 'Stale frame', updated_at: '2026-07-01T00:00:00.000Z' }),
    );

    gate.resolve();
    await syncing;

    expect(useEvents.getState().eventsById.evt_1.title).toBe('Server truth');
  });

  it('persists the replayed result, not the pre-replay snapshot', async () => {
    const gate = serveGated([workCalendar], [wireEvent({ id: 'evt_known' })]);
    const syncing = useEvents.getState().sync(RANGE);
    useEvents.getState().applyServerEvent('event.created', wireEvent({ id: 'evt_new' }));
    gate.resolve();
    await syncing;
    await whenCachePersisted();

    const raw = await AsyncStorage.getItem(EVENTS_CACHE_KEY);
    const ids = (JSON.parse(String(raw)).events as { id: string }[]).map((e) => e.id).sort();
    expect(ids).toEqual(['evt_known', 'evt_new']);
  });
});

/* ------------------------------------------------------------------- M5 */

describe('disconnect during an in-flight sync (M5)', () => {
  it('leaves the store and the cache empty', async () => {
    // Seed a cache so there is something for the stale continuation to restore.
    serveDataset([workCalendar], [wireEvent()]);
    await useEvents.getState().sync(RANGE);
    await whenCachePersisted();

    const gate = serveGated([workCalendar], [wireEvent({ id: 'evt_old_server' })]);
    const syncing = useEvents.getState().sync(RANGE);

    await useEvents.getState().clear();
    expect(useEvents.getState().eventsById).toEqual({});

    gate.resolve();
    await syncing;
    await whenCachePersisted();

    // The continuation used to `set()` the fetched events straight back, and
    // its `persistSnapshot` landed behind clear()'s removeItem on the same
    // write chain — so the next pairing opened on the old server's events.
    expect(useEvents.getState().eventsById).toEqual({});
    expect(useEvents.getState().calendarsById).toEqual({});
    expect(await AsyncStorage.getItem(EVENTS_CACHE_KEY)).toBeNull();
  });

  it('does not roll back an optimistic delete that a disconnect outran', async () => {
    serveDataset([workCalendar], [wireEvent()]);
    await useEvents.getState().sync(RANGE);

    const gate = deferred<void>();
    setFetchImplementation(async () => {
      await gate.promise;
      return jsonResponse({ error: { code: 'internal_error', message: 'boom' } }, 500);
    });

    const removing = useEvents.getState().removeEvent('evt_1');
    await useEvents.getState().clear();
    gate.resolve();
    await removing;

    expect(useEvents.getState().eventsById).toEqual({});
  });
});

/* ------------------------------------------------------------------- M7 */

describe('a non-JSON 200 (M7)', () => {
  const PORTAL = '<!doctype html><title>Sign in to WiFi</title>';

  function servePortal() {
    setFetchImplementation(async (url) => {
      if (url.includes('/api/calendars')) return jsonResponse([workCalendar]);
      if (url.includes('/api/events?')) {
        return { ok: true, status: 200, text: async () => PORTAL } as unknown as Response;
      }
      return jsonResponse({ error: { code: 'not_found', message: 'Not found' } }, 404);
    });
  }

  it('leaves the store untouched and surfaces an error', async () => {
    serveDataset([workCalendar], [wireEvent()]);
    await useEvents.getState().sync(RANGE);
    await whenCachePersisted();
    const before = useEvents.getState().eventsById;
    const cacheBefore = await AsyncStorage.getItem(EVENTS_CACHE_KEY);

    servePortal();
    const result = await useEvents.getState().sync(RANGE);

    // It used to come back as `[]`, be accepted as the truth for the window,
    // and be written to the cache — a captive portal wiped the app.
    expect(result.ok).toBe(false);
    expect(useEvents.getState().eventsById).toBe(before);
    expect(useEvents.getState().error).toEqual(expect.any(String));
    expect(useEvents.getState().syncing).toBe(false);
    await whenCachePersisted();
    expect(await AsyncStorage.getItem(EVENTS_CACHE_KEY)).toBe(cacheBefore);
  });
});

/* ------------------------------------------------------------------- M8 */

describe('the event horizon (M8)', () => {
  it('reaches one month back and three months forward', () => {
    const range = defaultRange(new Date(2026, JUL, 28, 12));
    expect(new Date(range.from).getMonth()).toBe(5); // June
    expect(new Date(range.to).getMonth()).toBe(9); // October
    expect(SYNC_HORIZON).toEqual({ monthsBack: 1, monthsForward: 3 });
    expect(HORIZON_LABEL).toEqual(expect.any(String));
  });

  it('drops cached events that have fallen off the back of it', async () => {
    const now = new Date();
    const at = (date: Date, id: string): AppEvent => ({
      ...toAppEventFixture(id),
      start: date,
      end: new Date(date.getTime() + 60 * 60 * 1000),
    });
    // Both lie *outside* the default window, so the replace-within-range does
    // not touch either — only the horizon prune can tell them apart.
    const ancient = at(new Date(now.getFullYear() - 2, 0, 1, 9), 'evt_ancient');
    const farFuture = at(new Date(now.getFullYear() + 1, 6, 1, 9), 'evt_far');
    useEvents.setState({ eventsById: { evt_ancient: ancient, evt_far: farFuture } });

    serveDataset([workCalendar], [wireEvent({ id: 'evt_in_window' })]);
    await useEvents.getState().sync();

    const ids = Object.keys(useEvents.getState().eventsById).sort();
    // The two-year-old copy is gone for good — nothing was ever going to
    // re-fetch that range and notice it had been deleted server-side. The
    // far-future one is real (SSE delivered it) and is kept until a sync whose
    // window reaches it can reconcile it properly.
    expect(ids).toEqual(['evt_far', 'evt_in_window']);
  });

  it('keeps what an explicitly older sync returned', async () => {
    const old = { from: '2020-01-01T00:00:00.000Z', to: '2020-01-31T00:00:00.000Z' };
    serveDataset(
      [workCalendar],
      [wireEvent({ id: 'evt_2020', start_at: '2020-01-15T09:00:00.000Z', end_at: '2020-01-15T10:00:00.000Z' })],
    );

    await useEvents.getState().sync(old);

    expect(useEvents.getState().eventsById.evt_2020).toBeDefined();
  });
});

/* ------------------------------------------------------------------- M3 */

describe('the error signal (M3)', () => {
  it('is null while everything is fine, and reference-stable', async () => {
    serveDataset([workCalendar], [wireEvent()]);
    await useEvents.getState().sync(RANGE);
    expect(selectErrorSignal(useEvents.getState())).toBeNull();
  });

  it('advances its id on every failure, even a repeated one', async () => {
    setFetchImplementation(async () => {
      throw new TypeError('Network request failed');
    });

    await useEvents.getState().sync(RANGE);
    const first = selectErrorSignal(useEvents.getState());
    await useEvents.getState().sync(RANGE);
    const second = selectErrorSignal(useEvents.getState());

    expect(first).not.toBeNull();
    expect(second?.message).toBe(first?.message);
    // Identical messages, two failures the user should see — `error` alone
    // never changes between them, so the id is what a toast keys on.
    expect(second!.id).toBe(first!.id + 1);
    expect(second!.at).toEqual(expect.any(Number));
  });

  it('returns the same object for the same state', async () => {
    setFetchImplementation(async () => {
      throw new TypeError('Network request failed');
    });
    await useEvents.getState().sync(RANGE);
    const state = useEvents.getState();
    expect(selectErrorSignal(state)).toBe(selectErrorSignal(state));
  });

  it('is raised by a failed edit and a failed delete too', async () => {
    serveDataset([workCalendar], [wireEvent()]);
    await useEvents.getState().sync(RANGE);
    const before = useEvents.getState().errorId;

    setFetchImplementation(async () =>
      jsonResponse({ error: { code: 'internal_error', message: 'boom' } }, 500),
    );

    await expect(useEvents.getState().editEvent('evt_1', { title: 'x' })).resolves.toEqual({
      ok: false,
      error: 'boom',
    });
    expect(useEvents.getState().errorId).toBe(before + 1);

    await expect(useEvents.getState().removeEvent('evt_1')).resolves.toEqual({
      ok: false,
      error: 'boom',
    });
    expect(useEvents.getState().errorId).toBe(before + 2);
    expect(selectErrorSignal(useEvents.getState())?.message).toBe('boom');
  });

  it('mutations resolve with a typed ok result', async () => {
    serveDataset([workCalendar], [wireEvent()]);
    await useEvents.getState().sync(RANGE);

    setFetchImplementation(async () => jsonResponse(wireEvent({ title: 'Renamed' })));
    await expect(useEvents.getState().editEvent('evt_1', { title: 'Renamed' })).resolves.toEqual({
      ok: true,
    });
  });
});
