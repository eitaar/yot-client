import {
  CAP_X,
  CARD_L,
  GUTTER,
  HOUR_H,
  PPM,
  fmtDur,
  hourLabelText,
  layoutDay,
  wallMinutesBetween,
  type TimelineEvent,
} from '../layoutDay';
import { toZonedTime } from 'date-fns-tz';

/** Local-time constructor so these tests do not depend on the machine's TZ. */
const at = (h: number, m = 0, day = 14) => new Date(2026, 6, day, h, m, 0, 0);
const DAY = new Date(2026, 6, 14, 0, 0, 0, 0);

const ev = (id: string, s: Date, e: Date): TimelineEvent => ({ id, start: s, end: e });

/** The design's July 14 day, plus the overlapping client call. */
const designDay: TimelineEvent[] = [
  ev('standup', at(10, 0), at(10, 30)),
  ev('dentist', at(14, 30), at(15, 30)),
  ev('call', at(15, 0), at(15, 45)),
  ev('dinner', at(18, 0), at(20, 0)),
];

const byId = (r: ReturnType<typeof layoutDay>, id: string) => {
  const b = r.blocks.find((x) => x.id === id);
  if (!b) throw new Error(`no block ${id}`);
  return b;
};

describe('constants', () => {
  it('matches the design scale', () => {
    expect(HOUR_H).toBe(66);
    expect(PPM).toBeCloseTo(1.1, 10);
    expect(GUTTER).toBe(46);
    expect(CAP_X).toBe(56);
    expect(CARD_L).toBe(72);
  });
});

describe('layoutDay — proportional geometry', () => {
  const r = layoutDay(designDay, { dayStart: DAY });

  it('gives a 30-minute event a true 33px height', () => {
    expect(byId(r, 'standup').height).toBeCloseTo(33, 10);
  });

  it('scales every height by true duration', () => {
    expect(byId(r, 'dentist').height).toBeCloseTo(66, 10); // 1 hr
    expect(byId(r, 'call').height).toBeCloseTo(49.5, 10); // 45 min
    expect(byId(r, 'dinner').height).toBeCloseTo(132, 10); // 2 hr
  });

  it('positions tops relative to the window start', () => {
    // window starts 09:00; standup at 10:00 → 60 min → 66px
    expect(byId(r, 'standup').top).toBeCloseTo(66, 10);
    expect(byId(r, 'dinner').top).toBeCloseTo((18 * 60 - 9 * 60) * PPM, 10);
  });

  it('floors sub-3px events so a zero-length event is still drawn', () => {
    const z = layoutDay([ev('blip', at(10, 0), at(10, 0))], { dayStart: DAY });
    expect(z.blocks[0].height).toBe(3);
  });

  it('reports start/end minutes from midnight', () => {
    expect(byId(r, 'dentist').startMin).toBe(14 * 60 + 30);
    expect(byId(r, 'dentist').endMin).toBe(15 * 60 + 30);
  });
});

describe('layoutDay — window', () => {
  it('trims to one hour of air around the events', () => {
    const r = layoutDay(designDay, { dayStart: DAY });
    expect(r.winStartMin).toBe(9 * 60); // floor(10:00) − 1h
    expect(r.winEndMin).toBe(21 * 60); // ceil(20:00) + 1h
    expect(r.totalHeight).toBeCloseTo((21 - 9) * HOUR_H, 10);
  });

  it('rounds the first start down to the hour before padding', () => {
    const r = layoutDay([ev('a', at(10, 20), at(11, 10))], { dayStart: DAY });
    expect(r.winStartMin).toBe(9 * 60);
    expect(r.winEndMin).toBe(13 * 60); // ceil(11:10)=12:00, +1h
  });

  it('clamps at midnight on both ends', () => {
    const early = layoutDay([ev('a', at(0, 15), at(1, 0))], { dayStart: DAY });
    expect(early.winStartMin).toBe(0);
    expect(early.blocks[0].top).toBeCloseTo(15 * PPM, 10);

    const late = layoutDay([ev('b', at(23, 0), at(23, 59))], { dayStart: DAY });
    expect(late.winEndMin).toBe(24 * 60);

    const both = layoutDay([ev('a', at(0, 15), at(23, 59))], { dayStart: DAY });
    expect(both.winStartMin).toBe(0);
    expect(both.winEndMin).toBe(1440);
    expect(both.totalHeight).toBeCloseTo(1440 * PPM, 10);
    expect(both.hourMarks).toHaveLength(25);
  });

  it('clamps an event that runs past midnight to the end of the day', () => {
    const r = layoutDay([ev('a', at(23, 0), new Date(2026, 6, 15, 1, 0))], {
      dayStart: DAY,
    });
    expect(r.blocks[0].endMin).toBe(1440);
    expect(r.winEndMin).toBe(1440);
  });

  it('defaults to 8:00–20:00 on an empty day', () => {
    const r = layoutDay([], { dayStart: DAY });
    expect(r.winStartMin).toBe(8 * 60);
    expect(r.winEndMin).toBe(20 * 60);
    expect(r.totalHeight).toBeCloseTo(12 * HOUR_H, 10);
    expect(r.blocks).toEqual([]);
    expect(r.hourMarks).toHaveLength(13);
  });

  it('emits an hour mark per hour, inclusive of both edges', () => {
    const r = layoutDay(designDay, { dayStart: DAY });
    expect(r.hourMarks[0]).toBe(9 * 60);
    expect(r.hourMarks[r.hourMarks.length - 1]).toBe(21 * 60);
    expect(r.hourMarks).toHaveLength(13);
  });
});

