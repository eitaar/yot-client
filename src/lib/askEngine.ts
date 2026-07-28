/**
 * The canned "Ask" engine — ported from `project/Calendar App v15.dc.html`
 * lines 654–744 as a pure function.
 *
 * There is no model behind this and there is not meant to be (see the plan:
 * "All local, no LLM call"). It is keyword routing over the user's own events,
 * with the design's copy preserved. The UI supplies the streaming effect.
 *
 * Pure TypeScript: no React, no React Native, no clock reads except the
 * optional insight seed.
 */

import { differenceInCalendarDays, format } from 'date-fns';

import { fmtClock, type TimeFormat } from './dates';

/** Minimal structural shape the engine needs. Not the API event type. */
export interface AskEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  description?: string;
}

export interface AskAction {
  label: string;
  /** Glyph from the design; purely decorative. */
  icon?: string;
}

export interface AskSuggestion {
  label: string;
}

export interface AskAnswer {
  text: string;
  actions: AskAction[];
  /** Ids only — the UI resolves them against the store to render mini chips. */
  previewEventIds: string[];
}

export interface AskOptions {
  /** Clock style for times inside answers. Defaults to 12h, as in v15. */
  timeFormat?: TimeFormat;
}

/** Working hours the design considers "bookable". */
const DAY_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17];

/* ---------------------------------------------------------------- context */

function byStart(a: AskEvent, b: AskEvent): number {
  return a.start.getTime() - b.start.getTime();
}

function sameDay(a: Date, b: Date): boolean {
  return differenceInCalendarDays(a, b) === 0;
}

interface AskContext {
  todayEvents: AskEvent[];
  tomorrowEvents: AskEvent[];
  upcoming: AskEvent[];
  weekEvents: AskEvent[];
  freeHrs: number[];
}

function buildContext(events: readonly AskEvent[], now: Date): AskContext {
  const todayEvents = events.filter((e) => sameDay(e.start, now)).sort(byStart);
  const tomorrowEvents = events
    .filter((e) => differenceInCalendarDays(e.start, now) === 1)
    .sort(byStart);
  // v15 treated everything from "today" onward as upcoming; with a real clock
  // the useful reading is "hasn't started yet".
  const upcoming = events.filter((e) => e.start.getTime() >= now.getTime()).sort(byStart);
  const weekEvents = events
    .filter((e) => {
      const d = differenceInCalendarDays(e.start, now);
      return d >= 0 && d <= 6;
    })
    .sort(byStart);

  const busyHrs = new Set(todayEvents.map((e) => e.start.getHours()));
  const freeHrs = DAY_HOURS.filter((hr) => !busyHrs.has(hr));

  return { todayEvents, tomorrowEvents, upcoming, weekEvents, freeHrs };
}

/**
 * "9AM" / "12PM" / "5PM".
 *
 * Deviation: v15's `hr <= 12 ? hr+'AM' : ...` printed noon as "12AM". Fixed —
 * shipping an app that tells you you're free at 12AM in the middle of a
 * working-hours list is not a design decision worth preserving.
 */
function freeHourLabel(hr: number): string {
  if (hr < 12) return `${hr}AM`;
  if (hr === 12) return '12PM';
  return `${hr - 12}PM`;
}

