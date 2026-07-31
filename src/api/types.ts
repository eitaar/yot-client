/**
 * TypeScript mirrors of the Yot data model, plus the app-side normalized shape.
 *
 * Wire types keep the server's snake_case exactly as `docs/api-spec.md` defines
 * it (§2 データモデル) so a payload can be handed straight from `fetch` into
 * these types without a rename pass. The normalized {@link AppEvent} is the
 * only shape the UI should see: real `Date` objects and a resolved colour.
 */

import { eventPalette } from '@/theme/tokens';

/* ------------------------------------------------------------- wire models */

/** `GET /api/calendars` element. */
export interface Calendar {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/** Sub-resource of an event; `minutes_before` is a non-negative integer. */
export interface Reminder {
  id: string;
  event_id: string;
  minutes_before: number;
  /** Free-form; the server defaults to `"notification"`. */
  method: string;
}

/**
 * `GET /api/events` element. Named `YotEvent` rather than `Event` so it never
 * collides with the DOM/RN `Event` global.
 */
export interface YotEvent {
  id: string;
  calendar_id: string;
  title: string;
  description: string | null;
  /** Free-form context the agent writes for itself (parking, prices, …). */
  context: string | null;
  location: string | null;
  /** ISO 8601 UTC, e.g. `2026-05-29T11:00:00.000Z`. */
  start_at: string;
  /** ISO 8601 UTC. */
  end_at: string;
  all_day: boolean;
  /** File name; fetch it from `/api/img/{image_path}`. */
  image_path: string | null;
  url: string | null;
  /** UID of the ICS entry this was imported from. */
  source_uid: string | null;
  created_at: string;
  updated_at: string;
  /** Tag *names*, not ids. */
  tags: string[];
  reminders: Reminder[];
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
}

/** Key scopes: a `read` key rejects every mutating method with 403. */
export type Scope = 'read' | 'write';

/* -------------------------------------------------------------- error shape */

/** The `code` values the server documents (§1 エラーレスポンス). */
export type KnownApiErrorCode =
  | 'validation_error'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'internal_error';

/**
 * Any string is accepted — the union above is for autocomplete, not for
 * rejecting codes a newer server might add.
 */
export type ApiErrorCode = KnownApiErrorCode | (string & {});

/** Every non-2xx response body has this shape. */
export interface ApiErrorEnvelope {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Zod issues; present on `validation_error` only. */
    details?: unknown[];
  };
}

/** Narrowing helper for anything parsed out of a response body. */
export function isApiErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const error = (value as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return false;
  return typeof (error as { code?: unknown }).code === 'string';
}

/* ---------------------------------------------------------------- requests */

/** `POST /api/auth/pair` body. Native clients must send `client: 'native'`. */
export interface PairRequest {
  pin: string;
  client: 'web' | 'native';
  /** Shown in `yot keys`; the server truncates at 64 characters. */
  device_name?: string;
}

/** `POST /api/auth/pair` 200 body. `key` is present only for native clients. */
export interface PairResponse {
  ok: true;
  scope: Scope;
  key?: string;
}

/** `GET /api/health` 200 body. */
export interface HealthResponse {
  status: string;
}

/** `GET /api/auth/session` 200 body. */
export interface SessionResponse {
  scope: Scope;
}

