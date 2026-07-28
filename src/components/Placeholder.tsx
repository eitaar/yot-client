import { StyleSheet, Text, View } from 'react-native';

import { colors, type } from '@/theme/tokens';

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
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{name}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