describe('layoutDay — overlap lanes', () => {
  it('splits the design day into 2 columns only where events overlap', () => {
    const r = layoutDay(designDay, { dayStart: DAY });

    expect(byId(r, 'standup')).toMatchObject({ lane: 0, cols: 1 });
    expect(byId(r, 'dinner')).toMatchObject({ lane: 0, cols: 1 });
    expect(byId(r, 'dentist')).toMatchObject({ lane: 0, cols: 2 });
    expect(byId(r, 'call')).toMatchObject({ lane: 1, cols: 2 });
  });

  it('handles a 3-way overlap', () => {
    const r = layoutDay(
      [
        ev('a', at(10, 0), at(11, 0)),
        ev('b', at(10, 30), at(11, 30)),
        ev('c', at(10, 45), at(11, 15)),
      ],
      { dayStart: DAY },
    );
    expect(byId(r, 'a')).toMatchObject({ lane: 0, cols: 3 });
    expect(byId(r, 'b')).toMatchObject({ lane: 1, cols: 3 });
    expect(byId(r, 'c')).toMatchObject({ lane: 2, cols: 3 });
  });

  it('reuses a freed lane inside a running cluster', () => {
    // a 10–11, b 10:30–11:30 (chains the cluster), c 11–12 fits back in lane 0
    const r = layoutDay(
      [
        ev('a', at(10, 0), at(11, 0)),
        ev('b', at(10, 30), at(11, 30)),
        ev('c', at(11, 0), at(12, 0)),
      ],
      { dayStart: DAY },
    );
    expect(byId(r, 'a')).toMatchObject({ lane: 0, cols: 2 });
    expect(byId(r, 'b')).toMatchObject({ lane: 1, cols: 2 });
    expect(byId(r, 'c')).toMatchObject({ lane: 0, cols: 2 });
  });

  it('treats touching events as separate clusters', () => {
    const r = layoutDay([ev('a', at(10, 0), at(11, 0)), ev('b', at(11, 0), at(12, 0))], {
      dayStart: DAY,
    });
    expect(byId(r, 'a')).toMatchObject({ lane: 0, cols: 1 });
    expect(byId(r, 'b')).toMatchObject({ lane: 0, cols: 1 });
  });

  it('sorts unordered input by start', () => {
    const r = layoutDay([designDay[3], designDay[1], designDay[0], designDay[2]], {
      dayStart: DAY,
    });
    expect(r.blocks.map((b) => b.id)).toEqual(['standup', 'dentist', 'call', 'dinner']);
  });
});

describe('layoutDay — now', () => {
  it('marks finished events past and offsets the NOW line', () => {
    const r = layoutDay(designDay, { dayStart: DAY, now: at(11, 20) });
    expect(byId(r, 'standup').isPast).toBe(true);
    expect(byId(r, 'dentist').isPast).toBe(false);
    // 11:20 is 140 min after the 09:00 window start
    expect(r.nowOffset).toBeCloseTo(140 * PPM, 10);
  });

  it('treats an event ending exactly at now as past', () => {
    const r = layoutDay(designDay, { dayStart: DAY, now: at(10, 30) });
    expect(byId(r, 'standup').isPast).toBe(true);
  });

  it('ignores now on another day', () => {
    const r = layoutDay(designDay, { dayStart: DAY, now: new Date(2026, 6, 15, 11, 20) });
    expect(r.nowOffset).toBeNull();
    expect(r.blocks.every((b) => !b.isPast)).toBe(true);
  });

  it('hides the NOW line when now falls outside the window', () => {
    const r = layoutDay(designDay, { dayStart: DAY, now: at(22, 0) });
    expect(r.nowOffset).toBeNull();
    expect(r.blocks.every((b) => b.isPast)).toBe(true); // still dimmed — it is today
  });

  it('returns no NOW line when now is omitted', () => {
    expect(layoutDay(designDay, { dayStart: DAY }).nowOffset).toBeNull();
  });
});

