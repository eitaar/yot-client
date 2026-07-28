import { eventPalette } from '@/theme/tokens';
import {
  type Calendar,
  type YotEvent,
  allDayLength,
  compareEvents,
  isApiErrorEnvelope,
  paletteColorForId,
  resolveEventColor,
  toAppEvent,
  toWireInstant,
} from '@/api/types';

function wireEvent(overrides: Partial<YotEvent> = {}): YotEvent {
  return {
    id: 'evt_1',
    calendar_id: 'cal_1',
    title: 'Team sync',
    description: null,
    context: null,
    location: null,
    start_at: '2026-05-29T11:00:00.000Z',
    end_at: '2026-05-29T12:30:00.000Z',
    all_day: false,
    image_path: null,
    url: null,
    source_uid: null,
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    tags: [],
    reminders: [],
    ...overrides,
  };
}

function calendar(overrides: Partial<Calendar> = {}): Calendar {
  return {
    id: 'cal_1',
    name: 'Work',
    color: '#3b82f6',
    description: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('toAppEvent', () => {
  it('parses ISO strings into Dates', () => {
    const event = toAppEvent(wireEvent());
    expect(event.start).toBeInstanceOf(Date);
    expect(event.start.toISOString()).toBe('2026-05-29T11:00:00.000Z');
    expect(event.end.toISOString()).toBe('2026-05-29T12:30:00.000Z');
  });

  it('renames to camelCase and turns nulls into absent fields', () => {
    const event = toAppEvent(wireEvent({ description: null, location: '  ', image_path: null }));
    expect(event.calendarId).toBe('cal_1');
    expect(event.description).toBeUndefined();
    expect(event.location).toBeUndefined();
    expect(event.imagePath).toBeUndefined();
    expect('description' in event).toBe(true); // present as undefined, not missing
  });

  it('keeps real values', () => {
    const event = toAppEvent(
      wireEvent({ description: 'Weekly', location: 'Room 3', image_path: 'a.jpg', all_day: true }),
    );
    expect(event.description).toBe('Weekly');
    expect(event.location).toBe('Room 3');
    expect(event.imagePath).toBe('a.jpg');
    expect(event.allDay).toBe(true);
  });

  it('falls back to the start when end_at is unparsable', () => {
    const event = toAppEvent(wireEvent({ end_at: 'not-a-date' }));
    expect(event.end.getTime()).toBe(event.start.getTime());
  });

  it('carries updated_at through for race resolution', () => {
    const event = toAppEvent(wireEvent({ updated_at: '2026-05-02T08:00:00.000Z' }));
    expect(event.updatedAt?.toISOString()).toBe('2026-05-02T08:00:00.000Z');
    expect(toAppEvent(wireEvent({ updated_at: 'nonsense' })).updatedAt).toBeUndefined();
  });
});

/**
 * H3: Yot stores an all-day event as the UTC instant whose *date part* is the
 * calendar date. Read as a plain instant it lands on the previous day for
 * anyone west of UTC and on the right day only by luck elsewhere.
 */
describe('toAppEvent — all-day (H3)', () => {
  const allDay = (start: string, end: string) =>
    toAppEvent(wireEvent({ all_day: true, start_at: start, end_at: end }));

  it('anchors "all day Jul 28" to local midnight on Jul 28, in any zone', () => {
    const event = allDay('2026-07-28T00:00:00.000Z', '2026-07-28T00:00:00.000Z');

    expect(event.allDay).toBe(true);
    expect(event.start.getFullYear()).toBe(2026);
    expect(event.start.getMonth()).toBe(6); // July
    expect(event.start.getDate()).toBe(28);
    expect(event.start.getHours()).toBe(0);
    expect(event.start.getMinutes()).toBe(0);
  });

  it('stores the end exclusively: one calendar day, ending next midnight', () => {
    // The web UI's form: start date === end date for a single-day event.
    const event = allDay('2026-07-28T00:00:00.000Z', '2026-07-28T00:00:00.000Z');
    expect(event.end.getDate()).toBe(29);
    expect(event.end.getHours()).toBe(0);
    expect(allDayLength(event)).toBe(1);
  });

  it('reads an ICS-style exclusive DTEND as the day it already means', () => {
    // `DTSTART;VALUE=DATE:20260728` / `DTEND;VALUE=DATE:20260729` — one day.
    const event = allDay('2026-07-28T00:00:00.000Z', '2026-07-29T00:00:00.000Z');
    expect(allDayLength(event)).toBe(1);
    expect(event.end.getDate()).toBe(29);
  });

  it('spans multiple days when the end date is further out', () => {
    const event = allDay('2026-07-28T00:00:00.000Z', '2026-07-31T00:00:00.000Z');
    expect(allDayLength(event)).toBe(3);
    expect(event.start.getDate()).toBe(28);
    expect(event.end.getDate()).toBe(31);
  });

  it('leaves timed events on their real instant', () => {
    const event = toAppEvent(wireEvent({ all_day: false, start_at: '2026-07-28T00:00:00.000Z' }));
    expect(event.start.toISOString()).toBe('2026-07-28T00:00:00.000Z');
  });

  it('round-trips back to the UTC-midnight form the server stores', () => {
    const event = allDay('2026-07-28T00:00:00.000Z', '2026-07-29T00:00:00.000Z');
    // Not `start.toISOString()`, which in Tokyo would say Jul 27.
    expect(toWireInstant(event.start, true)).toBe('2026-07-28T00:00:00.000Z');
    expect(toWireInstant(event.start, false)).toBe(event.start.toISOString());
  });
});

describe('colour resolution', () => {
  it('prefers the calendar colour', () => {
    const event = toAppEvent(wireEvent(), { cal_1: calendar({ color: '#3b82f6' }) });
    expect(event.color).toBe('#3b82f6');
  });

  it('hashes the id into the palette when the calendar has no colour', () => {
    const event = toAppEvent(wireEvent(), { cal_1: calendar({ color: null }) });
    expect(eventPalette).toContain(event.color);
    expect(event.color).toBe(paletteColorForId('evt_1'));
  });

  it('hashes when the calendar is unknown', () => {
    const event = toAppEvent(wireEvent({ calendar_id: 'cal_missing' }));
    expect(eventPalette).toContain(event.color);
  });

  it('is stable: the same id always resolves to the same colour', () => {
    const first = paletteColorForId('evt_alpha');
    for (let i = 0; i < 50; i += 1) expect(paletteColorForId('evt_alpha')).toBe(first);
  });

  it('spreads sequential ids across the whole trio', () => {
    const ids = Array.from({ length: 60 }, (_, i) => `evt_${i}`);
    const used = new Set(ids.map(paletteColorForId));
    expect(used.size).toBe(eventPalette.length);
  });

  it('ignores a blank calendar colour', () => {
    const color = resolveEventColor({ id: 'evt_1', calendar_id: 'cal_1' }, {
      cal_1: calendar({ color: '   ' }),
    });
    expect(color).toBe(paletteColorForId('evt_1'));
  });
});

describe('compareEvents', () => {
  it('sorts by start, then end, then id', () => {
    const a = toAppEvent(wireEvent({ id: 'b', start_at: '2026-05-29T09:00:00.000Z' }));
    const b = toAppEvent(wireEvent({ id: 'a', start_at: '2026-05-29T11:00:00.000Z' }));
    const c = toAppEvent(wireEvent({ id: 'c', start_at: '2026-05-29T09:00:00.000Z' }));
    expect([b, c, a].sort(compareEvents).map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('isApiErrorEnvelope', () => {
  it('recognises the documented shape only', () => {
    expect(isApiErrorEnvelope({ error: { code: 'not_found', message: 'Not found' } })).toBe(true);
    expect(isApiErrorEnvelope({ error: 'boom' })).toBe(false);
    expect(isApiErrorEnvelope({ message: 'boom' })).toBe(false);
    expect(isApiErrorEnvelope(null)).toBe(false);
    expect(isApiErrorEnvelope('nope')).toBe(false);
  });
});
