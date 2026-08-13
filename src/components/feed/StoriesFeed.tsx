import { ScrollView, StyleSheet, Text, View } from 'react-native';

import AppPressable from '@/components/AppPressable';
import EventThumb from '@/components/EventThumb';
import { feedLongLine, type FeedLayoutProps } from '@/components/feed/shared';
import { colors, fonts } from '@/theme/tokens';

/**
 * Feed layout D — **Stories** (design lines 625-652).
 *
 * A row of ringed circles for the first eight events, then large stacked
 * cards — the first taller than the rest.
 *
 * Deviation: the prototype's `isPast = ev.date < today` could never be true,
 * because the list it drew from was already filtered to today-or-later, so the
 * grey ring never appeared. With a real clock the useful reading is "already
 * started", which is what decides the ring here.
 */
export default function StoriesFeed({
  events,
  today,
  timeFormat,
  timeZone,
  onOpen,
  scrollProps,
}: FeedLayoutProps) {
  const now = new Date();
  const circles = events.slice(0, 8);

  return (
    <ScrollView {...scrollProps} style={styles.scroll} testID="feed-stories">
      <View style={styles.strip}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stripContent}
        >
          {circles.map((event) => {
            const started = event.start.getTime() < now.getTime();
            return (
              <AppPressable
                key={event.id}
                variant="button"
                accessibilityRole="button"
                accessibilityLabel={event.title}
                testID={`feed-circle-${event.id}`}
                onPress={() => onOpen(event.id)}
                style={styles.circleSlot}
              >
                <EventThumb
                  id={event.id}
                  imagePath={event.imagePath}
                  iconSize={20}
                  iconOpacity={0.5}
                  radius={26}
                  style={[styles.circle, started ? styles.circlePast : styles.circleUpcoming]}
                />
                <Text style={styles.circleLabel} numberOfLines={1}>
                  {event.title.split(' ')[0]}
                </Text>
              </AppPressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.cards}>
        {events.map((event, idx) => (
          <AppPressable
            key={event.id}
            variant="button"
            accessibilityRole="button"
            accessibilityLabel={event.title}
            testID={`feed-card-${event.id}`}
            onPress={() => onOpen(event.id)}
            style={styles.card}
          >
            <EventThumb
              id={event.id}
              imagePath={event.imagePath}
              iconSize={32}
              iconOpacity={0.3}
              radius={18}
              style={[styles.cardThumb, { height: idx === 0 ? 180 : 140 }]}
            >
              <View style={styles.caption}>
                <Text
                  style={[styles.cardTitle, idx === 0 && styles.cardTitleFirst]}
                  numberOfLines={2}
                >
                  {event.title}
                </Text>
                <Text style={styles.cardSub} numberOfLines={1}>
                  {feedLongLine(event, today, timeFormat, timeZone)}
                </Text>
              </View>
            </EventThumb>
          </AppPressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },

  strip: {
    borderBottomWidth: 1,
    borderBottomColor: colors.hairlineStrong,
  },
  stripContent: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  circleSlot: {
    width: 62,
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  circle: {
    width: 52,
    height: 52,
    borderWidth: 2,
  },
  circleUpcoming: {
    borderColor: colors.ink,
  },
  circlePast: {
    borderColor: '#E8E8E6',
  },
  circleLabel: {
    fontSize: 10,
    fontFamily: fonts.semibold,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 12,
    width: '100%',
  },

  cards: {
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  card: {
    marginBottom: 14,
  },
  cardThumb: {
    width: '100%',
  },
  caption: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 14,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  cardTitleFirst: {
    fontSize: 18,
  },
  cardSub: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: 'rgba(0,0,0,0.4)',
    marginTop: 2,
  },
});
