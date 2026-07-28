/**
 * Date + formatting utilities shared by every screen.
 *
 * These are the functions that make the two display settings (week start,
 * time format) actually mean something — in the v15 prototype both were
 * decorative. Pure TypeScript on top of date-fns; no React, no React Native.
 */

import {
  addDays,
  differenceInCalendarDays,
  format,
  getDaysInMonth,
  startOfDay,
  startOfWeek,
} from 'date-fns';

import { fmtDur, wallMinutesBetween } from './layoutDay';

export type TimeFormat = '12h' | '24h';
export type WeekStart = 'Mon' | 'Sun';

/** date-fns `weekStartsOn` for a WeekStart setting. */
function weekStartsOn(weekStart: WeekStart): 0 | 1 {
  return weekStart === 'Mon' ? 1 : 0;
}

/* ------------------------------------------------------------- clock/range */

/** "2:30 PM" (12h) or "14:30" (24h). */
export function fmtClock(date: Date, timeFormat: TimeFormat): string {
  return format(date, timeFormat === '24h' ? 'HH:mm' : 'h:mm a');
}

/**
 * Timeline / detail-page time line: `"2:30 – 3:30 PM · 1 hr"`.
 *
 * Deviation from v15 (which always printed both meridiems, "2:30 PM – 3:30 PM"):
 * when both ends share a meridiem it is printed once, on the end time. Reads
 * cleaner and is what the stage-2a spec asks for. Crossing noon keeps both
 * ("11:30 AM – 1:00 PM"), and 24h never has one to drop.
 */
export function fmtTimeRange(
  start: Date,
  end: Date,
  timeFormat: TimeFormat,
  /**
   * Duration to print, in minutes. Defaults to the **wall-clock** span
   * ({@link wallMinutesBetween}) — the same measure `layoutDay` draws with, so
   * the label always agrees with the capsule beside it, DST days included. Pass
   * an explicit value only to quote a duration computed some other way.
   */
  durationMinutes?: number,
): string {
  const dur = fmtDur(durationMinutes ?? wallMinutesBetween(start, end));
  if (timeFormat === '24h') {
    return `${format(start, 'HH:mm')} – ${format(end, 'HH:mm')} · ${dur}`;
  }
  const sameMeridiem = format(start, 'a') === format(end, 'a');
  const startLabel = sameMeridiem ? format(start, 'h:mm') : format(start, 'h:mm a');
  return `${startLabel} – ${format(end, 'h:mm a')} · ${dur}`;
}

/* --------------------------------------------------------------- all-day */

/**
 * The minimum an event has to look like for the day helpers below. Deliberately
 * structural, so tests and the tracking store can use them too.
 */
export interface DayEvent {
  start: Date;
  end: Date;
  allDay?: boolean;
}

/** The label an all-day event gets wherever a time range would otherwise go. */
export const ALL_DAY_LABEL = 'All day';

/**
 * Time label for any event: `"All day"` when it is one, otherwise the wide
 * `fmtTimeRange` form. This is the helper screens should call — it is the only
 * one that knows about both branches.
 */
export function fmtEventTimeRange(event: DayEvent, timeFormat: TimeFormat): string {
  if (event.allDay) {
    const days = allDaySpan(event);
    return days > 1 ? `${ALL_DAY_LABEL} · ${days} days` : ALL_DAY_LABEL;
  }
  return fmtTimeRange(event.start, event.end, timeFormat);
}

/**
 * Narrow time label (list rows, month panel): `"All day"`, or just the start
 * clock. The counterpart to {@link fmtEventTimeRange} where width is scarce.
 */
export function fmtEventStartLabel(event: DayEvent, timeFormat: TimeFormat): string {
  return event.allDay ? ALL_DAY_LABEL : fmtClock(event.start, timeFormat);
}

/** Whole calendar days an all-day event covers (at least 1). */
function allDaySpan(event: DayEvent): number {
  const from = startOfDay(event.start).getTime();
  const to = startOfDay(event.end).getTime();
  return Math.max(1, Math.round((to - from) / (24 * 60 * 60 * 1000)));
}

/* ------------------------------------------------------- day membership */

/**
 * Does `event` occupy any of `date`'s calendar day?
 *
 * **Ends are exclusive.** A 22:00–24:00 event finishes exactly at the next day's
 * midnight and belongs to its start day only — treating the end inclusively put
 * a 3px blip at 00:00 on the following day, and collapsed that day's timeline
 * window to 0:00–1:00 whenever the blip was alone.
 *
 * All-day events need no special case: `toAppEvent` already stores their end as
 * local midnight *after* the last day they cover, so the same comparison lands
 * them on exactly the days they span. Zero-length events (start === end) are the
 * one exception — an exclusive end would put them on no day at all, so they are
 * matched on their start instant.
 */
export function occursOnDay(event: DayEvent, date: Date): boolean {
  const dayStart = startOfDay(date).getTime();
  const dayEnd = startOfDay(addDays(date, 1)).getTime();
  const start = event.start.getTime();
  const end = event.end.getTime();
  if (end <= start) return start >= dayStart && start < dayEnd;
  return start < dayEnd && end > dayStart;
}

