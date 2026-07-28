import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

import AppPressable from '@/components/AppPressable';
import { colors, radii, shadows, springs, type } from '@/theme/tokens';

/** Padding between the track edge and the thumb (design: `padding: 3`). */
const TRACK_PADDING = 3;

export interface SegmentedControlProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  /**
   * Fixed width per option. Omit to divide the available width evenly —
   * which is what the Feed's 3-way Feed/Ask/Tracking control does.
   */
  optionWidth?: number;
  /** Rendered label for an option; defaults to the option string itself. */
  labelFor?: (option: T) => string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * The bouncy segmented control from the design: a `#F5F5F3` pill with a white
 * sliding thumb. The prototype animates the thumb with
 * `cubic-bezier(.34,1.56,.5,1)`; here it is a Reanimated spring tuned to the
 * same overshoot, which tracks better when the value changes mid-animation.
 */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  optionWidth,
  labelFor,
  style,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  const [trackWidth, setTrackWidth] = useState(0);

  const index = Math.max(0, options.indexOf(value));

  // With a fixed optionWidth the thumb size is known up front; otherwise it is
  // derived from the measured track so the segments divide the row evenly.
  const measuredWidth =
    optionWidth ??
    (trackWidth > 0
      ? (trackWidth - TRACK_PADDING * 2) / options.length
      : 0);

  const onTrackLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setTrackWidth((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
  };

  const thumbStyle = useAnimatedStyle(() => {
    if (measuredWidth <= 0) {
      // Nothing measured yet — keep the thumb hidden rather than flashing it
      // at the wrong size on the first frame.
      return { width: 0, opacity: 0 };
    }
    return {
      width: measuredWidth,
      opacity: 1,
      transform: [
        { translateX: withSpring(index * measuredWidth, springs.bouncy) },
      ],
    };
  }, [measuredWidth, index]);

  return (
    <View
      style={[styles.track, style]}
      onLayout={optionWidth ? undefined : onTrackLayout}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={[styles.thumb, thumbStyle]} pointerEvents="none" />
      {options.map((option) => {
        const selected = option === value;
        return (
          <AppPressable
            key={option}
            variant="label"
            onPress={() => onChange(option)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[
              styles.option,
              optionWidth ? { width: optionWidth } : styles.optionFlex,
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: selected ? colors.ink : colors.muted },
              ]}
              numberOfLines={1}
            >
              {labelFor ? labelFor(option) : option}
            </Text>
          </AppPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.hairline,
    borderRadius: radii.track,
    padding: TRACK_PADDING,
    position: 'relative',
    alignSelf: 'flex-start',
  },
  thumb: {
    position: 'absolute',
    top: TRACK_PADDING,
    left: TRACK_PADDING,
    bottom: TRACK_PADDING,
    backgroundColor: colors.canvas,
    borderRadius: radii.thumb,
    ...shadows.thumb,
  },
  option: {
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionFlex: {
    flex: 1,
  },
  label: {
    ...type.segment,
    textAlign: 'center',
  },
});
