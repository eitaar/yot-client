import {
  addMonths,
  addDays,
  endOfMonth,
  format,
  isSameDay,
  startOfDay,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  ZoomIn,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getCachedSession } from '@/api/session';
import type { AppEvent } from '@/api/types';
import AppPressable from '@/components/AppPressable';
import ListRow from '@/components/ListRow';
import PullToSync from '@/components/PullToSync';
import { MonthChevronIcon } from '@/components/icons';
import { fmtClock, fmtTimeRange, monthGrid, shortDayLabels, weekOf } from '@/lib/dates';
import {
  CAP_X,
  CARD_L,
  GUTTER,
  fmtDur,
  hourLabelText,
  layoutDay,
  type LayoutBlock,
} from '@/lib/layoutDay';
import { selectSortedEvents, useDayEvents, useEvents } from '@/store/events';
import { useEffectiveTimeZone, useTimeFormat, useWeekStart } from '@/store/settings';
import { useTheme } from '@/theme/context';
import { easing, fonts, layout } from '@/theme/tokens';
import type { Colors } from '@/theme/tokens';

/**
 * The Calendar tab — design lines 320–490.
 *
 * Two surfaces share one `selectedDate`: a collapsible month panel on top, and
 * below it a pair of cross-faded layers — the day view (header, week strip and
 * the proportional capsule timeline) and, when the month is expanded, the
 * selected day's event list.
 *
 * Deviations from the prototype, both sanctioned by the plan:
 *  - the month arrows **navigate**; in the prototype they were decorative;
 *  - selecting a day in the expanded grid keeps the month open (the prototype
 *    had no such interaction to get wrong, and collapsing felt wrong in use).
 */

/* --------------------------------------------------------------- constants */

/** `max-height` the month panel opens to — design line 321. */
const PANEL_MAX_H = 330;
const PANEL_MS = 380;
const CROSSFADE_MS = 350;
/** Swipe distance that toggles the panel — design line 458. */
const SWIPE_THRESHOLD = 50;
/** Left margin of the timeline canvas — design line 431. */
const CANVAS_LEFT = 24;
/** Right inset of timeline content — design lines 385/393. */
const CANVAS_RIGHT = 24;
/** Lane geometry for overlapping events — design lines 391–398. */
const LANE_LEFT = CAP_X - 5;
const LANE_GAP = 8;

const STANDARD = Easing.bezier(...easing.standard);

const dayKey = (date: Date) => format(date, 'yyyy-MM-dd');

/* ------------------------------------------------------------------- dots */

/** Up to three event colours per calendar day, chronological. */
function useDotsByDay(): Map<string, string[]> {
  const sorted = useEvents(selectSortedEvents);

  return useMemo(() => {
    const map = new Map<string, string[]>();
    for (const event of sorted) {
      const last = startOfDay(event.end);
      let cursor = startOfDay(event.start);
      // A runaway multi-day event must not spin here; a year is plenty.
      for (let i = 0; i < 366 && cursor <= last; i++) {
        const key = dayKey(cursor);
        const dots = map.get(key);
        if (!dots) map.set(key, [event.color]);
        else if (dots.length < 3) dots.push(event.color);
        cursor = addDays(cursor, 1);
      }
    }
    return map;
  }, [sorted]);
}

/** `dotAppear 0.3s cubic-bezier(.22,1,.36,1)`, staggered 50ms — design line 368. */
const DOT_POP_MS = 300;
const DOT_POP_STAGGER_MS = 50;

function Dots({ colors: dots, pop = false }: { colors: string[] | undefined; pop?: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!dots || dots.length === 0) return <View style={styles.dotSpacer} />;
  return (
    <View style={styles.dotRow}>
      {dots.map((color, i) =>
        pop ? (
          <Animated.View
            key={i}
            entering={ZoomIn.duration(DOT_POP_MS).delay(i * DOT_POP_STAGGER_MS)}
            style={[styles.dot, { backgroundColor: color }]}
          />
        ) : (
          <View key={i} style={[styles.dot, { backgroundColor: color }]} />
        ),
      )}
    </View>
  );
}

