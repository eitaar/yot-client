import { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme/context';
import { fonts, radii } from '@/theme/tokens';
import type { Colors } from '@/theme/tokens';

/**
 * The edit sheet's text input (design lines 1053-1073): an 11/700 uppercase
 * label over a 1.5px `#E8E8E6` field on `#FAFAF8`, radius 10, whose border
 * goes ink on focus.
 */
export interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  /** 4 rows in the design's description textarea. */
  multiline?: boolean;
  rows?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export default function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  rows = 4,
  style,
  testID,
}: TextFieldProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        multiline={multiline}
        // `rows` on RN's TextInput is Android-only, so the height is set from
        // the design's line height instead: 14px text * 1.6 * 4 rows.
        style={[
          styles.input,
          multiline && [styles.multiline, { minHeight: rows * 22 + 24 }],
          focused && styles.focused,
        ]}
        accessibilityLabel={label}
        testID={testID}
      />
    </View>
  );
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    field: {
      marginBottom: 16,
    },
    label: {
      fontSize: 11,
      fontFamily: fonts.bold,
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 6,
    },
    input: {
      width: '100%',
      paddingVertical: 12,
      paddingHorizontal: 14,
      fontSize: 15,
      fontFamily: fonts.regular,
      color: colors.ink,
      borderWidth: 1.5,
      borderColor: colors.fieldBorder,
      borderRadius: radii.field,
      backgroundColor: colors.fieldBg,
    },
    multiline: {
      fontSize: 14,
      lineHeight: 22,
      textAlignVertical: 'top',
    },
    focused: {
      borderColor: colors.ink,
    },
  });
