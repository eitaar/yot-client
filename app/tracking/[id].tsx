import { differenceInCalendarDays, startOfDay } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppPressable from '@/components/AppPressable';
import { BackChevronIcon } from '@/components/icons';
import {
  describe,
  franchiseFor,
  isRange,
  itemById,
  useTracking,
} from '@/store/tracking';
import { colors, fonts, type } from '@/theme/tokens';

/**
 * Tracking detail (design lines 933-979).
 *
 * Franchise eyebrow, big title, one countdown line, and — for an active
 * multi-day range — a 4px progress bar with "Nd ago" / "Nd left" beneath it.
 * Then the description and a Type / Duration metadata block.
 */
export default function TrackingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const now = useMemo(() => new Date(), []);

  const item = useTracking((s) => (id ? itemById(s, id) : undefined));
  const color = useTracking((s) => (item ? franchiseFor(s, item.franchise)?.color : undefined));

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/feed');
  }, []);

  const BackLink = (
    <AppPressable
      variant="none"
      accessibilityRole="button"
      accessibilityLabel="Back"
      testID="tracking-back"
      onPress={back}
      style={styles.backLink}
    >
      <BackChevronIcon />
      <Text style={styles.backLabel}>Back</Text>
    </AppPressable>
  );

  if (!item) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]} testID="tracking-detail-missing">
        <View style={styles.header}>{BackLink}</View>
        <View style={styles.missing}>
          <Text style={styles.missingTitle}>Not found</Text>
        </View>
      </View>
    );
  }

  const derived = describe(item, now);
  const ranged = isRange(item);
  const showBar = ranged && derived.isActive;

  // Design line 945, branch order preserved. "N days left" outranks "Today",
  // so an item that both starts and ends today reads "0 days left"; the
  // "Today" branch is for one that starts today without having begun.
  const countdown = (() => {
    if (derived.isActive && derived.daysLeft !== null) return `${derived.daysLeft} days left`;
    if (derived.daysUntil === null) return 'TBA';
    if (derived.daysUntil === 0) return 'Today';
    return `In ${derived.daysUntil} days`;
  })();

  const spanDays =
    item.start && item.end ? differenceInCalendarDays(item.end, item.start) : 0;
  const elapsedDays = item.start
    ? differenceInCalendarDays(startOfDay(now), item.start)
    : 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="tracking-detail">
      <View style={styles.header}>
        {BackLink}
        <Text style={styles.franchise} testID="tracking-franchise">
          {item.franchise}
        </Text>
        <Text style={styles.title} testID="tracking-title">
          {item.title}
        </Text>
        <Text style={styles.countdown} testID="tracking-countdown">
          {countdown}
        </Text>
      </View>

      {showBar ? (
        <View style={styles.progressWrap} testID="tracking-progress">
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.round(derived.progress * 100)}%`,
                  backgroundColor: color ?? colors.ink,
                },
              ]}
            />
          </View>
          {derived.daysLeft !== null ? (
            <View style={styles.progressCaption}>
              <Text style={styles.ago}>{`${elapsedDays}d ago`}</Text>
              <Text style={styles.left}>{`${derived.daysLeft}d left`}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <Text style={styles.desc}>{item.desc}</Text>

        <View style={styles.meta}>
          <View style={[styles.metaRow, styles.metaHairline]}>
            <Text style={styles.metaLabel}>Type</Text>
            <Text style={[styles.metaValue, styles.metaValueCapitalized]}>{item.type}</Text>
          </View>
          {ranged ? (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Duration</Text>
              <Text style={styles.metaValue}>{`${spanDays} days`}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  header: {
    paddingTop: 14,
    paddingHorizontal: 24,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 24,
  },
  backLabel: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.muted,
  },
  franchise: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.faintWarm,
    marginBottom: 4,
  },
  title: {
    ...type.detailTitle,
    color: colors.ink,
    marginBottom: 8,
  },
  countdown: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.muted,
    marginBottom: 20,
  },

  progressWrap: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.hairlineStrong,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressCaption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  ago: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.chevron,
  },
  left: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: colors.muted,
  },

  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  desc: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: colors.body,
    // design: `line-height: 1.7`
    lineHeight: 25.5,
    marginBottom: 24,
  },
  meta: {
    borderTopWidth: 1,
    borderTopColor: colors.hairlineStrong,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  metaHairline: {
    borderBottomWidth: 1,
    borderBottomColor: colors.hairlineFaint,
  },
  metaLabel: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.muted,
  },
  metaValue: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.ink,
  },
  metaValueCapitalized: {
    textTransform: 'capitalize',
  },

  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missingTitle: {
    ...type.screenTitle,
    color: colors.ink,
  },
});
