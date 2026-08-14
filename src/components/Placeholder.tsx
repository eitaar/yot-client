import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/context';
import { type } from '@/theme/tokens';
import type { Colors } from '@/theme/tokens';

export interface PlaceholderProps {
  /** Screen name, so it is obvious which route resolved. */
  name: string;
  /** Optional detail, e.g. a route param. */
  detail?: string;
}

/**
 * Temporary screen body used while the routes exist but the real screens are
 * not built yet. Replaced stage by stage.
 */
export default function Placeholder({ name, detail }: PlaceholderProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{name}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.canvas,
      padding: 24,
      gap: 6,
    },
    title: {
      ...type.screenTitle,
      color: colors.ink,
      textAlign: 'center',
    },
    detail: {
      ...type.rowSubtitle,
      color: colors.muted,
      textAlign: 'center',
    },
  });
