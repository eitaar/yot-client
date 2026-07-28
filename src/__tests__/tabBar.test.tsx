import { fireEvent, render } from '@testing-library/react-native';

import TabBar, { type TabBarItem } from '@/components/TabBar';
import { tabIconPaths } from '@/components/icons';

/**
 * The custom bottom bar (design lines 992-1005). RNTL v14 renders and fires
 * asynchronously, so every interaction here is awaited.
 */

const ITEMS: readonly TabBarItem[] = [
  { key: 'index', label: 'Calendar', paths: tabIconPaths.calendar, animation: 'calendar' },
  { key: 'events', label: 'Events', paths: tabIconPaths.events, animation: 'events' },
  { key: 'feed', label: 'Feed', paths: tabIconPaths.feed, animation: 'feed' },
];

describe('TabBar', () => {
  it('renders the three tabs and marks the active one selected', async () => {
    const { getByText, getByTestId } = await render(
      <TabBar items={ITEMS} activeKey="index" onSelect={() => {}} />,
    );

    expect(getByText('Calendar')).toBeTruthy();
    expect(getByText('Events')).toBeTruthy();
    expect(getByText('Feed')).toBeTruthy();

    expect(getByTestId('tab-index').props.accessibilityState).toMatchObject({ selected: true });
    expect(getByTestId('tab-feed').props.accessibilityState).toMatchObject({ selected: false });
  });

  it('reports the tab that was pressed', async () => {
    const onSelect = jest.fn();
    const { getByTestId } = await render(
      <TabBar items={ITEMS} activeKey="index" onSelect={onSelect} />,
    );

    await fireEvent.press(getByTestId('tab-feed'));
    expect(onSelect).toHaveBeenCalledWith('feed');
  });
});
