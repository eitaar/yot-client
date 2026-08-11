import { ScrollView, StyleSheet, Text, View } from 'react-native';

import AppPressable from '@/components/AppPressable';
import EventThumb, { VerticalScrim } from '@/components/EventThumb';
import {
  feedDateLabel,
  feedLongLine,
  feedTimeLabel,
  type FeedLayoutProps,
} from '@/components/feed/shared';
import { colors, fonts } from '@/theme/tokens';

/**
 * Feed layout B — **Magazine** (design lines 582-604).
 *
 * Editorial rhythm: every third event is a 200px cover with a date eyebrow and
 * a white scrim under its headline; the rest are 64px thumbnail rows separated
 * by hairlines.
 */
export default function MagazineFeed({
  events,
  today,
  timeFormat,
  timeZone,
  onOpen,
  scrollProps,
}: FeedLayoutProps) {
  return (
    <ScrollView
      {...scrollProps}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      testID="feed-magazine"
    >
      {events.map((event, idx) =>
        idx % 3 === 0 ? (
          <AppPressable
            key={event.id}
            variant="button"
            accessibilityRole="button"
            accessibilityLabel={event.title}
            testID={`feed-card-${event.id}`}
            onPress={() => onOpen(event.id)}
          >
            <EventThumb
              id={event.id}
              imagePath={event.imagePath}
              iconSize={80}
              iconOpacity={0.12}
              iconStrokeWidth={0.6}
              iconPosition="bottom-right"
              radius={20}
              style={styles.large}
            >
              <Text style={styles.eyebrow} numberOfLines={1}>
                {feedDateLabel(event.start, today).toUpperCase()}
              </Text>
              <View style={styles.largeOverlay}>
                <VerticalScrim color="#FFFFFF" toOpacity={0.7} />
                <Text style={styles.largeTitle} numberOfLines={2}>
                  {event.title}
                </Text>
                <Text style={styles.largeSub}>{feedTimeLabel(event, timeFormat, timeZone)}</Text>
              </View>
            </EventThumb>
          </AppPressable>
        ) : (
          <AppPressable
            key={event.id}
            variant="row"
            accessibilityRole="button"
            accessibilityLabel={event.title}
            testID={`feed-card-${event.id}`}
            onPress={() => onOpen(event.id)}
            style={styles.row}
          >
            <EventThumb
              id={event.id}
              imagePath={event.imagePath}
              iconSize={24}
              radius={14}
              style={styles.rowThumb}
            />
            <View style={styles.rowText}>
              <Text style={styles.rowTitle} numberOfLines={2}>
                {event.title}
              </Text>
              <Text style={styles.rowSub} numberOfLines={1}>
                {feedLongLine(event, today, timeFormat, timeZone)}
              </Text>
            </View>
          </AppPressable>
        ),
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },

  large: {
    height: 200,
    marginBottom: 4,
  },
  eyebrow: {
    position: 'absolute',
    top: 14,
    left: 16,
    fontSize: 11,
    fontFamily: fonts.bold,
    color: 'rgba(0,0,0,0.35)',
    letterSpacing: 0.5,
  },
  largeOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 50,
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  largeTitle: {
    fontSize: 22,
    fontFamily: fonts.extrabold,
    color: colors.ink,
    letterSpacing: -0.8,
    lineHeight: 24,
  },
  largeSub: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: 'rgba(0,0,0,0.45)',
    marginTop: 4,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    // design line 597 — a hairline used only in this layout.
    borderBottomColor: '#F3F3F1',
  },
  rowThumb: {
    width: 64,
    height: 64,
    flexShrink: 0,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  rowSub: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.muted,
    marginTop: 3,
  },
});
