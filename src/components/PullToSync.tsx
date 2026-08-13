import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import {
  CLOSE_MS,
  FADE_MS,
  MIN_SYNC_MS,
  OPEN_MS,
  SPIN_MS,
  SYNC_HEIGHT,
  WHEEL_SETTLE_MS,
  accumulateWheel,
  acceptsPull,
  resistedPull,
  shouldTriggerSync,
  spinnerOpacity,
  spinnerRotation,
  spinnerScale,
  type PullPhase,
} from '@/lib/pullToSync';
import { useEvents } from '@/store/events';
import { useTheme } from '@/theme/ThemeProvider';
import { easing } from '@/theme/tokens';
import type { Colors } from '@/theme/tokens';

/**
 * Pull-to-sync (design lines 1112-1142; behaviour settled in chat12).
 *
 * A drag from the top of a scrollable follows the finger at 0.55 resistance up
 * to 100px, rotating and growing a spinner as it goes. Release at >=70px and
 * the indicator locks to 46px, the spinner loops, and `events.sync()` runs;
 * whatever happens, the spinner is on screen for at least
 * {@link MIN_SYNC_MS} so the feedback is legible. The indicator then **stays
 * mounted** while its height eases back to 0 — unmounting it at 46px is what
 * used to make the content jump.
 *
 * There is deliberately no "Syncing…" label: spinner only.
 *
 * ## Two shapes
 *
 * ```tsx
 * <PullToSync contentContainerStyle={…}>{content}</PullToSync>          // owns a ScrollView
 * <PullToSync>{(scrollProps) => <Feed scrollProps={scrollProps} />}</PullToSync>
 * ```
 *
 * The render-prop form exists because the feed layouts each bring their own
 * `ScrollView`; they spread {@link PullScrollProps} onto it so this component
 * can still see the offset and coordinate with the native scroll gesture.
 */

const STANDARD = Easing.bezier(...easing.standard);
/** `spin 0.6s cubic-bezier(0.5,0.15,0.5,0.85) infinite` — design line 1140. */
const SPIN_EASE = Easing.bezier(0.5, 0.15, 0.5, 0.85);

/** Props a caller-supplied scrollable must spread onto its `ScrollView`. */
export interface PullScrollProps {
  ref: React.Ref<ScrollView>;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle: number;
}

export interface PullToSyncProps {
  children: ReactNode | ((scrollProps: PullScrollProps) => ReactNode);
  /** Defaults to a full `events.sync()`. */
  onSync?: () => Promise<unknown>;
  /** Applied to the outer container. */
  style?: StyleProp<ViewStyle>;
  /** Owned-`ScrollView` form only. */
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollViewStyle?: StyleProp<ViewStyle>;
  /** Disable the whole interaction (e.g. an empty, unsyncable surface). */
  enabled?: boolean;
  testID?: string;
  /** `testID` for the owned `ScrollView`. */
  scrollTestID?: string;
}

