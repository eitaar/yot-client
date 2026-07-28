/**
 * Proportional day-timeline layout — ported from `project/Calendar App v15.dc.html`
 * (lines 264–431, "Proportional day timeline (v15)").
 *
 * This is the crown jewel of the design: the timeline is *geometrically true*.
 * A capsule's length is its duration in pixels, its dot marks the start line and
 * its ring the end line. Nothing here rounds a 30-minute event up to a readable
 * card height — the layout stays honest and the label floats next to it instead.
 *
 * Pure TypeScript: no React, no React Native, no I/O. Everything the UI needs to
 * draw a day is returned as plain numbers.
 */

import { differenceInCalendarDays } from 'date-fns';

/* -------------------------------------------------------------- constants */

/** Pixels per hour. The single scale constant the whole timeline derives from. */
export const HOUR_H = 66;
/** Pixels per minute (1.1). */
export const PPM = HOUR_H / 60;
/** Width of the hour-label gutter on the left. */
export const GUTTER = 46;
/** X position of the capsule rail / hour rule start. */
export const CAP_X = 56;
/** X position of an event label when it spans the full width (single lane). */
export const CARD_L = 72;

/** Minimum rendered capsule height, so a 1-minute event is still visible. */
const MIN_BLOCK_H = 3;
/** Minutes in a day. */
const DAY_MIN = 24 * 60;
/** Default window when the day has no events: 8:00 → 20:00. */
const DEFAULT_WIN_START = 8 * 60;
const DEFAULT_WIN_END = 20 * 60;

/* ------------------------------------------------------------------ types */

/**
 * Minimal structural shape a timeline event must have. Deliberately *not* the
 * API event type — anything with an id and a start/end instant lays out.
 */
export interface TimelineEvent {
  id: string;
  start: Date;
  end: Date;
}

export interface LayoutOptions {
  /** Midnight of the day being rendered (any instant on that day works). */
  dayStart: Date;
  /** Real "now". Only affects output when it falls on the rendered day. */
  now?: Date;
}

export interface LayoutBlock {
  id: string;
  /** Pixels from the top of the timeline canvas to the event's start line. */
  top: number;
  /** True duration in pixels (floored at 3px), *not* a padded card height. */
  height: number;
  /** Column index within the event's overlap cluster (0-based). */
  lane: number;
  /** Number of columns the event's cluster was split into (1 = full width). */
  cols: number;
  /** Start, in minutes from midnight of the rendered day (clamped to 0…1440). */
  startMin: number;
  /** End, in minutes from midnight of the rendered day (clamped to 0…1440). */
  endMin: number;
  /** True when the event has already finished (only ever true on today). */
  isPast: boolean;
}

export interface DayLayout {
  /** Window start in minutes from midnight. */
  winStartMin: number;
  /** Window end in minutes from midnight. */
  winEndMin: number;
  /** Height of the timeline canvas in pixels. */
  totalHeight: number;
  /** Hour rule positions, in minutes from midnight (inclusive of both ends). */
  hourMarks: number[];
  blocks: LayoutBlock[];
  /** Pixels from canvas top to the NOW line, or null when it must not show. */
  nowOffset: number | null;
}

/* ---------------------------------------------------------------- helpers */

/**
 * Wall-clock minutes of `date` relative to midnight of `dayStart`'s calendar
 * day. Computed from calendar-day distance + local hours/minutes rather than a
 * raw millisecond delta, so a DST transition can't shift the grid by an hour.
 */
function wallMinutes(date: Date, dayStart: Date): number {
  const dayDiff = differenceInCalendarDays(date, dayStart);
  return dayDiff * DAY_MIN + date.getHours() * 60 + date.getMinutes();
}

/**
 * Duration in **wall-clock** minutes — the same measure the timeline draws with.
 *
 * `differenceInMinutes` measures real elapsed time, which diverges from the
 * clock across a DST transition. On a spring-forward day a 01:00 → 03:00 event
 * spans 120 wall minutes — and is drawn 2 hours tall — but only 60 elapsed
 * ones, so a `differenceInMinutes` label reads "1 hr" next to a two-hour
 * capsule; in autumn the error runs the other way. Labels must quote what the
 * geometry shows, so every duration string beside a capsule comes from this.
 */
export function wallMinutesBetween(start: Date, end: Date): number {
  return wallMinutes(end, start) - wallMinutes(start, start);
}

function clampToDay(min: number): number {
  return Math.min(DAY_MIN, Math.max(0, min));
}

