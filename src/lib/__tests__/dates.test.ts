import {
  ALL_DAY_LABEL,
  fmtClock,
  fmtEventStartLabel,
  fmtEventTimeRange,
  fmtTimeRange,
  groupUpcomingByDay,
  monthGrid,
  occursOnDay,
  relDayLabel,
  shortDayLabels,
  splitAllDay,
  weekOf,
} from '../dates';
import { wallMinutesBetween } from '../layoutDay';

const d = (y: number, m: number, day: number, h = 0, min = 0) =>
  new Date(y, m, day, h, min, 0, 0);

/** July 2026: starts on a Wednesday, 31 days — the design's month. */
const JUL = 6;
const TODAY = d(2026, JUL, 14, 9, 0); // Tuesday

describe('fmtClock', () => {
  it('formats 12h', () => {
    expect(fmtClock(d(2026, JUL, 14, 14, 30), '12h')).toBe('2:30 PM');
    expect(fmtClock(d(2026, JUL, 14, 9, 5), '12h')).toBe('9:05 AM');
    expect(fmtClock(d(2026, JUL, 14, 0, 0), '12h')).toBe('12:00 AM');
    expect(fmtClock(d(2026, JUL, 14, 12, 0), '12h')).toBe('12:00 PM');
  });

  it('formats 24h', () => {
    expect(fmtClock(d(2026, JUL, 14, 14, 30), '24h')).toBe('14:30');
    expect(fmtClock(d(2026, JUL, 14, 9, 5), '24h')).toBe('09:05');
    expect(fmtClock(d(2026, JUL, 14, 0, 0), '24h')).toBe('00:00');
  });
});

describe('fmtTimeRange', () => {
  it('drops the repeated meridiem and appends the duration', () => {
    expect(fmtTimeRange(d(2026, JUL, 14, 14, 30), d(2026, JUL, 14, 15, 30), '12h')).toBe(
      '2:30 – 3:30 PM · 1 hr',
    );
  });

  it('keeps both meridiems when the range crosses noon or midnight', () => {
    expect(fmtTimeRange(d(2026, JUL, 14, 11, 30), d(2026, JUL, 14, 13, 0), '12h')).toBe(
      '11:30 AM – 1:00 PM · 1 hr 30 min',
    );
  });

  it('formats 24h ranges', () => {
    expect(fmtTimeRange(d(2026, JUL, 14, 14, 30), d(2026, JUL, 14, 15, 0), '24h')).toBe(
      '14:30 – 15:00 · 30 min',
    );
  });
});

describe('relDayLabel', () => {
  it('labels today and tomorrow', () => {
    expect(relDayLabel(d(2026, JUL, 14, 18, 0), TODAY)).toBe('Today');
    expect(relDayLabel(d(2026, JUL, 15, 1, 0), TODAY)).toBe('Tomorrow');
  });

  it('falls back to the weekday name', () => {
    expect(relDayLabel(d(2026, JUL, 16), TODAY)).toBe('Thursday');
    expect(relDayLabel(d(2026, JUL, 19), TODAY)).toBe('Sunday');
  });

  it('compares calendar days, not elapsed hours', () => {
    // 23:59 today → still Today even though it is ~15h away
    expect(relDayLabel(d(2026, JUL, 14, 23, 59), TODAY)).toBe('Today');
  });
});

describe('shortDayLabels', () => {
  it('starts on the configured day', () => {
    expect(shortDayLabels('Sun')).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
    expect(shortDayLabels('Mon')).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  });
});

describe('monthGrid', () => {
  it('offsets July 2026 (a Wednesday start) for a Sunday week', () => {
    const cells = monthGrid(2026, JUL, 'Sun');
    expect(cells).toHaveLength(35);
    expect(cells.slice(0, 3)).toEqual([null, null, null]);
    expect(cells[3]?.getDate()).toBe(1);
    expect(cells[3]?.getDay()).toBe(3); // Wednesday
    expect(cells[33]?.getDate()).toBe(31);
    expect(cells[34]).toBeNull();
  });

  it('offsets July 2026 for a Monday week', () => {
    const cells = monthGrid(2026, JUL, 'Mon');
    expect(cells).toHaveLength(35);
    expect(cells.slice(0, 2)).toEqual([null, null]);
    expect(cells[2]?.getDate()).toBe(1);
    expect(cells[32]?.getDate()).toBe(31);
  });

  it('grows to 42 cells when the month does not fit in five rows', () => {
    // August 2026 starts on a Saturday: 6 + 31 = 37 cells needed (Sunday week)
    expect(monthGrid(2026, 7, 'Sun')).toHaveLength(42);
    expect(monthGrid(2026, 7, 'Mon')).toHaveLength(42);
  });

  it('keeps a flush month at 35 cells', () => {
    // February 2026: starts Sunday, 28 days → exactly four rows on a Sunday week
    const feb = monthGrid(2026, 1, 'Sun');
    expect(feb).toHaveLength(35);
    expect(feb[0]?.getDate()).toBe(1);
    expect(feb[27]?.getDate()).toBe(28);
    expect(feb[28]).toBeNull();
  });

  it('places every day of the month exactly once', () => {
    const days = monthGrid(2026, JUL, 'Mon')
      .filter((c): c is Date => c !== null)
      .map((c) => c.getDate());
    expect(days).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
  });
});