/**
 * Split a day's events into the two things the calendar draws differently:
 * all-day entries go in a chip row above the timeline, everything else is laid
 * out proportionally. `layoutDay` must only ever be given `timed` — an all-day
 * event spans ~24h, which forces the window to the full day and halves every
 * lane from midnight to midnight.
 *
 * Input order is preserved within each list.
 */
export function splitAllDay<T extends DayEvent>(
  events: readonly T[],
): { allDay: T[]; timed: T[] } {
  const allDay: T[] = [];
  const timed: T[] = [];
  for (const event of events) (event.allDay ? allDay : timed).push(event);
  return { allDay, timed };
}

/* ----------------------------------------------------------------- labels */

/**
 * 'Today' | 'Tomorrow' | full weekday name — the v15 events-tab grouping rule
 * (lines 493–503), which used full names from its `dayNames` table.
 */
export function relDayLabel(date: Date, today: Date): string {
  const diff = differenceInCalendarDays(date, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return format(date, 'EEEE');
}

/** ['M','T','W','T','F','S','S'] or v15's ['S','M','T','W','T','F','S']. */
export function shortDayLabels(weekStart: WeekStart): string[] {
  const sun = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return weekStart === 'Mon' ? [...sun.slice(1), sun[0]] : sun;
}

/* ------------------------------------------------------------------ grids */

/**
 * Month grid cells for the collapsible month panel.
 *
 * @param year  Full year, e.g. 2026.
 * @param month Month index, **0-based** (JS `Date` convention): 0 = January.
 * @returns 35 cells when the month fits in five rows, otherwise 42. Leading and
 *          trailing padding cells are `null` (v15 rendered empty divs there).
 */
export function monthGrid(
  year: number,
  month: number,
  weekStart: WeekStart,
): (Date | null)[] {
  const first = new Date(year, month, 1);
  const daysInMonth = getDaysInMonth(first);
  const offset = (first.getDay() - weekStartsOn(weekStart) + 7) % 7;
  const used = offset + daysInMonth;
  const total = used <= 35 ? 35 : 42;

  const cells: (Date | null)[] = [];
  for (let i = 0; i < total; i++) {
    const day = i - offset + 1;
    cells.push(day >= 1 && day <= daysInMonth ? new Date(year, month, day) : null);
  }
  return cells;
}

/** The 7 days of `date`'s week (start-of-day), honouring the week-start setting. */
export function weekOf(date: Date, weekStart: WeekStart): Date[] {
  const first = startOfWeek(date, { weekStartsOn: weekStartsOn(weekStart) });
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/* --------------------------------------------------------------- grouping */

export interface UpcomingGroup<T> {
  /** Midnight of the group's day. */
  date: Date;
  /** 'Today' | 'Tomorrow' | weekday name. */
  relLabel: string;
  /** 'Jul 14'. */
  dateLabel: string;
  events: T[];
  /**
   * The members of {@link UpcomingGroup.events} that started before this day and
   * are still running — `group.ongoing.has(event)`. Only ever non-empty on the
   * "Today" group. See {@link groupUpcomingByDay}.
   */
  ongoing: ReadonlySet<T>;
}

/**
 * Group today-or-later events into ordered day sections (v15 lines 493–503).
 * Days sort ascending; events sort by start time within a day.
 *
 * **Events already in progress count as Today.** Filtering on `start >= today`
 * alone hid a conference that began yesterday and runs through Friday — the
 * feeds showed it, Upcoming did not. Anything whose end is still ahead of
 * today's midnight is placed in the Today group with its `ongoing` flag set, so
 * the UI can label it ("Ends 6:00 PM", "Day 2 of 4") rather than print a start
 * time in the past. Ongoing entries sort first within Today.
 */
export function groupUpcomingByDay<T extends { start: Date; end?: Date }>(
  events: readonly T[],
  today: Date,
): UpcomingGroup<T>[] {
  const groups = new Map<number, { group: UpcomingGroup<T>; ongoing: Set<T> }>();
  const todayStart = startOfDay(today);

  const ensure = (day: Date) => {
    const key = day.getTime();
    let entry = groups.get(key);
    if (!entry) {
      const ongoing = new Set<T>();
      entry = {
        ongoing,
        group: {
          date: day,
          relLabel: relDayLabel(day, today),
          dateLabel: format(day, 'MMM d'),
          events: [],
          ongoing,
        },
      };
      groups.set(key, entry);
    }
    return entry;
  };

  const starting: T[] = [];
  const running: T[] = [];
  for (const e of events) {
    if (differenceInCalendarDays(e.start, today) >= 0) starting.push(e);
    // Started earlier and has not finished: still happening today. An end
    // exactly at today's midnight belongs to yesterday, matching `occursOnDay`.
    else if (e.end && e.end.getTime() > todayStart.getTime()) running.push(e);
  }

  // Ongoing entries lead the Today group; their start times are in the past and
  // would otherwise interleave oddly with things that have not begun.
  for (const e of running.sort((a, b) => a.start.getTime() - b.start.getTime())) {
    const entry = ensure(todayStart);
    entry.group.events.push(e);
    entry.ongoing.add(e);
  }

  for (const e of starting.slice().sort((a, b) => a.start.getTime() - b.start.getTime())) {
    ensure(startOfDay(e.start)).group.events.push(e);
  }

  return [...groups.values()]
    .map((entry) => entry.group)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}
