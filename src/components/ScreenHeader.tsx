import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import AppPressable from '@/components/AppPressable';
import { GearIcon } from '@/components/icons';
import { useTheme } from '@/theme/ThemeProvider';
import { type } from '@/theme/tokens';
import type { Colors } from '@/theme/tokens';

export interface ScreenHeaderProps {
  /** 26/800 screen title ("Upcoming", "Feed", "Tracking"). */
  title: string;
  /** Hide the gear on screens that are not top-level tabs. */
  showGear?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The tab-screen header: a 26/800 title and the settings gear
 * (design lines 45-48 and 982-985; the gear itself is line 125).
 *
 * The gear is a 34px circle that fills with `#F5F5F3` on hover — kept for the
 * web build, where a pointer exists; on touch it simply never triggers.
 */
export default function ScreenHeader({
  title,
  showGear = true,
  style,
  testID,
}: ScreenHeaderProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [hovered, setHovered] = useState(false);

  return (
    <View style={[styles.header, style]} testID={testID}>
      <Text style={styles.title} testID={testID ? `${testID}-title` : undefined}>
        {title}
      </Text>
      {showGear ? (
        <AppPressable
          variant="button"
          accessibilityRole="button"
          accessibilityLabel="Settings"
          testID="settings-gear"
          onPress={() => router.push('/settings')}
          onHoverIn={() => setHovered(true)}
          onHoverOut={() => setHovered(false)}
          style={[styles.gear, hovered && styles.gearHovered]}
        >
          <GearIcon />
        </AppPressable>
      ) : null}
    </View>
  );
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    header: {
      // design: `padding: 16px 24px 6px`
      paddingTop: 16,
      paddingHorizontal: 24,
      paddingBottom: 6,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    title: {
      ...type.screenTitle,
      color: colors.ink,
    },
    gear: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    gearHovered: {
      backgroundColor: colors.hairline,
    },
  });
