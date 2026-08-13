import { useEffect, useMemo } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import AppPressable from '@/components/AppPressable';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, shadows, springs } from '@/theme/tokens';
import type { Colors } from '@/theme/tokens';

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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(value ? 1 : 0, springs.toggle);
  }, [value, progress]);

  const trackStyle = useAnimatedStyle(
    () => ({
      // The track colour cross-fades linearly (design: `background 0.28s ease`)
      // while the knob springs, so the overshoot doesn't tint the track.
      backgroundColor: interpolateColor(progress.value, [0, 1], [colors.toggleOff, colors.ink]),
    }),
    [colors],
  );

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

const createStyles = (colors: Colors) =>
  StyleSheet.create({
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