/** `GET /api/events` query. `limit` is clamped to 1–500 by the client. */
export interface ListEventsQuery {
  from?: string;
  to?: string;
  calendarId?: string;
  tag?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

/** POST /api/ask request body. */
export interface AskRequest {
  query: string;
  context?: string;
  model?: string;
}

/** POST /api/ask response body. */
export interface AskResponse {
  answer: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * `PATCH /api/events/{id}` body. Every field is optional; the nullable ones
 * are *cleared* by sending an explicit `null` (§3.4 UpdateEvent). Omitting a
 * field leaves it untouched — so `undefined` and `null` mean different things
 * here and must not be collapsed.
 *
 * `tags` is deliberately absent: the REST schema ignores it, tagging goes
 * through `POST|DELETE /api/events/{id}/tags/{tagId}`.
 */
export interface EventPatch {
  calendar_id?: string;
  title?: string;
  start_at?: string;
  end_at?: string;
  all_day?: boolean;
  description?: string | null;
  context?: string | null;
  location?: string | null;
  url?: string | null;
  image_path?: string | null;
}

/* -------------------------------------------------------- normalized model */

/**
 * The event shape the app renders. Dates are parsed, the colour is already
 * resolved, and nullable strings become optional (absent rather than `null`)
 * so components can use plain truthiness checks.
 */
export interface AppEvent {
  id: string;
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  /**
   * Local instant the event starts. For an all-day event this is **local
   * midnight** of its first calendar day — see {@link toAppEvent}.
   */
  start: Date;
  /**
   * Local instant the event ends, **exclusive**. For an all-day event this is
   * local midnight of the day *after* its last calendar day, which makes the
   * one membership rule in {@link occursOnDay} correct for timed and all-day
   * events alike.
   */
  end: Date;
  allDay: boolean;
  imagePath?: string;
  /** Hex string, always set — resolved from the calendar or hashed from `id`. */
  color: string;
  /**
   * Server `updated_at`, when the copy came from the server. Absent on events
   * restored from a pre-v2 cache. Used to decide which of two copies of the
   * same event is newer when a sync response and an SSE frame race.
   */
  updatedAt?: Date;
}

/**
 * FNV-1a over the id, 32-bit. Any stable hash works; this one is short,
 * dependency-free, and spreads short ids (`evt_1`, `evt_2`, …) across buckets.
 */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // hash * 16777619 without overflowing the float53 mantissa.
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic fallback colour: an id always lands on the same trio member. */
export function paletteColorForId(id: string): string {
  return eventPalette[hashString(id) % eventPalette.length];
}

/**
 * Calendar colour wins; a calendar with no colour (or an event whose calendar
 * we have not fetched) falls back to the hashed palette entry.
 */
export function resolveEventColor(
  event: Pick<YotEvent, 'id' | 'calendar_id'>,
  calendarsById: Readonly<Record<string, Calendar>> = {},
): string {
  const color = calendarsById[event.calendar_id]?.color;
  if (typeof color === 'string' && color.trim() !== '') return color.trim();
  return paletteColorForId(event.id);
}

/** `null | '' | undefined` -> `undefined`; anything else passes through. */
function optionalText(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : value;
}

/* --------------------------------------------------------------- all-day */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What Yot stores for an all-day event, and what the app does with it.
 *
 * **Storage.** The server keeps one `start_at`/`end_at` pair for every event and
 * has no separate date column, so an all-day entry is written as a UTC instant
 * whose *date part* is the calendar date. Both writers agree on this:
 * `src/services/import.rs` turns an ICS `DTSTART;VALUE=DATE:20260728` into
 * `"2026-07-28T00:00:00.000Z"`, and the bundled web UI submits
 * `new Date("2026-07-28").toISOString()`, which is the same string. The web UI
 * reads them back with `iso.slice(0, 10)` — the date part, never a local
 * conversion.
 *
 * **So:** the calendar date of an all-day event is the **UTC** date part, and it
 * must be rendered on that date in *local* terms. Parsing `2026-07-28T00:00Z`
 * as a plain instant would put an "all day Jul 28" on Jul 27 for anyone west of
 * UTC, so all-day instants are re-anchored to local midnight of their UTC date.
 *
 * **End dates are read as exclusive**, clamped up to at least one day. The two
 * writers disagree here — ICS `DTEND` is exclusive (a one-day event ends on the
 * *next* date) while the web UI submits an inclusive end date (a one-day event
 * starts and ends on the same date) — and nothing on the wire distinguishes
 * them. Exclusive-with-clamp is right for both single-day forms and for
 * multi-day ICS, i.e. three of the four combinations; reading them as inclusive
 * would be right for only two, and would stretch every imported single-day
 * event across two days. Storing the end exclusively also means
 * {@link occursOnDay} needs no all-day special case.
 */
export const ALL_DAY_END_IS_EXCLUSIVE = true;

/** Local midnight of the UTC calendar date inside an ISO instant. */
export function allDayLocalMidnight(iso: string): Date | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
}

/**
 * The inverse of {@link allDayLocalMidnight}: a local instant back to the
 * UTC-midnight form the server stores. Use this when patching an all-day event
 * so a Tokyo device does not send the previous day's date.
 */
export function toWireInstant(date: Date, allDay: boolean): string {
  if (!allDay) return date.toISOString();
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  ).toISOString();
}

/**
 * Wire event -> {@link AppEvent}. An unparsable `end_at` falls back to
 * `start_at` so the UI never has to defend against `Invalid Date` arithmetic.
 * All-day events are re-anchored to local calendar days — see
 * {@link ALL_DAY_END_IS_EXCLUSIVE}.
 */
export function toAppEvent(
  event: YotEvent,
  calendarsById: Readonly<Record<string, Calendar>> = {},
): AppEvent {
  const allDay = Boolean(event.all_day);

  let start: Date;
  let end: Date;

  if (allDay) {
    start = allDayLocalMidnight(event.start_at) ?? new Date(event.start_at);
    const parsedEnd = allDayLocalMidnight(event.end_at);
    // Exclusive end, and never shorter than the single day it starts on.
    end =
      parsedEnd && parsedEnd.getTime() > start.getTime()
        ? parsedEnd
        : new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  } else {
    start = new Date(event.start_at);
    const parsedEnd = new Date(event.end_at);
    end = Number.isNaN(parsedEnd.getTime()) ? start : parsedEnd;
  }

  const updatedAt = event.updated_at ? new Date(event.updated_at) : undefined;

  return {
    id: event.id,
    calendarId: event.calendar_id,
    title: event.title,
    description: optionalText(event.description),
    location: optionalText(event.location),
    start,
    end,
    allDay,
    imagePath: optionalText(event.image_path),
    color: resolveEventColor(event, calendarsById),
    updatedAt: updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : undefined,
  };
}

/**
 * Number of whole calendar days an all-day event covers (at least 1). Rounds
 * the millisecond span, so a DST day of 23 or 25 hours still counts as one.
 */
export function allDayLength(event: Pick<AppEvent, 'start' | 'end'>): number {
  const from = new Date(event.start.getFullYear(), event.start.getMonth(), event.start.getDate());
  const to = new Date(event.end.getFullYear(), event.end.getMonth(), event.end.getDate());
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS));
}

/** Chronological, ties broken by id so the order never flickers. */
export function compareEvents(a: AppEvent, b: AppEvent): number {
  const delta = a.start.getTime() - b.start.getTime();
  if (delta !== 0) return delta;
  const endDelta = a.end.getTime() - b.end.getTime();
  if (endDelta !== 0) return endDelta;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** `{ id }` payload shared by every `*.deleted` SSE frame. */
export interface DeletedPayload {
  id: string;
}
