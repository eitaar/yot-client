import { forwardRef } from 'react';
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { durations, press, springs } from '@/theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Press feedback variants, mirroring the prototype's `style-active` rules:
 * - `row`    — `transform:translateX(3px); opacity:0.7`
 * - `button` — `transform:scale(0.96)`
 * - `label`  — `transform:scale(0.94)` (segmented labels, toggles)
 * - `none`   — no feedback, but keeps the same API
 */
export type PressVariant = 'row' | 'button' | 'label' | 'none';

export interface AppPressableProps extends Omit<PressableProps, 'style'> {
  variant?: PressVariant;
  style?: StyleProp<ViewStyle>;
}

/**
 * A `Pressable` that animates on press using Reanimated, so the feedback runs
 * on the UI thread and survives a busy JS thread.
 */
const AppPressable = forwardRef<View, AppPressableProps>(function AppPressable(
  { variant = 'button', style, onPressIn, onPressOut, disabled, ...rest },
  ref,
) {
  const active = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    if (variant === 'none') return {};

    if (variant === 'row') {
      return {
        transform: [{ translateX: active.value * press.rowTranslateX }],
        opacity: 1 - active.value * (1 - press.rowOpacity),
      };
    }

    const target = variant === 'label' ? press.labelScale : press.buttonScale;
    return {
      transform: [{ scale: 1 - active.value * (1 - target) }],
    };
  }, [variant]);

  return (
    <AnimatedPressable
      ref={ref}
      disabled={disabled}
      onPressIn={(e) => {
        // Rows track the finger with a quick linear fade; buttons spring.
        active.value =
          variant === 'row'
            ? withTiming(1, { duration: durations.fast })
            : withSpring(1, springs.press);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        active.value =
          variant === 'row'
            ? withTiming(0, { duration: durations.base })
            : withSpring(0, springs.press);
        onPressOut?.(e);
      }}
      style={[style, animatedStyle]}
      {...rest}
    />
  );
});

export default AppPressable;