/* --------------------------------------------------------------- timeline */

interface BlockGeometry {
  capLeft: number;
  markerLeft: number;
  textLeft: number;
  textRight?: number;
  textWidth?: number;
  narrow: boolean;
}

/** Design lines 388–399: full width for a lone event, lanes for a cluster. */
function geometryFor(block: LayoutBlock, canvasWidth: number): BlockGeometry {
  if (block.cols <= 1) {
    return {
      capLeft: CAP_X - 3,
      markerLeft: CAP_X - 5,
      textLeft: CARD_L,
      textRight: CANVAS_RIGHT,
      narrow: false,
    };
  }
  const colWidth =
    (canvasWidth - (LANE_LEFT + CANVAS_RIGHT) - (block.cols - 1) * LANE_GAP) / block.cols;
  const laneLeft = LANE_LEFT + block.lane * (colWidth + LANE_GAP);
  return {
    capLeft: laneLeft + 2,
    markerLeft: laneLeft,
    textLeft: laneLeft + 14,
    textWidth: Math.max(0, colWidth - 14),
    narrow: true,
  };
}

function TimelineBlock({
  block,
  event,
  canvasWidth,
  timeFormat,
  timeZone,
}: {
  block: LayoutBlock;
  event: AppEvent;
  canvasWidth: number;
  timeFormat: '12h' | '24h';
  timeZone?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const geo = geometryFor(block, canvasWidth);
  const dim = block.isPast ? styles.past : null;
  const timeLabel = geo.narrow
    ? `${fmtClock(event.start, timeFormat, timeZone)} · ${fmtDur(block.endMin - block.startMin)}`
    : fmtTimeRange(event.start, event.end, timeFormat, undefined, timeZone);

  return (
    <>
      {/* The capsule is the single source of geometric truth: dot = start,
          length = duration, ring = end. */}
      <View
        pointerEvents="none"
        style={[
          styles.capsule,
          dim,
          {
            left: geo.capLeft,
            top: block.top,
            height: block.height,
            backgroundColor: event.color,
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.startDot,
          dim,
          { left: geo.markerLeft, top: block.top - 1, backgroundColor: event.color },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.endRing,
          dim,
          { left: geo.markerLeft, top: block.top + block.height - 9, borderColor: event.color },
        ]}
      />
      <AppPressable
        variant="row"
        testID={`timeline-block-${block.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${event.title}, ${timeLabel}`}
        onPress={() => router.push(`/event/${block.id}`)}
        style={[
          styles.blockText,
          dim,
          {
            left: geo.textLeft,
            top: block.top - 3,
            ...(geo.textWidth != null ? { width: geo.textWidth } : { right: geo.textRight }),
          },
        ]}
      >
        <Text
          style={[styles.blockTitle, geo.narrow && styles.blockTitleNarrow]}
          numberOfLines={geo.narrow ? 1 : undefined}
        >
          {event.title}
        </Text>
        <Text style={[styles.blockTime, geo.narrow && styles.blockTimeNarrow]} numberOfLines={1}>
          {timeLabel}
        </Text>
      </AppPressable>
    </>
  );
}

/* ------------------------------------------------------------------ screen */

export default function CalendarScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const weekStart = useWeekStart();
  const timeFormat = useTimeFormat();
  const timeZone = useEffectiveTimeZone();

  /* --- clock: the NOW line and "past" dimming must follow the real time --- */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const todayKey = dayKey(now);
  const today = useMemo(() => startOfDay(now), [todayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------------------------------------- selection */
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [monthExpanded, setMonthExpanded] = useState(false);

  const selectDay = (date: Date) => {
    setSelectedDate(date);
    // The week strip can cross a month boundary; keep the grid on the same one.
    const month = startOfMonth(date);
    if (month.getTime() !== monthCursor.getTime()) setMonthCursor(month);
  };

  /* ------------------------------------------------------------------ data */
  // Split, not flat: an all-day event handed to `layoutDay` opens the window to
  // 00:00–24:00 and squeezes every timed event into half a lane for the day.
  const { allDay: allDayEvents, timed: dayEvents } = useDayEvents(selectedDate);
  const dotsByDay = useDotsByDay();

  // Pull the visible month (± a month of context) whenever the month changes.
  // The root layout already synced the current window at launch, so the first
  // run is skipped rather than duplicated.
  const firstMonthEffect = useRef(true);
  useEffect(() => {
    if (firstMonthEffect.current) {
      firstMonthEffect.current = false;
      return;
    }
    if (!getCachedSession()) return;
    void useEvents.getState().sync({
      from: startOfMonth(subMonths(monthCursor, 1)).toISOString(),
      to: endOfMonth(addMonths(monthCursor, 1)).toISOString(),
    });
  }, [monthCursor]);

  /* ------------------------------------------------------------ animation */
  const panel = useSharedValue(0);
  const fade = useSharedValue(0);

  useEffect(() => {
    panel.value = withTiming(monthExpanded ? 1 : 0, { duration: PANEL_MS, easing: STANDARD });
    fade.value = withTiming(monthExpanded ? 1 : 0, { duration: CROSSFADE_MS, easing: STANDARD });
  }, [monthExpanded, panel, fade]);

  const panelStyle = useAnimatedStyle(() => ({ maxHeight: panel.value * PANEL_MAX_H }));
  const dayLayerStyle = useAnimatedStyle(() => ({
    opacity: 1 - fade.value,
    transform: [{ translateY: -8 * fade.value }],
  }));
  const monthLayerStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: 8 * (1 - fade.value) }],
  }));

  // Vertical swipe over the header area toggles the panel (design 452–461).
  const swipe = useMemo(
    () =>
      Gesture.Pan().onEnd((e) => {
        const dy = e.translationY;
        if (Math.abs(e.translationX) > Math.abs(dy)) return;
        if (dy > SWIPE_THRESHOLD) runOnJS(setMonthExpanded)(true);
        else if (dy < -SWIPE_THRESHOLD) runOnJS(setMonthExpanded)(false);
      }),
    [],
  );

  /* ------------------------------------------------------------- timeline */
  const [canvasWidth, setCanvasWidth] = useState(
    () => Dimensions.get('window').width - CANVAS_LEFT,
  );
  const onCanvasLayout = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    if (width > 0 && Math.abs(width - canvasWidth) > 0.5) setCanvasWidth(width);
  };

  const dayLayout = useMemo(
    () => layoutDay(dayEvents, { dayStart: selectedDate, now, timeZone }),
    [dayEvents, selectedDate, now, timeZone],
  );
  const eventById = useMemo(() => {
    const map = new Map<string, AppEvent>();
    for (const event of dayEvents) map.set(event.id, event);
    return map;
  }, [dayEvents]);

  /* --------------------------------------------------------------- labels */
  const isSelectedToday = isSameDay(selectedDate, today);
  const cells = useMemo(
    () => monthGrid(monthCursor.getFullYear(), monthCursor.getMonth(), weekStart),
    [monthCursor, weekStart],
  );
  const weekDays = useMemo(() => weekOf(selectedDate, weekStart), [selectedDate, weekStart]);
  const shortDays = useMemo(() => shortDayLabels(weekStart), [weekStart]);

  /* ----------------------------------------------------------------- view */

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <GestureDetector gesture={swipe}>
        <View>
          <Animated.View style={[styles.panel, panelStyle]}>
            <View style={styles.monthHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                testID="month-prev"
                hitSlop={10}
                onPress={() => setMonthCursor((m) => subMonths(m, 1))}
              >
                <MonthChevronIcon direction="left" />
              </Pressable>
              <Text testID="month-label" style={styles.monthLabel}>
                {format(monthCursor, 'MMMM yyyy')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next month"
                testID="month-next"
                hitSlop={10}
                onPress={() => setMonthCursor((m) => addMonths(m, 1))}
              >
                <MonthChevronIcon direction="right" />
              </Pressable>
            </View>

            <View style={styles.weekdayRow}>
              {shortDays.map((label, i) => (
                <Text key={i} style={styles.weekdayLabel}>
                  {label}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {cells.map((date, i) => {
                if (!date) return <View key={i} style={styles.gridCell} />;
                const isToday = isSameDay(date, today);
                const isSelected = isSameDay(date, selectedDate) && !isToday;
                const isPast = date < today;
                return (
                  <Pressable
                    key={i}
                    accessibilityRole="button"
                    testID={`month-day-${dayKey(date)}`}
                    accessibilityLabel={format(date, 'EEEE, MMMM d')}
                    onPress={() => selectDay(date)}
                    style={styles.gridCell}
                  >
                    <View
                      style={[
                        styles.gridDisc,
                        isToday && styles.discToday,
                        isSelected && styles.discSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.gridNumber,
                          isToday && styles.gridNumberToday,
                          !isToday && isPast && styles.gridNumberPast,
                        ]}
                      >
                        {date.getDate()}
                      </Text>
                    </View>
                    <Dots colors={dotsByDay.get(dayKey(date))} />
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={monthExpanded ? 'Collapse month' : 'Expand month'}
            testID="month-handle"
            onPress={() => setMonthExpanded((v) => !v)}
            style={styles.handleHit}
          >
            <View style={styles.handle} />
          </Pressable>
        </View>
      </GestureDetector>

      <View style={styles.layers}>
        {/* ---------------------------------------------------- day view --- */}
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.dayLayer, dayLayerStyle]}
          pointerEvents={monthExpanded ? 'none' : 'auto'}
        >
          <View style={styles.dayHeader}>
            <Text testID="day-number" style={styles.dayNumber}>
              {selectedDate.getDate()}
            </Text>
            <View style={styles.dayHeaderText}>
              <Text style={styles.dayWeekday}>{format(selectedDate, 'EEEE')}</Text>
              <Text testID="day-month" style={styles.dayMonth}>
                {format(selectedDate, 'MMMM yyyy')}
              </Text>
            </View>
            {isSelectedToday ? <Text style={styles.todayFlag}>TODAY</Text> : null}
          </View>

          <View style={styles.headerRule} />

          <View style={styles.weekStrip}>
            {weekDays.map((date, i) => {
              const isToday = isSameDay(date, today);
              const isSelected = isSameDay(date, selectedDate);
              return (
                <Pressable
                  key={i}
                  accessibilityRole="button"
                  testID={`week-day-${dayKey(date)}`}
                  accessibilityLabel={format(date, 'EEEE, MMMM d')}
                  onPress={() => selectDay(date)}
                  style={styles.weekCell}
                >
                  <Text style={styles.weekLetter}>{shortDays[i]}</Text>
                  <View
                    style={[
                      styles.weekDisc,
                      isToday && styles.discToday,
                      isSelected && !isToday && styles.discSelected,
                    ]}
                  >
                    <Text style={[styles.weekNumber, isToday && styles.weekNumberToday]}>
                      {date.getDate()}
                    </Text>
                  </View>
                  {/* Keyed by the day so switching weeks remounts these and
                      replays the pop — the design's `dotAppear`. */}
                  <Dots key={dayKey(date)} pop colors={dotsByDay.get(dayKey(date))} />
                </Pressable>
              );
            })}
          </View>

          {/*
            The pull surface covers the empty day too: "Nothing scheduled" is
            exactly when someone reaches for a refresh.
          */}
          <PullToSync
            testID="calendar-pull"
            scrollTestID="timeline-scroll"
            scrollViewStyle={styles.timeline}
            contentContainerStyle={
              dayEvents.length === 0 ? styles.timelineEmptyContent : styles.timelineContent
            }
          >
            {allDayEvents.length > 0 && (
              <View testID="all-day-row" style={styles.allDayRow}>
                {allDayEvents.map((event) => (
                  <AppPressable
                    key={event.id}
                    variant="row"
                    onPress={() => router.push(`/event/${event.id}`)}
                    style={styles.allDayChip}
                  >
                    <View style={[styles.allDayDot, { backgroundColor: event.color }]} />
                    <Text numberOfLines={1} style={styles.allDayTitle}>
                      {event.title}
                    </Text>
                    <Text style={styles.allDayLabel}>All day</Text>
                  </AppPressable>
                ))}
              </View>
            )}
            {dayEvents.length === 0 ? (
              allDayEvents.length === 0 && (
                <View style={styles.emptyDay}>
                  <Text testID="timeline-empty" style={styles.emptyText}>
                    Nothing scheduled
                  </Text>
                </View>
              )
            ) : (
              <View
                testID="timeline-canvas"
                onLayout={onCanvasLayout}
                style={[styles.canvas, { height: dayLayout.totalHeight }]}
              >
                {dayLayout.hourMarks.map((minutes) => {
                  const top = (minutes - dayLayout.winStartMin) * (layout.pixelsPerHour / 60);
                  return (
                    <View key={minutes}>
                      <View style={[styles.hourRule, { top }]} />
                      <Text style={[styles.hourLabel, { top: top - 6 }]}>
                        {hourLabelText(minutes / 60, timeFormat)}
                      </Text>
                    </View>
                  );
                })}

                {dayLayout.blocks.map((block) => {
                  const event = eventById.get(block.id);
                  if (!event) return null;
                  return (
                    <TimelineBlock
                      key={block.id}
                      block={block}
                      event={event}
                      canvasWidth={canvasWidth}
                      timeFormat={timeFormat}
                      timeZone={timeZone}
                    />
                  );
                })}

                {isSelectedToday && dayLayout.nowOffset != null ? (
                  <View
                    testID="now-line"
                    pointerEvents="none"
                    style={[styles.nowLine, { top: dayLayout.nowOffset }]}
                  >
                    <Text style={styles.nowLabel}>NOW</Text>
                    <View style={styles.nowDot} />
                    <View style={styles.nowRule} />
                  </View>
                ) : null}
              </View>
            )}
          </PullToSync>
        </Animated.View>

        {/* -------------------------------------------- month event list --- */}
        <Animated.View
          style={[StyleSheet.absoluteFill, monthLayerStyle]}
          pointerEvents={monthExpanded ? 'auto' : 'none'}
        >
          <ScrollView contentContainerStyle={styles.monthList}>
            <View style={styles.monthListHeader}>
              <Text testID="month-list-day" style={styles.monthListDay}>
                {format(selectedDate, 'EEEE, MMMM d')}
              </Text>
              {isSelectedToday ? <Text style={styles.monthListToday}>Today</Text> : null}
            </View>

            {dayEvents.length === 0 ? (
              <Text style={styles.monthListEmpty}>Nothing scheduled</Text>
            ) : (
              dayEvents.map((event, i) => (
                <ListRow
                  key={event.id}
                  testID={`month-row-${event.id}`}
                  title={event.title}
                  subtitle={fmtTimeRange(event.start, event.end, timeFormat, undefined, timeZone)}
                  dotColor={event.color}
                  showChevron={false}
                  last={i === dayEvents.length - 1}
                  onPress={() => router.push(`/event/${event.id}`)}
                />
              ))
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ styles */

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },

  /* month panel */
  panel: {
    overflow: 'hidden',
    flexShrink: 0,
  },
  monthHeader: {
    paddingTop: 8,
    paddingHorizontal: 24,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthLabel: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  weekdayRow: {
    flexDirection: 'row',
    paddingTop: 6,
    paddingHorizontal: 20,
    paddingBottom: 2,
  },
  weekdayLabel: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: colors.faint,
    letterSpacing: 0.3,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  gridCell: {
    width: `${100 / 7}%`,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  gridDisc: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discToday: {
    backgroundColor: colors.ink,
  },
  discSelected: {
    backgroundColor: colors.hairlineStrong,
  },
  gridNumber: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.ink,
  },
  gridNumberToday: {
    fontFamily: fonts.bold,
    color: colors.canvas,
  },
  gridNumberPast: {
    color: '#CCCCCC',
  },

  /* drag handle */
  handleHit: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  handle: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.fieldBorder,
  },

  /* dots */
  dotRow: {
    flexDirection: 'row',
    gap: 2,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  dotSpacer: {
    height: 4,
  },

  /* cross-faded layers */
  layers: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  dayLayer: {
    flexDirection: 'column',
  },

  /* day header */
  dayHeader: {
    paddingTop: 4,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  dayNumber: {
    fontSize: 52,
    fontFamily: fonts.light,
    color: colors.ink,
    lineHeight: 52,
    letterSpacing: -3,
    fontVariant: ['tabular-nums'],
  },
  dayHeaderText: {
    paddingBottom: 10,
    gap: 1,
  },
  dayWeekday: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.muted,
  },
  dayMonth: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.ink,
  },
  todayFlag: {
    marginLeft: 'auto',
    marginBottom: 12,
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.blue,
    letterSpacing: 0.5,
  },
  headerRule: {
    height: layout.hairlineWidth,
    backgroundColor: colors.hairlineStrong,
    marginTop: 8,
    marginHorizontal: 24,
    flexShrink: 0,
  },

  /* week strip */
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 14,
    paddingHorizontal: 20,
    paddingBottom: 10,
    flexShrink: 0,
  },
  weekCell: {
    width: 44,
    alignItems: 'center',
    gap: 5,
  },
  weekLetter: {
    fontSize: 10,
    fontFamily: fonts.semibold,
    color: colors.faint,
    letterSpacing: 0.5,
  },
  weekDisc: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekNumber: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: colors.ink,
  },
  weekNumberToday: {
    fontFamily: fonts.bold,
    color: colors.canvas,
  },

  /* timeline */
  timeline: {
    flex: 1,
  },
  timelineContent: {
    paddingTop: 10,
    paddingBottom: 24,
  },
  // The empty state has to fill the scroller for its centring to mean anything.
  timelineEmptyContent: {
    flexGrow: 1,
  },
  canvas: {
    position: 'relative',
    marginLeft: CANVAS_LEFT,
  },
  hourRule: {
    position: 'absolute',
    left: CAP_X,
    right: 0,
    height: layout.hairlineWidth,
    backgroundColor: colors.hairlineWarm,
  },
  hourLabel: {
    position: 'absolute',
    left: 0,
    width: GUTTER,
    textAlign: 'right',
    fontSize: 10.5,
    lineHeight: 13,
    fontFamily: fonts.medium,
    color: '#BFBDB8',
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
  },
  capsule: {
    position: 'absolute',
    width: 6,
    borderRadius: 3,
  },
  startDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.canvas,
  },
  endRing: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2.5,
    backgroundColor: colors.canvas,
  },
  past: {
    opacity: 0.5,
  },
  blockText: {
    position: 'absolute',
  },
  blockTitle: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  blockTitleNarrow: {
    fontSize: 13.5,
  },
  blockTime: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.muted,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  blockTimeNarrow: {
    fontSize: 11,
  },

  /* now line */
  nowLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  nowLabel: {
    width: GUTTER,
    textAlign: 'right',
    fontSize: 10,
    fontFamily: fonts.extrabold,
    color: colors.ink,
    letterSpacing: 0.3,
  },
  nowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.ink,
    marginLeft: CAP_X - GUTTER - 4,
    flexShrink: 0,
  },
  nowRule: {
    flex: 1,
    height: 1.5,
    backgroundColor: colors.ink,
    marginRight: CANVAS_RIGHT,
  },

  /* empty day */
  emptyDay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
  },
  // All-day entries sit above the timeline rather than inside it — see the
  // note on `useDayEvents`. Quiet by design: the hour grid stays the focus.
  allDayRow: {
    paddingHorizontal: 24,
    paddingBottom: 8,
    gap: 6,
  },
  allDayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairlineFaint,
  },
  allDayDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  allDayTitle: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 15,
    letterSpacing: -0.2,
    color: colors.ink,
  },
  allDayLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: colors.faint,
  },

  /* month event list */
  monthList: {
    paddingTop: 8,
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  monthListHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    paddingBottom: 10,
  },
  monthListDay: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  monthListToday: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.blue,
  },
  monthListEmpty: {
    paddingVertical: 24,
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.faint,
  },
});
