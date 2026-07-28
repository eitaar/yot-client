import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import AppPressable from '@/components/AppPressable';
import type { PullScrollProps } from '@/components/PullToSync';
import { ChevronRightIcon } from '@/components/icons';
import {
  activeFranchises,
  describe,
  franchiseFor,
  groupedItems,
  useTracking,
  type TrackingItem,
} from '@/store/tracking';
import { colors, fonts } from '@/theme/tokens';

/**
 * The Tracking pane (design lines 818-931).
 *
 * Filter pills across the top ("All" plus one per franchise that actually has
 * items), then Active / This Week / Later / TBA groups. Active multi-day
 * ranges carry an 80x3 progress bar tinted with the franchise colour.
 *
 * All derivation — grouping, countdowns, progress — comes from
 * `store/tracking`, which already ports the design's arithmetic against real
 * dates; this file is layout only.
 */
export interface TrackingViewProps {
  onOpenItem: (id: string) => void;
  /** Spread onto the vertical list so a wrapping `PullToSync` can drive it. */
  scrollProps?: PullScrollProps;
}

export default function TrackingView({ onOpenItem, scrollProps }: TrackingViewProps) {
  const [franchise, setFranchise] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);

  const state = useTracking();
  const pills = useMemo(() => activeFranchises(state), [state]);
  const groups = useMemo(
    () => groupedItems(state, franchise, now),
    [state, franchise, now],
  );

  return (
    <View style={styles.root} testID="feed-tracking">
      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <Pill
            label="All"
            selected={franchise === null}
            onPress={() => setFranchise(null)}
            testID="tracking-pill-All"
          />
          {pills.map((f) => (
            <Pill
              key={f.name}
              label={f.abbr}
              selected={franchise === f.name}
              // Tapping the selected pill clears it (design line 878).
              onPress={() => setFranchise((prev) => (prev === f.name ? null : f.name))}
              testID={`tracking-pill-${f.abbr}`}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView {...scrollProps} style={styles.scroll} contentContainerStyle={styles.content}>
        {groups.map((bucket) => (
          <View key={bucket.group} style={styles.group}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupLabel} testID={`tracking-group-${bucket.group}`}>
                {bucket.group}
              </Text>
            </View>

            {bucket.items.map((item) => (
              <Row
                key={item.id}
                item={item}
                color={franchiseFor(state, item.franchise)?.color ?? colors.ink}
                now={now}
                onPress={() => onOpenItem(item.id)}
              />
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------- pill */

function Pill({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <AppPressable
      variant="button"
      accessibilityRole="button"
      accessibilityState={{ selected }}
      testID={testID}
      onPress={onPress}
      style={[styles.pill, selected && styles.pillSelected]}
    >
      <Text style={[styles.pillLabel, selected && styles.pillLabelSelected]}>{label}</Text>
    </AppPressable>
  );
}

/* -------------------------------------------------------------------- row */

function Row({
  item,
  color,
  now,
  onPress,
}: {
  item: TrackingItem;
  color: string;
  now: Date;
  onPress: () => void;
}) {
  const derived = describe(item, now);

  return (
    <AppPressable
      variant="row"
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${item.franchise}`}
      testID={`tracking-row-${item.id}`}
      onPress={onPress}
      style={styles.row}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.rowFranchise} numberOfLines={1}>
          {item.franchise}
        </Text>

        {derived.showProgress ? (
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.round(derived.progress * 100)}%`, backgroundColor: color },
                ]}
              />
            </View>
            <Text style={styles.progressLabel}>{`${derived.daysLeft}d left`}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.rowTime}>{derived.timeLabel}</Text>
      <ChevronRightIcon />
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },

  filterBar: {
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairlineStrong,
    flexShrink: 0,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 24,
  },
  pill: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: colors.hairline,
    flexShrink: 0,
  },
  pillSelected: {
    backgroundColor: colors.ink,
  },
  pillLabel: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: colors.muted,
    letterSpacing: 0.2,
  },
  pillLabelSelected: {
    color: colors.canvas,
  },

  scroll: {
    flex: 1,
  },
  content: {
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
  groupLabel: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.ink,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  rowFranchise: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.muted,
    marginTop: 3,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  progressTrack: {
    width: 80,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.hairlineStrong,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 1.5,
  },
  progressLabel: {
    fontSize: 10,
    fontFamily: fonts.semibold,
    color: colors.faintWarm,
  },
  rowTime: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: colors.muted,
    flexShrink: 0,
  },
});
