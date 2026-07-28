import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import AppPressable from '@/components/AppPressable';
import { ChevronRightIcon } from '@/components/icons';
import { colors, layout, type } from '@/theme/tokens';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Event colour — renders the 8px leading dot when set. */
  dotColor?: string;
  /** Rendered between the text block and the chevron (e.g. a value label). */
  accessory?: ReactNode;
  /** Defaults to true when `onPress` is set. */
  showChevron?: boolean;
  /** Omit the bottom hairline — used for the last row in a group. */
  last?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The shared event-row pattern (design lines 57-64): optional colour dot,
 * 15/600 title, 12 muted subtitle, optional accessory, chevron, and a
 * `#F5F5F3` hairline underneath. Presses use the `row` nudge.
 */
export default function ListRow({
  title,
  subtitle,
  dotColor,
  accessory,
  showChevron,
  last = false,
  onPress,
  style,
  testID,
}: ListRowProps) {
  const withChevron = showChevron ?? !!onPress;

  return (
    <AppPressable
      variant={onPress ? 'row' : 'none'}
      disabled={!onPress}
      onPress={onPress}
      testID={testID}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={[styles.row, !last && styles.hairline, style]}
    >
      {dotColor ? (
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
      ) : null}

      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {accessory}
      {withChevron ? <ChevronRightIcon /> : null}
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
  },
  hairline: {
    // The design specifies `1px solid`, not a device hairline.
    borderBottomWidth: layout.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...type.rowTitle,
    color: colors.ink,
  },
  subtitle: {
    ...type.rowSubtitle,
    color: colors.muted,
    marginTop: 3,
  },
});
