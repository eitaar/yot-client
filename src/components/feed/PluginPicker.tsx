import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import AppPressable from '@/components/AppPressable';
import { CheckIcon } from '@/components/icons';
import type { PluginMeta } from '@/plugins/schema';
import { usePlugins } from '@/store/plugins';
import { colors, fonts, springs } from '@/theme/tokens';

/**
 * A list of plugins with an add/remove toggle. The "Add" button morphs into a
 * checkmark (scale + spring) when a plugin is added — the row stays in place
 * rather than disappearing. Used by Settings and onboarding.
 */
export interface PluginPickerProps {
  plugins: PluginMeta[];
}

export default function PluginPicker({ plugins }: PluginPickerProps) {
  const added = usePlugins((s) => s.added);
  const toggle = usePlugins((s) => s.toggle);

  if (plugins.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No plugins available.</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {plugins.map((p) => {
        const isAdded = added.some((a) => a.id === p.id);
        return (
          <View key={p.id} style={styles.row} testID={`plugin-picker-${p.id}`}>
            <View style={styles.rowText}>
              <Text style={styles.title}>{p.title}</Text>
              {p.description ? <Text style={styles.desc}>{p.description}</Text> : null}
            </View>
            <AddButton id={p.id} added={isAdded} label={p.title} onPress={() => toggle(p)} />
          </View>
        );
      })}
    </View>
  );
}

function AddButton({
  id,
  added,
  label,
  onPress,
}: {
  id: string;
  added: boolean;
  label: string;
  onPress: () => void;
}) {
  const scale = useSharedValue(added ? 1 : 0);

  useEffect(() => {
    scale.value = withSpring(added ? 1 : 0, springs.bouncy);
  }, [added, scale]);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: scale.value,
  }));

  return (
    <AppPressable
      variant="button"
      accessibilityRole="button"
      accessibilityState={{ selected: added }}
      accessibilityLabel={added ? `Remove ${label}` : `Add ${label}`}
      testID={`plugin-add-${id}`}
      onPress={onPress}
      style={[styles.addButton, added && styles.addButtonAdded]}
    >
      {added ? (
        <Animated.View style={checkStyle}>
          <CheckIcon size={16} color="#fff" strokeWidth={2.5} />
        </Animated.View>
      ) : (
        <Text style={styles.addLabel}>Add</Text>
      )}
    </AppPressable>
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
    width: 64,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
  },
  addButtonAdded: {
    backgroundColor: colors.green,
  },
  addLabel: {
    fontSize: 13,
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
