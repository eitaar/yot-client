import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';
import { easing, fonts, layout } from '@/theme/tokens';
import type { Colors } from '@/theme/tokens';

/**
 * The design's bottom bar (lines 992–1005) — a plain row of icon + label, not
 * the platform tab bar. What makes it feel alive is the one-shot animation each
 * icon plays as it becomes active, from the `tabCalendar` / `tabEvents` /
 * `tabFeed` keyframes (design lines 21–25).
 */

/** Total run time of every activation animation — `0.45s` in the design. */
const ANIM_MS = 450;
const CURVE = Easing.bezier(...easing.standard);

/** CSS applies the timing function per keyframe segment, so each leg gets it. */
function leg(to: number, fraction: number) {
  return withTiming(to, { duration: ANIM_MS * fraction, easing: CURVE });
}

export type TabAnimation = 'calendar' | 'events' | 'feed';

export interface TabBarItem {
  /** Route name, used as the React key and reported back on press. */
  key: string;
  label: string;
  /** SVG path data, 22×22 viewBox. */
  paths: readonly string[];
  animation: TabAnimation;
}

export interface TabBarProps {
  items: readonly TabBarItem[];
  /** Key of the active item. */
  activeKey: string;
  onSelect: (key: string) => void;
}

/* ------------------------------------------------------------------ button */

function TabButton({
  item,
  active,
  onPress,
}: {
  item: TabBarItem;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // `rotate` is in degrees; `scaleX` and `scale` are unitless multipliers.
  const rotate = useSharedValue(0);
  const scaleX = useSharedValue(1);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (!active) return;

    if (item.animation === 'calendar') {
      // 0 → -8° → 8° → -3° → 0, four equal legs.
      rotate.value = withSequence(leg(-8, 0.25), leg(8, 0.25), leg(-3, 0.25), leg(0, 0.25));
    } else if (item.animation === 'events') {
      // 1 → 0.6 (30%) → 1.1 (60%) → 1 (100%).
      scaleX.value = withSequence(leg(0.6, 0.3), leg(1.1, 0.3), leg(1, 0.4));
    } else {
      // 0° / 1 → 90° / 0.85 (40%) → 0° / 1 (100%).
      rotate.value = withSequence(leg(90, 0.4), leg(0, 0.6));
      scale.value = withSequence(leg(0.85, 0.4), leg(1, 0.6));
    }
  }, [active, item.animation, rotate, scale, scaleX]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value}deg` }, { scaleX: scaleX.value }, { scale: scale.value }],
  }));

  const stroke = active ? colors.ink : colors.faint;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={item.label}
      testID={`tab-${item.key}`}
      onPress={onPress}
      style={styles.button}
    >
      <Animated.View style={iconStyle}>
        <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
          {item.paths.map((d, i) => (
            <Path
              key={i}
              d={d}
              stroke={stroke}
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
        </Svg>
      </Animated.View>
      <Text style={[styles.label, active ? styles.labelActive : styles.labelIdle]}>
        {item.label}
      </Text>
    </Pressable>
  );
}

/* --------------------------------------------------------------------- bar */

export default function TabBar({ items, activeKey, onSelect }: TabBarProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View accessibilityRole="tablist" style={styles.bar} testID="tab-bar">
      {items.map((item) => (
        <TabButton
          key={item.key}
          item={item}
          active={item.key === activeKey}
          onPress={() => onSelect(item.key)}
        />
      ))}
    </View>
  );
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      paddingTop: 10,
      paddingBottom: 30,
      borderTopWidth: layout.hairlineWidth,
      borderTopColor: colors.hairlineStrong,
      backgroundColor: colors.canvas,
      flexShrink: 0,
    },
    button: {
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      minWidth: 64,
    },
    label: {
      fontSize: 10,
      letterSpacing: 0.2,
    },
    labelActive: {
      fontFamily: fonts.bold,
      color: colors.ink,
    },
    labelIdle: {
      fontFamily: fonts.medium,
      color: colors.faint,
    },
  });
