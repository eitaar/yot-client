import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import AppPressable from '@/components/AppPressable';
import type { TimeFormat } from '@/lib/dates';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radii } from '@/theme/tokens';
import type { Colors } from '@/theme/tokens';

/**
 * A date or time field for the edit sheet.
 *
 * The prototype (design lines 1092-1096) used three free-text inputs — "Day",
 * "Start", "End" — parsed by eye. The plan replaces them with real pickers:
 *
 *  - **native**: `@react-native-community/datetimepicker`, opened by tapping
 *    the field. iOS renders it inline underneath; Android pops its dialog.
 *  - **web**: that package renders `null` and warns, so the field falls back
 *    to the browser's own `<input type="date">` / `<input type="time">`,
 *    styled to match the design's inputs.
 *
 * Either way the visual shell is the design's: 11/700 uppercase label over a
 * 1.5px `#E8E8E6` border, radius 10, on `#FAFAF8`.
 */

export interface DateTimeFieldProps {
  label: string;
  mode: 'date' | 'time';
  value: Date;
  onChange: (next: Date) => void;
  /** Clock style for the displayed value on native. */
  timeFormat?: TimeFormat;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** `value` in the format the corresponding HTML input expects. */
function inputValue(value: Date, mode: 'date' | 'time'): string {
  return format(value, mode === 'date' ? 'yyyy-MM-dd' : 'HH:mm');
}

/** Merge only the part this field owns, leaving the rest of `base` intact. */
function merge(base: Date, picked: Date, mode: 'date' | 'time'): Date {
  const next = new Date(base);
  if (mode === 'date') {
    next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  } else {
    next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  }
  return next;
}

/** Parse what the DOM input hands back; `null` when the user cleared it. */
function parseInput(raw: string, base: Date, mode: 'date' | 'time'): Date | null {
  if (mode === 'date') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!m) return null;
    const next = new Date(base);
    next.setFullYear(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return next;
  }
  const m = /^(\d{2}):(\d{2})/.exec(raw);
  if (!m) return null;
  const next = new Date(base);
  next.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return next;
}

export default function DateTimeField({
  label,
  mode,
  value,
  onChange,
  timeFormat = '12h',
  style,
  testID,
}: DateTimeFieldProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);

  const display =
    mode === 'date'
      ? format(value, 'MMM d, yyyy')
      : format(value, timeFormat === '24h' ? 'HH:mm' : 'h:mm a');

  const handlePicked = (event: DateTimePickerEvent, picked?: Date) => {
    // Android fires once and dismisses itself; iOS keeps the spinner mounted.
    if (Platform.OS !== 'ios') setOpen(false);
    if (event.type === 'dismissed' || !picked) return;
    onChange(merge(value, picked, mode));
  };

  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{label}</Text>

      {Platform.OS === 'web' ? (
        // react-native-web renders to the DOM, so a real input works here and
        // brings the platform's own calendar / clock popover with it.
        <input
          type={mode}
          value={inputValue(value, mode)}
          data-testid={testID}
          aria-label={label}
          onChange={(e) => {
            const next = parseInput(e.target.value, value, mode);
            if (next) onChange(next);
          }}
          style={webInputStyle(colors)}
        />
      ) : (
        <>
          <AppPressable
            variant="none"
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${display}`}
            testID={testID}
            onPress={() => setOpen((v) => !v)}
            style={styles.control}
          >
            <Text style={styles.value}>{display}</Text>
          </AppPressable>

          {open ? (
            <DateTimePicker
              value={value}
              mode={mode}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              is24Hour={timeFormat === '24h'}
              onChange={handlePicked}
              testID={testID ? `${testID}-picker` : undefined}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

/**
 * Plain CSS — this styles a DOM node, not a React Native view, so the font has
 * to be named outright: `inherit` picks up the UA default on a form control,
 * not the app's face.
 */
const webInputStyle = (colors: Colors) =>
  ({
    width: '100%',
    padding: '12px 14px',
    fontSize: 15,
    fontFamily: `${fonts.regular}, system-ui, sans-serif`,
    color: colors.ink,
    border: `1.5px solid ${colors.fieldBorder}`,
    borderRadius: radii.field,
    outline: 'none',
    boxSizing: 'border-box',
    background: colors.fieldBg,
  }) as const;

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
    control: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderWidth: 1.5,
      borderColor: colors.fieldBorder,
      borderRadius: radii.field,
      backgroundColor: colors.fieldBg,
      justifyContent: 'center',
    },
    value: {
      fontSize: 15,
      fontFamily: fonts.regular,
      color: colors.ink,
    },
  });
