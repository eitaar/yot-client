import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import AppPressable from '@/components/AppPressable';
import type { PullScrollProps } from '@/components/PullToSync';
import { ChevronRightIcon } from '@/components/icons';
import { describeWithSpec, groupItemsBySpec } from '@/plugins/derive';
import { buildDefaultSpec } from '@/plugins/defaultSpec';
import { loadTrackingSpec } from '@/plugins/loader';
import { renderTree, type RenderContext } from '@/plugins/renderer';
import type { TrackingPluginSpec } from '@/plugins/schema';
import {
  activeFranchises,
  filteredItems,
  franchiseFor,
  useTracking,
  type TrackingItem,
} from '@/store/tracking';
import { colors, fonts } from '@/theme/tokens';

/**
 * The Tracking pane (design lines 818-931).
 *
 * Filter pills across the top ("All" plus one per franchise that actually has
 * items), then grouped rows. Grouping and per-row derivation come from the
 * active plugin spec (`derive` hooks); the row body is rendered from the spec's
 * `listRow` element tree. The pill bar and group headers stay host-owned.
 */
export interface TrackingViewProps {
  onOpenItem: (id: string) => void;
  /** Spread onto the vertical list so a wrapping `PullToSync` can drive it. */
  scrollProps?: PullScrollProps;
}

export default function TrackingView({ onOpenItem, scrollProps }: TrackingViewProps) {
  const [franchise, setFranchise] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);

  // Default spec renders immediately; a server spec (OTA) replaces it when available.
  const [spec, setSpec] = useState<TrackingPluginSpec>(() => buildDefaultSpec(now));
  useEffect(() => {
    let alive = true;
    loadTrackingSpec(now).then((s) => {
      if (alive) setSpec(s);
    });
    return () => {
      alive = false;
    };
  }, [now]);

  const state = useTracking();
  const pills = useMemo(() => activeFranchises(state), [state]);
  const items = useMemo(() => filteredItems(state, franchise, now), [state, franchise, now]);
  const groups = useMemo(() => groupItemsBySpec(items, now, spec.derive), [items, now, spec]);

  const rowContext = (item: TrackingItem): RenderContext => {
    const derived = describeWithSpec(item, now, spec.derive);
    return {
      item: {
        id: item.id,
        title: item.title,
        franchise: item.franchise,
        type: item.type,
        start: item.start?.getTime() ?? null,
        end: item.end?.getTime() ?? null,
        desc: item.desc,
      },
      derived: derived as unknown as Record<string, unknown>,
      color: franchiseFor(state, item.franchise)?.color ?? colors.ink,
    };
  };

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
              <AppPressable
                key={item.id}
                variant="row"
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${item.franchise}`}
                testID={`tracking-row-${item.id}`}
                onPress={() => onOpenItem(item.id)}
                style={styles.row}
              >
                {spec.listRow ? renderTree(spec.listRow, rowContext(item)) : null}
                <ChevronRightIcon />
              </AppPressable>
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
});