describe('weekOf', () => {
  it('returns Mon–Sun for a Monday week', () => {
    const week = weekOf(d(2026, JUL, 14), 'Mon'); // Tuesday
    expect(week).toHaveLength(7);
    expect(week[0].getDate()).toBe(13);
    expect(week[0].getDay()).toBe(1);
    expect(week[6].getDate()).toBe(19);
  });

  it('returns Sun–Sat for a Sunday week', () => {
    const week = weekOf(d(2026, JUL, 14), 'Sun');
    expect(week[0].getDate()).toBe(12);
    expect(week[0].getDay()).toBe(0);
    expect(week[6].getDate()).toBe(18);
  });

  it('returns start-of-day dates', () => {
    const week = weekOf(d(2026, JUL, 14, 23, 45), 'Mon');
    expect(week[0].getHours()).toBe(0);
    expect(week[0].getMinutes()).toBe(0);
  });
});

describe('groupUpcomingByDay', () => {
  const events = [
    { id: 'dinner', start: d(2026, JUL, 14, 18, 0) },
    { id: 'coffee', start: d(2026, JUL, 15, 9, 0) },
    { id: 'standup', start: d(2026, JUL, 14, 10, 0) },
    { id: 'past', start: d(2026, JUL, 10, 9, 0) },
    { id: 'grocery', start: d(2026, JUL, 16, 15, 0) },
    { id: 'design', start: d(2026, JUL, 15, 14, 0) },
  ];

  const groups = groupUpcomingByDay(events, TODAY);

  it('drops past days and orders groups by date', () => {
    expect(groups.map((g) => g.dateLabel)).toEqual(['Jul 14', 'Jul 15', 'Jul 16']);
    expect(groups.flatMap((g) => g.events).map((e) => e.id)).not.toContain('past');
  });

  it('labels groups relative to today', () => {
    expect(groups.map((g) => g.relLabel)).toEqual(['Today', 'Tomorrow', 'Thursday']);
  });

  it('orders events inside a day by start time', () => {
    expect(groups[0].events.map((e) => e.id)).toEqual(['standup', 'dinner']);
    expect(groups[1].events.map((e) => e.id)).toEqual(['coffee', 'design']);
  });

  it('exposes midnight of the group day', () => {
    expect(groups[0].date.getHours()).toBe(0);
    expect(groups[0].date.getDate()).toBe(14);
  });

  it('keeps an event earlier today (the day has not passed)', () => {
    const g = groupUpcomingByDay([{ id: 'early', start: d(2026, JUL, 14, 7, 0) }], TODAY);
    expect(g).toHaveLength(1);
    expect(g[0].relLabel).toBe('Today');
  });

  it('returns nothing for an empty list', () => {
    expect(groupUpcomingByDay([], TODAY)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ L2 */

/**
 * Find the runtime zone's spring-forward day, if it has one: the first local day
 * of `year` whose UTC offset is smaller than the previous day's (clocks moved
 * ahead). Returns null in a zone without DST — UTC and Asia/Tokyo, so the
 * DST assertions below run for real under `TZ=America/New_York npx jest` and
 * sit out the other two verification runs rather than asserting something
 * untrue about the zone they are in.
 */
function springForwardDay(year: number): Date | null {
  let previous = new Date(year, 0, 1).getTimezoneOffset();
  for (let i = 1; i < 366; i += 1) {
    const offset = new Date(year, 0, 1 + i).getTimezoneOffset();
    // The clocks moved on the day *before* the first day that reads the new
    // offset at midnight.
    if (offset < previous) return new Date(year, 0, i);
    previous = offset;
  }
  return null;
}

const springForward = springForwardDay(2026);
const describeDst = springForward ? describe : describe.skip;

/**
 * The timeline draws capsules from wall-clock minutes (`layoutDay`), so the
 * label beside a capsule has to be measured the same way. `differenceInMinutes`
 * measures elapsed time, which disagrees across a DST boundary.
 */
describeDst('fmtTimeRange duration across DST (L2)', () => {
  it('quotes the drawn (wall-clock) span, not the elapsed one', () => {
    const day = springForward!;
    const start = d(day.getFullYear(), day.getMonth(), day.getDate());
    const end = d(day.getFullYear(), day.getMonth(), day.getDate() + 1);

    const elapsed = (end.getTime() - start.getTime()) / 60000;
    const wall = wallMinutesBetween(start, end);

    // The premise: on this day the two measures genuinely disagree, because an
    // hour of wall clock never happened.
    expect(wall).toBe(1440);
    expect(elapsed).toBeLessThan(wall);

    // The capsule is drawn a full day tall, so the label must say 24 hr —
    // `differenceInMinutes` would have said 23.
    expect(fmtTimeRange(start, end, '24h')).toContain('· 24 hr');
    expect(fmtTimeRange(start, end, '24h')).not.toContain('23 hr');
  });
});

describe('fmtTimeRange duration (L2)', () => {
  it('defaults to the wall-clock span, which layoutDay also uses', () => {
    const start = d(2026, JUL, 14, 9, 15);
    const end = d(2026, JUL, 14, 11, 45);
    expect(wallMinutesBetween(start, end)).toBe(150);
    expect(fmtTimeRange(start, end, '24h')).toBe('09:15 – 11:45 · 2 hr 30 min');
  });

  it('counts wall minutes across midnight', () => {
    expect(wallMinutesBetween(d(2026, JUL, 14, 23, 0), d(2026, JUL, 15, 1, 0))).toBe(120);
  });

  it('accepts an explicit duration for callers that computed their own', () => {
    const start = d(2026, JUL, 14, 9, 0);
    const end = d(2026, JUL, 14, 10, 0);
    expect(fmtTimeRange(start, end, '24h', 90)).toBe('09:00 – 10:00 · 1 hr 30 min');
  });

  it('is unchanged on an ordinary day', () => {
    expect(fmtTimeRange(d(2026, JUL, 14, 14, 30), d(2026, JUL, 14, 15, 30), '12h')).toBe(
      '2:30 – 3:30 PM · 1 hr',
    );
  });
});

/* ------------------------------------------------------------------ H3 */

describe('all-day labels (H3)', () => {
  const timed = { start: d(2026, JUL, 14, 14, 30), end: d(2026, JUL, 14, 15, 30) };
  const oneDay = { start: d(2026, JUL, 14), end: d(2026, JUL, 15), allDay: true };
  const threeDay = { start: d(2026, JUL, 14), end: d(2026, JUL, 17), allDay: true };

  it('labels a one-day all-day event "All day"', () => {
    expect(fmtEventTimeRange(oneDay, '12h')).toBe(ALL_DAY_LABEL);
    expect(fmtEventStartLabel(oneDay, '12h')).toBe(ALL_DAY_LABEL);
  });

  it('counts the days of a multi-day all-day event', () => {
    expect(fmtEventTimeRange(threeDay, '12h')).toBe('All day · 3 days');
  });

  it('still prints a range for a timed event', () => {
    expect(fmtEventTimeRange(timed, '12h')).toBe('2:30 – 3:30 PM · 1 hr');
    expect(fmtEventStartLabel(timed, '24h')).toBe('14:30');
  });
});

describe('splitAllDay (H3)', () => {
  const a = { id: 'a', start: d(2026, JUL, 14, 9, 0), end: d(2026, JUL, 14, 10, 0) };
  const b = { id: 'b', start: d(2026, JUL, 14), end: d(2026, JUL, 15), allDay: true };
  const c = { id: 'c', start: d(2026, JUL, 14, 11, 0), end: d(2026, JUL, 14, 12, 0) };

  it('keeps all-day events out of the timeline input and preserves order', () => {
    const { allDay, timed } = splitAllDay([a, b, c]);
    expect(allDay.map((e) => e.id)).toEqual(['b']);
    expect(timed.map((e) => e.id)).toEqual(['a', 'c']);
  });

  it('handles a day with only all-day events', () => {
    expect(splitAllDay([b])).toEqual({ allDay: [b], timed: [] });
  });
});

/* ------------------------------------------------------------------ M1 */

describe('occursOnDay (M1)', () => {
  const day14 = d(2026, JUL, 14);
  const day15 = d(2026, JUL, 15);

  it('excludes an event that ends exactly at midnight from the next day', () => {
    // 22:00 → 00:00 belongs to the 14th only. Inclusive ends drew a 3px blip at
    // 00:00 on the 15th and collapsed that day's window to 0:00–1:00.
    const event = { start: d(2026, JUL, 14, 22, 0), end: d(2026, JUL, 15, 0, 0) };
    expect(occursOnDay(event, day14)).toBe(true);
    expect(occursOnDay(event, day15)).toBe(false);
  });

  it('still includes an event that genuinely crosses midnight', () => {
    const event = { start: d(2026, JUL, 14, 22, 0), end: d(2026, JUL, 15, 2, 0) };
    expect(occursOnDay(event, day14)).toBe(true);
    expect(occursOnDay(event, day15)).toBe(true);
    expect(occursOnDay(event, d(2026, JUL, 16))).toBe(false);
  });

  it('excludes an event that starts exactly at the next midnight', () => {
    const event = { start: day15, end: d(2026, JUL, 15, 1, 0) };
    expect(occursOnDay(event, day14)).toBe(false);
    expect(occursOnDay(event, day15)).toBe(true);
  });

  it('places a zero-length event on the day of its instant', () => {
    const event = { start: d(2026, JUL, 14, 9, 0), end: d(2026, JUL, 14, 9, 0) };
    expect(occursOnDay(event, day14)).toBe(true);
    expect(occursOnDay(event, day15)).toBe(false);
  });

  it('spreads an all-day event across exactly the days it covers', () => {
    // Normalized form: local midnight Jul 14 → local midnight Jul 17 = 3 days.
    const event = { start: d(2026, JUL, 14), end: d(2026, JUL, 17), allDay: true };
    expect(occursOnDay(event, d(2026, JUL, 13))).toBe(false);
    expect(occursOnDay(event, day14)).toBe(true);
    expect(occursOnDay(event, d(2026, JUL, 15))).toBe(true);
    expect(occursOnDay(event, d(2026, JUL, 16))).toBe(true);
    expect(occursOnDay(event, d(2026, JUL, 17))).toBe(false);
  });
});

/* ------------------------------------------------------------------ L3 */

describe('groupUpcomingByDay — ongoing events (L3)', () => {
  const ongoing = {
    id: 'conference',
    start: d(2026, JUL, 12, 9, 0),
    end: d(2026, JUL, 17, 18, 0),
  };
  const later = { id: 'dinner', start: d(2026, JUL, 14, 18, 0), end: d(2026, JUL, 14, 20, 0) };
  const finished = { id: 'done', start: d(2026, JUL, 10, 9, 0), end: d(2026, JUL, 10, 10, 0) };

  it('puts an event already in progress in the Today group', () => {
    // It began Sunday and runs to Friday; the feeds showed it, Upcoming did not.
    const groups = groupUpcomingByDay([ongoing, later, finished], TODAY);
    expect(groups[0].relLabel).toBe('Today');
    expect(groups[0].events.map((e) => e.id)).toEqual(['conference', 'dinner']);
    expect(groups.flatMap((g) => g.events).map((e) => e.id)).not.toContain('done');
  });

  it('flags it as ongoing so the UI can label it differently', () => {
    const groups = groupUpcomingByDay([ongoing, later], TODAY);
    expect(groups[0].ongoing.has(ongoing)).toBe(true);
    expect(groups[0].ongoing.has(later)).toBe(false);
  });

  it('does not treat an event ending exactly at today midnight as ongoing', () => {
    const upToMidnight = { id: 'x', start: d(2026, JUL, 13, 20, 0), end: d(2026, JUL, 14, 0, 0) };
    expect(groupUpcomingByDay([upToMidnight], TODAY)).toEqual([]);
  });

  it('creates a Today group even when nothing starts today', () => {
    const groups = groupUpcomingByDay([ongoing], TODAY);
    expect(groups).toHaveLength(1);
    expect(groups[0].relLabel).toBe('Today');
    expect(groups[0].date.getDate()).toBe(14);
  });

  it('leaves events without an end alone (nothing can be ongoing)', () => {
    expect(groupUpcomingByDay([{ id: 'past', start: d(2026, JUL, 10) }], TODAY)).toEqual([]);
  });
});
