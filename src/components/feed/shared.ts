import { differenceInCalendarDays, format } from 'date-fns';

import type { AppEvent } from '@/api/types';
import type { PullScrollProps } from '@/components/PullToSync';
import type { TimeFormat } from '@/lib/dates';
import { fmtClock } from '@/lib/dates';

/** What every feed layout receives. */
export interface FeedLayoutProps {
  events: readonly AppEvent[];
  /** Midnight today — the pivot for "Today" / "Tomorrow" / "later". */
  today: Date;
  timeFormat: TimeFormat;
  /** IANA zone for clock labels; defaults to the device zone. */
  timeZone?: string;
  onOpen: (id: string) => void;
  /**
   * Spread onto the layout's outer `ScrollView` so the surrounding
   * `PullToSync` can see the offset and share the scroll gesture. Absent when
   * the layout is rendered outside one.
   */
  scrollProps?: PullScrollProps;
}

/**
 * The design's `dateLabel` (line 508): "Today" / "Tomorrow" / "Wednesday,
 * Jul 16". The prototype hardcoded July; here the month comes from the date.
 */
export function feedDateLabel(date: Date, today: Date): string {
  const diff = differenceInCalendarDays(date, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `${format(date, 'EEEE')}, ${format(date, 'MMM d')}`;
}

/** The design's `timeLabel`: the start time alone, e.g. "2:30 PM". */
export function feedTimeLabel(
  event: AppEvent,
  timeFormat: TimeFormat,
  timeZone?: string,
): string {
  return fmtClock(event.start, timeFormat, timeZone);
}

/** "Jul 16 · 2:30 PM" — the caption under a paired Dynamic card (line 561). */
export function feedShortLine(
  event: AppEvent,
  timeFormat: TimeFormat,
  timeZone?: string,
): string {
  return `${format(event.start, 'MMM d')} · ${feedTimeLabel(event, timeFormat, timeZone)}`;
}

/** "Tomorrow · 2:30 PM" — the caption used by every other layout. */
export function feedLongLine(
  event: AppEvent,
  today: Date,
  timeFormat: TimeFormat,
  timeZone?: string,
): string {
  return `${feedDateLabel(event.start, today)} · ${feedTimeLabel(event, timeFormat, timeZone)}`;
}
