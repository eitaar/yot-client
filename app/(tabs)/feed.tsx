import { startOfDay } from 'date-fns';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PullToSync from '@/components/PullToSync';
import ScreenHeader from '@/components/ScreenHeader';
import SegmentedControl from '@/components/SegmentedControl';
import AskView from '@/components/feed/AskView';
import DynamicFeed from '@/components/feed/DynamicFeed';
import MagazineFeed from '@/components/feed/MagazineFeed';
import MosaicFeed from '@/components/feed/MosaicFeed';
import StoriesFeed from '@/components/feed/StoriesFeed';
import TrackingView from '@/components/feed/TrackingView';
import type { FeedLayoutProps } from '@/components/feed/shared';
import { upcoming, useEvents } from '@/store/events';
import {
  useEffectiveTimeZone,
  useFeedLayout,
  useTimeFormat,
  type FeedLayout,
} from '@/store/settings';
import { useTracking } from '@/store/tracking';
import { colors } from '@/theme/tokens';

/**
 * The Feed tab (design lines 981-988) — one header and a three-way segmented
 * control over three quite different panes:
 *
 *  - **Feed**    — four layouts, chosen by the Settings "Feed layout" row;
 *  - **Ask**     — the canned assistant;
 *  - **Tracking**— the local demo tracker.
 *
 * The title follows the mode, exactly as the prototype's did: "Tracking" in
 * tracking mode, "Feed" otherwise.
 */

const MODES = ['feed', 'ask', 'tracking'] as const;
type Mode = (typeof MODES)[number];

const MODE_LABELS: Record<Mode, string> = {
  feed: 'Feed',
  ask: 'Ask',
  tracking: 'Tracking',
};

const LAYOUTS: Record<FeedLayout, (props: FeedLayoutProps) => React.ReactElement> = {
  dynamic: DynamicFeed,
  magazine: MagazineFeed,
  mosaic: MosaicFeed,
  stories: StoriesFeed,
};

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const timeFormat = useTimeFormat();
  const timeZone = useEffectiveTimeZone();
  const feedLayout = useFeedLayout();

  const [mode, setMode] = useState<Mode>('feed');

  // Same day-rollover guard as the Events tab: "Today" must stop meaning
  // yesterday if the app is left open past midnight.
  const [today, setToday] = useState(() => startOfDay(new Date()));
  useEffect(() => {
    const tick = setInterval(() => {
      const now = startOfDay(new Date());
      setToday((prev) => (prev.getTime() === now.getTime() ? prev : now));
    }, 60_000);
    return () => clearInterval(tick);
  }, []);

  const events = useEvents((s) => upcoming(s, today));

  // The tracking dataset is seeded lazily; the pane is one tap away, so the
  // seed happens on mount rather than when the tab is switched.
  const ensureSeeded = useTracking((s) => s.ensureSeeded);
  useEffect(() => {
    void ensureSeeded();
  }, [ensureSeeded]);

  const Layout = LAYOUTS[feedLayout] ?? DynamicFeed;
  const layoutProps: FeedLayoutProps = useMemo(
    () => ({
      events,
      today,
      timeFormat,
      timeZone,
      onOpen: (id: string) => router.push(`/event/${id}`),
    }),
    [events, today, timeFormat, timeZone],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="feed-screen">
      <ScreenHeader title={mode === 'tracking' ? 'Tracking' : 'Feed'} testID="feed-header" />

      <SegmentedControl
        options={MODES}
        value={mode}
        onChange={setMode}
        labelFor={(m) => MODE_LABELS[m]}
        accessibilityLabel="Feed mode"
        style={styles.modes}
      />

      {/*
        Feed and Tracking pull to sync; Ask does not. Ask is a conversation
        pinned to the bottom of its pane — a pull there would fight the
        keyboard and refresh nothing the user is looking at.
      */}
      {mode === 'feed' ? (
        <PullToSync testID="feed-pull">
          {(scrollProps) => <Layout {...layoutProps} scrollProps={scrollProps} />}
        </PullToSync>
      ) : null}
      {mode === 'ask' ? (
        <AskView
          events={events}
          timeFormat={timeFormat}
          timeZone={timeZone}
          onOpenEvent={(id) => router.push(`/event/${id}`)}
        />
      ) : null}
      {mode === 'tracking' ? (
        <PullToSync testID="tracking-pull">
          {(scrollProps) => (
            <TrackingView
              onOpenItem={(id) => router.push(`/tracking/${id}`)}
              scrollProps={scrollProps}
            />
          )}
        </PullToSync>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
    minHeight: 0,
  },
  modes: {
    // design line 750: `margin: 0 20px 10px`
    marginHorizontal: 20,
    marginBottom: 10,
    alignSelf: 'stretch',
  },
});
