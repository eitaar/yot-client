import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { colors, type } from '@/theme/tokens';

export interface SectionLabelProps {
  children: string;
  style?: StyleProp<TextStyle>;
}

/**
 * 11px / 700 / uppercase / letterSpacing 1 / `#C0C0C0` — the group heading used
 * above each block of settings rows.
 */
export default function SectionLabel({ children, style }: SectionLabelProps) {
  return (
    <Text accessibilityRole="header" style={[styles.label, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    ...type.sectionLabel,
    color: colors.faint,
  },
});
