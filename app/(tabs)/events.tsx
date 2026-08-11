import { startOfDay } from 'date-fns';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ListRow from '@/components/ListRow';
import PullToSync from '@/components/PullToSync';
import ScreenHeader from '@/components/ScreenHeader';
import { fmtTimeRange, groupUpcomingByDay } from '@/lib/dates';
import { upcoming, useEvents } from '@/store/events';
import { useEffectiveTimeZone, useTimeFormat } from '@/store/settings';
import { colors, fonts } from '@/theme/tokens';

/**
 * The Events tab — "Upcoming" (design lines 43-70).
 *
 * A flat, grouped list: one section per day, each headed by the relative label
 * ("Today" / "Tomorrow" / weekday) plus a faint date, then the day's events as
 * dot + title + time rows. Grouping lives in `lib/dates`, so this file is only
 * layout.
 */
export default function EventsScreen() {
  const insets = useSafeAreaInsets();
  const timeFormat = useTimeFormat();
  const timeZone = useEffectiveTimeZone();

  // Re-derive the grouping when the calendar day rolls over, so a session left
  // open overnight does not keep calling yesterday "Today".
  const [today, setToday] = useState(() => startOfDay(new Date()));
  useEffect(() => {
    const tick = setInterval(() => {
      const now = startOfDay(new Date());
      setToday((prev) => (prev.getTime() === now.getTime() ? prev : now));
    }, 60_000);
    return () => clearInterval(tick);
  }, []);

  const events = useEvents((s) => upcoming(s, today));
  const groups = useMemo(() => groupUpcomingByDay(events, today), [events, today]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenHeader title="Upcoming" testID="events-header" />

      <PullToSync
        testID="events-pull"
        scrollTestID="events-scroll"
        scrollViewStyle={styles.scroll}
        contentContainerStyle={styles.content}
      >
        {groups.length === 0 ? (
          <Text style={styles.empty}>Nothing upcoming</Text>
        ) : (
          groups.map((group) => (
            <View key={group.date.toISOString()} style={styles.group}>
              <View style={styles.groupHeader}>
                <Text style={styles.relLabel} testID={`group-${group.relLabel}`}>
                  {group.relLabel}
                </Text>
                <Text style={styles.dateLabel}>{group.dateLabel}</Text>
              </View>

              {group.events.map((event) => (
                <ListRow
                  key={event.id}
                  testID={`event-row-${event.id}`}
                  title={event.title}
                  subtitle={fmtTimeRange(event.start, event.end, timeFormat, undefined, timeZone)}
                  dotColor={event.color}
                  onPress={() => router.push(`/event/${event.id}`)}
                />
              ))}
            </View>
          ))
        )}
      </PullToSync>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  scroll: {
    flex: 1,
  },
  content: {
    // design: `padding: 4px 0 20px` on the scroller
    paddingTop: 4,
    paddingBottom: 20,
  },
  group: {
    paddingHorizontal: 24,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    paddingTop: 18,
    paddingBottom: 10,
  },
  relLabel: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  dateLabel: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.faintWarm,
  },
  empty: {
    paddingTop: 40,
    textAlign: 'center',
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.faint,
  },
});