/** Join sentence fragments, dropping empties so no double spaces creep in. */
function sentences(...parts: (string | false | null | undefined)[]): string {
  return parts.filter((p): p is string => Boolean(p)).join(' ');
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n !== 1 ? 's' : ''}`;
}

/* ------------------------------------------------------------ suggestions */

/** Context-aware chips shown above the Ask input (v15 lines 660–667). */
export function buildSuggestions(
  events: readonly AskEvent[],
  now: Date,
): AskSuggestion[] {
  const { upcoming, freeHrs } = buildContext(events, now);
  const suggestions: AskSuggestion[] = [];

  suggestions.push({ label: now.getHours() < 12 ? 'Brief me on today' : 'How was my day?' });
  const nextEvent = upcoming[0];
  if (nextEvent) suggestions.push({ label: `Prep for ${nextEvent.title}` });
  if (freeHrs.length > 0) suggestions.push({ label: 'Find free time' });
  suggestions.push({ label: 'Summarize my week' });

  return suggestions;
}

/* ---------------------------------------------------------------- answers */

/** Route keys, matched by substring in the order v15 declared them. */
const ROUTES = [
  'brief me on today',
  'how was my day',
  'prep for',
  'find free time',
  'summarize my week',
] as const;

type Route = (typeof ROUTES)[number];

/**
 * Answer a query. Matching is `query.toLowerCase().includes(key)` against the
 * routes in declaration order, exactly as in the design; anything unmatched
 * gets the fallback.
 */
export function answer(
  query: string,
  events: readonly AskEvent[],
  now: Date,
  opts: AskOptions = {},
): AskAnswer {
  const timeFormat = opts.timeFormat ?? '12h';
  const ctx = buildContext(events, now);
  const q = query.toLowerCase();
  const route: Route | undefined = ROUTES.find((key) => q.includes(key));

  switch (route) {
    case 'brief me on today': {
      const { todayEvents, freeHrs } = ctx;
      const first = todayEvents[0];
      return {
        text: sentences(
          `You have ${plural(todayEvents.length, 'event')} today.`,
          first && `Starting with ${first.title} at ${fmtClock(first.start, timeFormat)}.`,
          `${freeHrs.length} free hours available.`,
        ),
        actions:
          freeHrs.length > 0
            ? [
                { label: 'Block free time', icon: '＋' },
                { label: 'See full day', icon: '→' },
              ]
            : [{ label: 'See full day', icon: '→' }],
        previewEventIds: todayEvents.slice(0, 3).map((e) => e.id),
      };
    }

    case 'how was my day': {
      const { todayEvents, freeHrs } = ctx;
      return {
        text: sentences(
          `You had ${plural(todayEvents.length, 'event')} today.`,
          todayEvents.length > 2 ? 'Busy day!' : 'A light day.',
          `${freeHrs.length} hours were free.`,
        ),
        actions: [{ label: 'Review tomorrow', icon: '→' }],
        previewEventIds: todayEvents.slice(0, 3).map((e) => e.id),
      };
    }

    case 'prep for': {
      // v15 always prepped the next event. If the query names one (which the
      // "Prep for <title>" chip does), prefer that — same result for the chip,
      // correct result when the user types a different title.
      const named = ctx.upcoming.find((e) => e.title && q.includes(e.title.toLowerCase()));
      const ev = named ?? ctx.upcoming[0];
      if (!ev) return { text: 'Nothing upcoming.', actions: [], previewEventIds: [] };
      return {
        text: sentences(
          `${ev.title} is at ${fmtClock(ev.start, timeFormat)} on ${format(ev.start, 'MMM d')}.`,
          ev.description || 'No notes added yet.',
        ),
        actions: [
          { label: 'Add notes', icon: '✎' },
          { label: 'Reschedule', icon: '↻' },
        ],
        previewEventIds: [ev.id],
      };
    }

    case 'find free time': {
      const { freeHrs } = ctx;
      return {
        text: sentences(
          `You're free at ${freeHrs.map(freeHourLabel).join(', ')}.`,
          `That's ${plural(freeHrs.length, 'open hour')}.`,
        ),
        actions: [
          { label: 'Block 1 hour', icon: '＋' },
          { label: 'Block afternoon', icon: '＋' },
        ],
        previewEventIds: [],
      };
    }

    case 'summarize my week': {
      const { weekEvents, todayEvents, freeHrs } = ctx;
      return {
        text: sentences(
          `${weekEvents.length} events this week.`,
          `Busiest day is today with ${todayEvents.length} events.`,
          freeHrs.length > 3 ? 'You have room to breathe today.' : 'Pretty packed today.',
        ),
        actions: [{ label: 'See busiest day', icon: '→' }],
        previewEventIds: weekEvents.slice(0, 4).map((e) => e.id),
      };
    }

    default: {
      const { upcoming } = ctx;
      return {
        text: sentences(
          `You have ${upcoming.length} upcoming events.`,
          'Try asking me to brief you on today or find free time.',
        ),
        actions: [{ label: 'Brief me on today', icon: '→' }],
        previewEventIds: upcoming.slice(0, 2).map((e) => e.id),
      };
    }
  }
}

/* --------------------------------------------------------------- insights */

/** Every ambient insight that currently applies (v15 lines 736–743). */
export function buildInsights(events: readonly AskEvent[], now: Date): string[] {
  const { todayEvents, tomorrowEvents, freeHrs } = buildContext(events, now);
  const insights: string[] = [];

  if (todayEvents.length === 0) insights.push('Clear day — no events scheduled');
  else if (todayEvents.length >= 3) insights.push(`Packed day — ${todayEvents.length} events`);
  else insights.push(`${todayEvents.length} event${todayEvents.length > 1 ? 's' : ''} today`);

  if (tomorrowEvents.length === 0) insights.push('Tomorrow is wide open');
  else if (tomorrowEvents.length >= 3)
    insights.push(`Heads up — ${tomorrowEvents.length} events tomorrow`);

  if (freeHrs.length >= 4) insights.push(`${freeHrs.length} free hours today`);

  return insights;
}

/**
 * The single ambient insight to show when Ask is idle. v15 rotated with
 * `Math.floor(Date.now()/10000)`; `seed` is that rotation counter, injectable
 * so the value is deterministic under test.
 */
export function buildInsight(
  events: readonly AskEvent[],
  now: Date,
  seed?: number,
): string {
  const insights = buildInsights(events, now);
  if (!insights.length) return '';
  const counter = seed ?? Math.floor(Date.now() / 10000);
  const idx = ((Math.floor(counter) % insights.length) + insights.length) % insights.length;
  return insights[idx];
}
