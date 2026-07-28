import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import AppPressable from '@/components/AppPressable';
import { colors, durations, radii, shadows, springs } from '@/theme/tokens';

/** 46x27 track, 23px knob, 2px inset — so the knob travels 46-23-4 = 19px. */
const TRACK_WIDTH = 46;
const TRACK_HEIGHT = 27;
const KNOB_SIZE = 23;
const TRACK_INSET = 2;
const TRAVEL = TRACK_WIDTH - KNOB_SIZE - TRACK_INSET * 2; // 19

export interface ToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * The settings toggle: black when on, `#E4E3DF` when off, with the knob
 * springing across on the design's bouncy curve.
 */
export default function Toggle({
  value,
  onValueChange,
  disabled,
  style,
  accessibilityLabel,
}: ToggleProps) {
  const progress = useDerivedValue(
    () => withSpring(value ? 1 : 0, springs.toggle),
    [value],
  );

  const trackStyle = useAnimatedStyle(() => ({
    // The track colour cross-fades linearly (design: `background 0.28s ease`)
    // while the knob springs, so the overshoot doesn't tint the track.
    backgroundColor: interpolateColor(
      withTiming(value ? 1 : 0, { duration: durations.spring }),
      [0, 1],
      [colors.toggleOff, colors.ink],
    ),
  }), [value]);

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * TRAVEL }],
  }));

  return (
    <AppPressable
      variant="label"
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel}
      style={[styles.pressable, disabled && styles.disabled, style]}
    >
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.View style={[styles.knob, knobStyle]} />
      </Animated.View>
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    alignSelf: 'flex-start',
  },
  disabled: {
    opacity: 0.5,
  },
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: radii.toggle,
    padding: TRACK_INSET,
    justifyContent: 'center',
  },
  knob: {
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_SIZE / 2,
    backgroundColor: colors.canvas,
    ...shadows.knob,
  },
});