/** Duration label: "30 min" / "1 hr" / "1 hr 30 min" (v15 lines 280–285). */
export function fmtDur(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hr = Math.floor(total / 60);
  const mm = total % 60;
  if (hr === 0) return `${mm} min`;
  if (mm === 0) return `${hr} hr`;
  return `${hr} hr ${mm} min`;
}

/**
 * Hour-gutter label. 12h matches v15's `hourLabel` exactly ("8 AM", "12 PM",
 * "12 AM" at both midnights); 24h is the zero-padded equivalent, with hour 24
 * rendered as "00:00" for the same reason v15 renders it "12 AM".
 */
export function hourLabelText(hour: number, timeFormat: '12h' | '24h'): string {
  const h = ((Math.round(hour) % 24) + 24) % 24;
  if (timeFormat === '24h') return `${String(h).padStart(2, '0')}:00`;
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

/* ------------------------------------------------------------------- core */

interface Placed {
  id: string;
  startMin: number;
  endMin: number;
  lane: number;
  cols: number;
}

/**
 * Greedy overlap clustering → lane assignment. Ported verbatim from v15
 * lines 296–315: walk the start-sorted list, keep extending the current cluster
 * while the next event starts before the cluster's running max end; on flush,
 * give each member the first lane whose last end is ≤ its start, and give every
 * member of the cluster the same column count.
 */
function assignLanes(items: Placed[]): void {
  let cluster: Placed[] = [];
  let curEnd = -1;

  const flush = () => {
    if (!cluster.length) return;
    const laneEnds: number[] = [];
    for (const e of cluster) {
      let lane = laneEnds.findIndex((end) => e.startMin >= end);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(e.endMin);
      } else {
        laneEnds[lane] = e.endMin;
      }
      e.lane = lane;
    }
    for (const e of cluster) e.cols = laneEnds.length;
    cluster = [];
    curEnd = -1;
  };

  for (const e of items) {
    if (cluster.length && e.startMin >= curEnd) flush();
    cluster.push(e);
    curEnd = Math.max(curEnd, e.endMin);
  }
  flush();
}

/**
 * Lay out one day of events.
 *
 * Window: one hour of air either side of the day's events — floor(first
 * start)−1h to ceil(last end)+1h — clamped to the day, defaulting to 8:00–20:00
 * when there is nothing scheduled.
 */
export function layoutDay(
  events: readonly TimelineEvent[],
  opts: LayoutOptions,
): DayLayout {
  const { dayStart, now } = opts;

  const placed: Placed[] = events
    .map((e) => {
      const startMin = clampToDay(wallMinutes(e.start, dayStart));
      const endMin = Math.max(startMin, clampToDay(wallMinutes(e.end, dayStart)));
      return { id: e.id, startMin, endMin, lane: 0, cols: 1 };
    })
    // Sort on start only — like v15. Array.prototype.sort is stable, so events
    // sharing a start keep their input order and therefore their lane order.
    .sort((a, b) => a.startMin - b.startMin);

  let winStartMin = DEFAULT_WIN_START;
  let winEndMin = DEFAULT_WIN_END;
  if (placed.length) {
    const firstStart = Math.min(...placed.map((e) => e.startMin));
    const lastEnd = Math.max(...placed.map((e) => e.endMin));
    winStartMin = Math.floor(firstStart / 60) * 60 - 60;
    winEndMin = Math.ceil(lastEnd / 60) * 60 + 60;
  }
  winStartMin = Math.max(0, winStartMin);
  winEndMin = Math.min(DAY_MIN, winEndMin);

  assignLanes(placed);

  const isToday = now != null && differenceInCalendarDays(now, dayStart) === 0;
  const nowMin = isToday && now ? now.getHours() * 60 + now.getMinutes() : null;

  const blocks: LayoutBlock[] = placed.map((e) => ({
    id: e.id,
    top: (e.startMin - winStartMin) * PPM,
    height: Math.max((e.endMin - e.startMin) * PPM, MIN_BLOCK_H),
    lane: e.lane,
    cols: e.cols,
    startMin: e.startMin,
    endMin: e.endMin,
    isPast: nowMin != null && e.endMin <= nowMin,
  }));

  const hourMarks: number[] = [];
  for (let m = winStartMin; m <= winEndMin; m += 60) hourMarks.push(m);

  const nowOffset =
    nowMin != null && nowMin >= winStartMin && nowMin <= winEndMin
      ? (nowMin - winStartMin) * PPM
      : null;

  return {
    winStartMin,
    winEndMin,
    totalHeight: (winEndMin - winStartMin) * PPM,
    hourMarks,
    blocks,
    nowOffset,
  };
}