export default function PullToSync({
  children,
  onSync,
  style,
  contentContainerStyle,
  scrollViewStyle,
  enabled = true,
  testID,
  scrollTestID,
}: PullToSyncProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scrollRef = useAnimatedRef<ScrollView>();
  const containerRef = useRef<View | null>(null);

  /**
   * Whether the scrollable is at (or above) the top. The pan gesture is only
   * enabled then: mid-list it must never compete with the ScrollView for the
   * scroll-up drag. Without this gate the pan — which activates on any
   * 10px+ downward drag, i.e. exactly the scroll-up gesture — steals the
   * gesture and the list cannot scroll up.
   */
  const [atTop, setAtTop] = useState(true);

  /** Live pull distance in px — the indicator height while dragging. */
  const pull = useSharedValue(0);
  /** Rendered indicator height; animated separately so it can ease home. */
  const height = useSharedValue(0);
  const opacity = useSharedValue(0);
  /** Continuous rotation while syncing, in degrees. */
  const spin = useSharedValue(0);
  const phase = useSharedValue<PullPhase>('idle');
  /** Content offset of the scrollable — the "am I at the top?" test. */
  const scrollY = useSharedValue(0);
  /**
   * `translationY` at the moment the pull became legal. Without this, dragging
   * down from deep inside the list would snap the indicator to the whole
   * accumulated translation the instant the top came into view.
   */
  const dragBase = useSharedValue(0);

  /** Re-entrancy guard for the JS side of a sync. */
  const busy = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ------------------------------------------------------------- closing */

  const finish = useCallback(() => {
    busy.current = false;
  }, []);

  const close = useCallback(() => {
    phase.value = 'closing';
    opacity.value = withTiming(0, { duration: FADE_MS });
    height.value = withTiming(0, { duration: CLOSE_MS, easing: STANDARD }, (done) => {
      'worklet';
      if (!done) return;
      cancelAnimation(spin);
      spin.value = 0;
      phase.value = 'idle';
      pull.value = 0;
      runOnJS(finish)();
    });
  }, [finish, height, opacity, phase, pull, spin]);

  /* ------------------------------------------------------------ triggering */

  const trigger = useCallback(() => {
    if (busy.current) return;
    busy.current = true;

    phase.value = 'syncing';
    pull.value = 0;
    height.value = withTiming(SYNC_HEIGHT, { duration: OPEN_MS, easing: STANDARD });
    opacity.value = withTiming(1, { duration: FADE_MS });
    spin.value = 0;
    spin.value = withRepeat(withTiming(360, { duration: SPIN_MS, easing: SPIN_EASE }), -1, false);

    const startedAt = Date.now();
    const run = onSync ? onSync() : useEvents.getState().sync();

    void Promise.resolve(run)
      // A failed sync still closes: the store surfaces the error, and leaving
      // the spinner up forever is worse than a silent no-op.
      .catch(() => undefined)
      .then(() => {
        const remaining = MIN_SYNC_MS - (Date.now() - startedAt);
        if (remaining <= 0) {
          close();
          return;
        }
        setTimeout(close, remaining);
      });
  }, [close, height, onSync, opacity, phase, pull, spin]);

  /* --------------------------------------------------------------- gesture */

  const springBack = useCallback(() => {
    'worklet';
    phase.value = 'idle';
    pull.value = 0;
    height.value = withTiming(0, { duration: CLOSE_MS, easing: STANDARD });
    opacity.value = withTiming(0, { duration: FADE_MS });
  }, [height, opacity, phase, pull]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Mid-list the pan is disabled outright, so the ScrollView always
        // wins the scroll-up drag. Only at the top — where a downward drag
        // means "pull" rather than "scroll up" — does the pan claim it.
        .activeOffsetY(10)
        .enabled(enabled && atTop)
        .onBegin(() => {
          dragBase.value = 0;
        })
        .onUpdate((e) => {
          if (!acceptsPull(phase.value)) return;

          if (scrollY.value > 0) {
            // Not at the top: remember where we are, so if the user keeps
            // dragging past the top the pull starts from zero rather than
            // from the whole accumulated translation.
            dragBase.value = e.translationY;
            if (pull.value > 0) springBack();
            return;
          }

          const dy = e.translationY - dragBase.value;
          if (dy <= 0) {
            if (pull.value > 0) springBack();
            return;
          }

          const next = resistedPull(dy);
          phase.value = 'dragging';
          pull.value = next;
          height.value = next;
          opacity.value = spinnerOpacity('dragging', next);
        })
        .onEnd(() => {
          if (phase.value !== 'dragging') return;
          if (shouldTriggerSync(pull.value)) runOnJS(trigger)();
          else springBack();
        })
        .onFinalize(() => {
          if (phase.value === 'dragging') springBack();
        })
        // NOTE: this resolves to a no-op — RNGH's convertToHandlerTag maps a
        // plain ScrollView ref to -1 (no handlerTag) and silently drops it.
        // The atTop gate above is what actually keeps the pan off the scroll;
        // this call is kept because it is harmless and documents intent.
        .simultaneousWithExternalGesture(
          scrollRef as unknown as React.RefObject<React.ComponentType<object>>,
        ),
    [atTop, dragBase, enabled, height, opacity, phase, pull, scrollRef, scrollY, springBack, trigger],
  );

  /* ------------------------------------------------------- web wheel path */

  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;

    // The listener sits on the container rather than the scroller so it keeps
    // working when the child swaps its own ScrollView (the four feed layouts).
    const node = containerRef.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== 'function') return;

    const settle = () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => {
        if (phase.value === 'dragging') springBack();
      }, WHEEL_SETTLE_MS);
    };

    const onWheel = (event: WheelEvent) => {
      if (!acceptsPull(phase.value)) return;

      if (event.deltaY > 0) {
        if (pull.value > 0) springBack();
        return;
      }
      if (event.deltaY >= 0 || scrollY.value > 0) return;

      const next = accumulateWheel(pull.value, event.deltaY);
      phase.value = 'dragging';
      pull.value = next;
      height.value = next;
      opacity.value = spinnerOpacity('dragging', next);

      // The wheel has no release, so it fires as soon as it crosses.
      if (shouldTriggerSync(next)) {
        if (settleTimer.current) clearTimeout(settleTimer.current);
        trigger();
      } else {
        settle();
      }
    };

    // Passive: nothing here calls preventDefault, and marking it so keeps
    // ordinary scrolling off the main thread.
    node.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      node.removeEventListener('wheel', onWheel);
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, [enabled, height, opacity, phase, pull, scrollY, springBack, trigger]);

  useEffect(
    () => () => {
      cancelAnimation(spin);
    },
    [spin],
  );

  /* ---------------------------------------------------------------- styles */

  const indicatorStyle = useAnimatedStyle(() => ({ height: height.value }));

  const spinnerStyle = useAnimatedStyle(() => {
    const spinning = phase.value === 'syncing' || phase.value === 'closing';
    return {
      opacity: opacity.value,
      transform: [
        { rotate: `${spinning ? spin.value : spinnerRotation(pull.value)}deg` },
        { scale: spinning ? 1 : spinnerScale(pull.value) },
      ],
    };
  });

  /* ---------------------------------------------------------------- render */

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      scrollY.value = y;
      // Gate the pan on the top-of-list test. Same-value setState bails out,
      // so this only re-renders when the list actually crosses the top edge.
      setAtTop((prev) => (prev === (y <= 0) ? prev : y <= 0));
    },
    [scrollY],
  );

  const scrollProps: PullScrollProps = { ref: scrollRef, onScroll, scrollEventThrottle: 16 };

  const body =
    typeof children === 'function' ? (
      children(scrollProps)
    ) : (
      <ScrollView
        {...scrollProps}
        testID={scrollTestID}
        style={[styles.scroll, scrollViewStyle]}
        contentContainerStyle={contentContainerStyle}
      >
        {children}
      </ScrollView>
    );

  return (
    <GestureDetector gesture={pan}>
      <View ref={containerRef} style={[styles.root, style]} testID={testID}>
        <Animated.View
          testID={testID ? `${testID}-indicator` : 'pull-indicator'}
          style={[styles.indicator, indicatorStyle]}
          pointerEvents="none"
        >
          <Animated.View testID="pull-spinner" style={[styles.spinner, spinnerStyle]} />
        </Animated.View>
        {body}
      </View>
    </GestureDetector>
  );
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    root: {
    flex: 1,
    minHeight: 0,
  },
  scroll: {
    flex: 1,
  },
  indicator: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  spinner: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    // design line 1140: `2px solid #E5E4E0` with a `#0F0F0F` top edge.
    borderColor: '#E5E4E0',
    borderTopColor: colors.ink,
  },
});
