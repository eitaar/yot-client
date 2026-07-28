import { differenceInCalendarDays } from 'date-fns';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AppEvent } from '@/api/types';
import AppPressable from '@/components/AppPressable';
import EventThumb, { VerticalScrim } from '@/components/EventThumb';
import {
  feedDateLabel,
  feedShortLine,
  feedTimeLabel,
  type FeedLayoutProps,
} from '@/components/feed/shared';
import { colors, fonts } from '@/theme/tokens';

/**
 * Feed layout A — **Dynamic** (design lines 516-580).
 *
 * A horizontal "Next up" rail of everything due today or tomorrow, then a
 * "Coming up" column that alternates full-width heroes (every 5th) with pairs
 * of half-width cards whose thumbnail heights alternate row by row.
 *
 * Deviation: the prototype buffered cards in twos and **silently dropped** a
 * trailing odd one (line 543 flushes only at `length === 2`). Losing an event
 * from the feed is a bug, not a look, so a lone leftover renders as a
 * half-width card with an empty slot beside it.
 */
export default function DynamicFeed({
  events,
  today,
  timeFormat,
  onOpen,
  scrollProps,
}: FeedLayoutProps) {
  const { soon, rows } = useMemo(() => {
    const soonEvents: AppEvent[] = [];
    const later: AppEvent[] = [];
    for (const event of events) {
      if (differenceInCalendarDays(event.start, today) <= 1) soonEvents.push(event);
      else later.push(event);
    }

    type Row =
      | { kind: 'hero'; event: AppEvent }
      | { kind: 'pair'; a: AppEvent; b?: AppEvent; heights: [number, number] };

    const out: Row[] = [];
    let buffer: AppEvent[] = [];
    let pairCount = 0;

    const flush = () => {
      if (buffer.length === 0) return;
      // Row parity drives the height alternation (design lines 550-552).
      const heights: [number, number] = pairCount % 2 === 0 ? [110, 120] : [120, 110];
      pairCount += 1;
      out.push({ kind: 'pair', a: buffer[0], b: buffer[1], heights });
      buffer = [];
    };

    later.forEach((event, idx) => {
      if (idx % 5 === 0) {
        out.push({ kind: 'hero', event });
        return;
      }
      buffer.push(event);
      if (buffer.length === 2) flush();
    });
    flush();

    return { soon: soonEvents, rows: out };
  }, [events, today]);

  return (
    <ScrollView
      {...scrollProps}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      testID="feed-dynamic"
    >
      {soon.length > 0 ? (
        <View>
          <Text style={[styles.eyebrow, styles.eyebrowFirst]}>NEXT UP</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rail}
          >
            {soon.map((event) => (
              <AppPressable
                key={event.id}
                variant="button"
                accessibilityRole="button"
                accessibilityLabel={event.title}
                testID={`feed-card-${event.id}`}
                onPress={() => onOpen(event.id)}
                style={styles.soonCard}
              >
                <EventThumb
                  id={event.id}
                  imagePath={event.imagePath}
                  iconSize={28}
                  radius={12}
                  style={styles.soonThumb}
                >
                  <View style={styles.timeChip}>
                    <Text style={styles.timeChipLabel}>{feedTimeLabel(event, timeFormat)}</Text>
                  </View>
                </EventThumb>
                <View style={styles.soonCaption}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {event.title}
                  </Text>
                  <Text style={styles.soonDate} numberOfLines={1}>
                    {feedDateLabel(event.start, today)}
                  </Text>
                </View>
              </AppPressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <Text style={styles.eyebrow}>COMING UP</Text>

      <View style={styles.grid}>
        {rows.map((row) =>
          row.kind === 'hero' ? (
            <AppPressable
              key={row.event.id}
              variant="button"
              accessibilityRole="button"
              accessibilityLabel={row.event.title}
              testID={`feed-card-${row.event.id}`}
              onPress={() => onOpen(row.event.id)}
            >
              <EventThumb
                id={row.event.id}
                imagePath={row.event.imagePath}
                iconSize={64}
                iconOpacity={0.15}
                iconStrokeWidth={0.8}
                iconPosition="right"
                radius={16}
                style={styles.hero}
              >
                <View style={styles.heroOverlay}>
                  <VerticalScrim color="#000000" toOpacity={0.06} />
                  <Text style={styles.heroTitle} numberOfLines={2}>
                    {row.event.title}
                  </Text>
                  <Text style={styles.heroSub}>
                    {`${feedDateLabel(row.event.start, today)} · ${feedTimeLabel(
                      row.event,
                      timeFormat,
                    )}`}
                  </Text>
                </View>
              </EventThumb>
            </AppPressable>
          ) : (
            <View key={`pair-${row.a.id}`} style={styles.pairRow}>
              <PairCard
                event={row.a}
                height={row.heights[0]}
                timeFormat={timeFormat}
                onOpen={onOpen}
              />
              {row.b ? (
                <PairCard
                  event={row.b}
                  height={row.heights[1]}
                  timeFormat={timeFormat}
                  onOpen={onOpen}
                />
              ) : (
                <View style={styles.pairSpacer} />
              )}
            </View>
          ),
        )}
      </View>
    </ScrollView>
  );
}

function PairCard({
  event,
  height,
  timeFormat,
  onOpen,
}: {
  event: AppEvent;
  height: number;
  timeFormat: FeedLayoutProps['timeFormat'];
  onOpen: (id: string) => void;
}) {
  return (
    <AppPressable
      variant="button"
      accessibilityRole="button"
      accessibilityLabel={event.title}
      testID={`feed-card-${event.id}`}
      onPress={() => onOpen(event.id)}
      style={styles.pairCard}
    >
      <EventThumb
        id={event.id}
        imagePath={event.imagePath}
        iconSize={28}
        radius={14}
        style={[styles.pairThumb, { height }]}
      />
      <View style={styles.pairCaption}>
        <Text style={styles.pairTitle} numberOfLines={2}>
          {event.title}
        </Text>
        <Text style={styles.pairDate} numberOfLines={1}>
          {feedShortLine(event, timeFormat)}
        </Text>
      </View>
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 4,
  },

  /* ------------------------------------------------------------ eyebrows */

  eyebrow: {
    // design: `padding: 0 24px 6px` (the "Next up" one adds 10px on top)
    paddingHorizontal: 24,
    paddingBottom: 6,
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.faintWarm,
    letterSpacing: 0.5,
  },
  eyebrowFirst: {
    paddingTop: 10,
    paddingBottom: 8,
  },

  /* ---------------------------------------------------------- next-up rail */

  rail: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingBottom: 18,
  },
  soonCard: {
    width: 120,
    flexShrink: 0,
  },
  soonThumb: {
    height: 110,
  },
  timeChip: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  timeChipLabel: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  soonCaption: {
    paddingTop: 8,
    paddingHorizontal: 2,
  },
  cardTitle: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  soonDate: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.faintWarm,
    marginTop: 2,
  },

  /* ------------------------------------------------------------ hero card */

  grid: {
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  hero: {
    height: 150,
    justifyContent: 'center',
  },
  heroOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 40,
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  heroTitle: {
    fontSize: 20,
    fontFamily: fonts.extrabold,
    color: colors.ink,
    letterSpacing: -0.5,
    lineHeight: 23,
  },
  heroSub: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: 'rgba(15,15,15,0.55)',
    marginTop: 4,
  },

  /* ----------------------------------------------------------- pair cards */

  pairRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pairCard: {
    flex: 1,
    justifyContent: 'space-between',
  },
  pairSpacer: {
    flex: 1,
  },
  pairThumb: {
    width: '100%',
  },
  pairCaption: {
    paddingTop: 7,
    paddingHorizontal: 2,
  },
  pairTitle: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.ink,
    letterSpacing: -0.2,
    lineHeight: 17,
  },
  pairDate: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.muted,
    marginTop: 2,
  },
});