describe('layoutDay — manual timezone', () => {
  // The zoned path shifts both the event and the day start into the zone, so
  // the day-start distance cancels the machine's local zone: the expected
  // positions below are deterministic under any device TZ.
  const DAY_UTC = new Date(Date.UTC(2026, 6, 13, 15, 0)); // Jul 14 00:00 in Asia/Tokyo
  const evAt = (h: number, m = 0, endH?: number, endM = 0): TimelineEvent => {
    const start = new Date(DAY_UTC.getTime() + (h * 60 + m) * 60_000); // Tokyo h:m → instant
    const end =
      endH !== undefined
        ? new Date(DAY_UTC.getTime() + (endH * 60 + endM) * 60_000)
        : new Date(start.getTime() + 30 * 60_000);
    return { id: 'tz', start, end };
  };

  it('positions an event by the zone wall clock, not the device clock', () => {
    // The instant is Tokyo Jul 14 19:00; the capsule must sit at the 19:00 line
    // whatever zone the machine itself is in.
    const r = layoutDay([evAt(19, 0)], { dayStart: DAY_UTC, timeZone: 'Asia/Tokyo' });
    expect(byId(r, 'tz').startMin).toBe(19 * 60);
    expect(byId(r, 'tz').endMin).toBe(19 * 60 + 30);
  });

  it('falls back to device-local minutes without a zone', () => {
    // No timeZone → plain getHours() on the machine. Local-time constructors
    // keep this deterministic: 10:00 local is always the 10:00 line.
    const start = new Date(2026, 6, 14, 10, 0);
    const end = new Date(2026, 6, 14, 10, 30);
    const dayStart = new Date(2026, 6, 14, 0, 0);
    const r = layoutDay([{ id: 'tz', start, end }], { dayStart });
    expect(byId(r, 'tz').startMin).toBe(10 * 60);
    expect(byId(r, 'tz').endMin).toBe(10 * 60 + 30);
  });

  it('places the NOW line by the zoned clock', () => {
    // The NOW line must use the zoned wall clock, not the device clock. The
    // expectation is derived with the same zone conversion and the same
    // event-driven window (both ends), so it holds under any device TZ; when
    // the zoned time falls outside the window the line is correctly hidden.
    const dayStart = new Date(2026, 6, 14, 0, 0);
    const event: TimelineEvent = {
      id: 'e',
      start: new Date(2026, 6, 14, 9, 0),
      end: new Date(2026, 6, 14, 10, 0),
    };
    const now = new Date(2026, 6, 14, 12, 0);
    const r = layoutDay([event], { dayStart, now, timeZone: 'Asia/Tokyo' });
    const zonedNow = toZonedTime(now, 'Asia/Tokyo');
    const zonedStart = toZonedTime(event.start, 'Asia/Tokyo');
    const zonedEnd = toZonedTime(event.end, 'Asia/Tokyo');
    const nowMin = zonedNow.getHours() * 60 + zonedNow.getMinutes();
    const startMin = zonedStart.getHours() * 60 + zonedStart.getMinutes();
    const endMin = zonedEnd.getHours() * 60 + zonedEnd.getMinutes();
    const winStart = Math.max(0, Math.floor(startMin / 60) * 60 - 60);
    const winEnd = Math.min(24 * 60, Math.ceil(endMin / 60) * 60 + 60);
    const expected =
      nowMin >= winStart && nowMin <= winEnd ? (nowMin - winStart) * PPM : null;
    if (expected === null) expect(r.nowOffset).toBeNull();
    else expect(r.nowOffset).toBeCloseTo(expected, 10);
  });

  it('computes wall-clock durations in the zone', () => {
    // Jul 14 01:00Z → 03:00Z is 10:00 → 12:00 in Tokyo: 120 wall minutes.
    const start = new Date(Date.UTC(2026, 6, 14, 1, 0));
    const end = new Date(Date.UTC(2026, 6, 14, 3, 0));
    expect(wallMinutesBetween(start, end, 'Asia/Tokyo')).toBe(120);
  });
});

describe('fmtDur', () => {
  it.each([
    [0, '0 min'],
    [5, '5 min'],
    [30, '30 min'],
    [60, '1 hr'],
    [90, '1 hr 30 min'],
    [120, '2 hr'],
    [145, '2 hr 25 min'],
  ])('formats %i minutes as "%s"', (min, expected) => {
    expect(fmtDur(min)).toBe(expected);
  });
});

describe('hourLabelText', () => {
  it('formats 12h labels like the design', () => {
    expect(hourLabelText(0, '12h')).toBe('12 AM');
    expect(hourLabelText(8, '12h')).toBe('8 AM');
    expect(hourLabelText(12, '12h')).toBe('12 PM');
    expect(hourLabelText(13, '12h')).toBe('1 PM');
    expect(hourLabelText(23, '12h')).toBe('11 PM');
    expect(hourLabelText(24, '12h')).toBe('12 AM');
  });

  it('formats 24h labels zero-padded', () => {
    expect(hourLabelText(0, '24h')).toBe('00:00');
    expect(hourLabelText(8, '24h')).toBe('08:00');
    expect(hourLabelText(13, '24h')).toBe('13:00');
    expect(hourLabelText(24, '24h')).toBe('00:00');
  });

  it('labels every hour mark of a real window', () => {
    const r = layoutDay(designDay, { dayStart: DAY });
    expect(r.hourMarks.map((m) => hourLabelText(m / 60, '12h'))).toEqual([
      '9 AM',
      '10 AM',
      '11 AM',
      '12 PM',
      '1 PM',
      '2 PM',
      '3 PM',
      '4 PM',
      '5 PM',
      '6 PM',
      '7 PM',
      '8 PM',
      '9 PM',
    ]);
  });
});
