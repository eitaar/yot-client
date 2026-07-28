import { Tabs } from 'expo-router';

import TabBar, { type TabBarItem } from '@/components/TabBar';
import { tabIconPaths } from '@/components/icons';
import { colors } from '@/theme/tokens';

/**
 * The three tabs, in the design's order. Icon path data comes from
 * `icons.tsx`, which transcribed it from the prototype verbatim.
 */
const TAB_ITEMS: readonly TabBarItem[] = [
  { key: 'index', label: 'Calendar', paths: tabIconPaths.calendar, animation: 'calendar' },
  { key: 'events', label: 'Events', paths: tabIconPaths.events, animation: 'events' },
  { key: 'feed', label: 'Feed', paths: tabIconPaths.feed, animation: 'feed' },
];

/**
 * Tabs with the design's custom bar. The platform bar is replaced wholesale —
 * the prototype's is a plain row with its own typography and per-icon
 * activation animations, none of which the native bar can express.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.canvas },
      }}
      tabBar={({ state, navigation }) => (
        <TabBar
          items={TAB_ITEMS}
          activeKey={state.routes[state.index]?.name ?? 'index'}
          onSelect={(key) => {
            const route = state.routes.find((r) => r.name === key);
            if (!route) return;
            const focused = state.routes[state.index]?.key === route.key;
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          }}
        />
      )}
    >
      <Tabs.Screen name="index" options={{ title: 'Calendar' }} />
      <Tabs.Screen name="events" options={{ title: 'Events' }} />
      <Tabs.Screen name="feed" options={{ title: 'Feed' }} />
    </Tabs>
  );
}
