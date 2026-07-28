import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import AppPressable from '@/components/AppPressable';
import EventThumb from '@/components/EventThumb';
import type { FeedLayoutProps } from '@/components/feed/shared';
import { fonts } from '@/theme/tokens';

/** Cell heights, cycled by index — design line 610. */
const HEIGHTS = [120, 90, 140, 100, 110, 130, 95, 145, 105, 85, 135, 115];
const COLUMNS = 3;
const GAP = 6;
const PAGE_PADDING = 16;

/**
 * Feed layout C — **Mosaic** (design lines 606-623).
 *
 * A tight three-column grid of tinted tiles with cycling heights; every 7th
 * tile spans two columns. Only the title shows, small and bottom-left.
 *
 * CSS Grid becomes `flexWrap` here: with `alignItems: 'flex-start'` the rows
 * behave the same way the design's `align-items: start` grid did — items keep
 * their own height and wrap onto the next line.
 */
export default function MosaicFeed({ events, onOpen, scrollProps }: FeedLayoutProps) {
  const [width, setWidth] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
  };

  const columnWidth = width > 0 ? (width - GAP * (COLUMNS - 1)) / COLUMNS : 0;

  return (
    <ScrollView
      {...scrollProps}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      testID="feed-mosaic"
    >
      <View style={styles.grid} onLayout={onLayout} testID="feed-mosaic-grid">
        {columnWidth > 0
          ? events.map((event, idx) => {
              const height = HEIGHTS[idx % HEIGHTS.length];
              const span = idx % 7 === 0;
              const cellWidth = span ? columnWidth * 2 + GAP : columnWidth;

              return (
                <AppPressable
                  key={event.id}
                  variant="button"
                  accessibilityRole="button"
                  accessibilityLabel={event.title}
                  testID={`feed-card-${event.id}`}
                  onPress={() => onOpen(event.id)}
                  style={{ width: cellWidth }}
                >
                  <EventThumb
                    id={event.id}
                    imagePath={event.imagePath}
                    iconSize={span ? 36 : 24}
                    iconOpacity={0.2}
                    iconPosition="bottom-left"
                    radius={10}
                    style={[styles.cell, { height }]}
                  >
                    <Text style={styles.title} numberOfLines={2}>
                      {event.title}
                    </Text>
                  </EventThumb>
                </AppPressable>
              );
            })
          : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingTop: 4,
    paddingHorizontal: PAGE_PADDING,
    paddingBottom: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: GAP,
  },
  cell: {
    width: '100%',
  },
  title: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    fontSize: 11,
    fontFamily: fonts.bold,
    color: 'rgba(0,0,0,0.6)',
    lineHeight: 13,
  },
});
