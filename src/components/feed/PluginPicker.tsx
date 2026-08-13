import { StyleSheet, Text, View } from 'react-native';

import AppPressable from '@/components/AppPressable';
import type { PluginMeta } from '@/plugins/schema';
import { usePlugins } from '@/store/plugins';
import { colors, fonts } from '@/theme/tokens';

/**
 * A list of available (not-yet-added) plugins, each with title + description
 * and an "Add" button. Used by both the Tracking pane's picker and onboarding.
 */
export interface PluginPickerProps {
  available: PluginMeta[];
}

export default function PluginPicker({ available }: PluginPickerProps) {
  const add = usePlugins((s) => s.add);

  if (available.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No more plugins to add.</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {available.map((p) => (
        <View key={p.id} style={styles.row} testID={`plugin-picker-${p.id}`}>
          <View style={styles.rowText}>
            <Text style={styles.title}>{p.title}</Text>
            {p.description ? <Text style={styles.desc}>{p.description}</Text> : null}
          </View>
          <AppPressable
            variant="button"
            accessibilityRole="button"
            accessibilityLabel={`Add ${p.title}`}
            testID={`plugin-add-${p.id}`}
            onPress={() => add(p)}
            style={styles.addButton}
          >
            <Text style={styles.addLabel}>Add</Text>
          </AppPressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.ink,
  },
  desc: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.muted,
  },
  addButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.ink,
  },
  addLabel: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: colors.canvas,
  },
  empty: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.muted,
  },
});
