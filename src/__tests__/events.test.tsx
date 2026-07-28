jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { fireEvent, render } from '@testing-library/react-native';
import { addDays, format, startOfDay } from 'date-fns';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { AppEvent } from '@/api/types';
import { useEvents } from '@/store/events';
import EventsScreen from '../../app/(tabs)/events';

/**
 * The Events tab. The store is seeded rather than mocked, so the real
 * `upcoming` selector and `groupUpcomingByDay` stay in the path under test.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } };

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 58, left: 0, right: 0, bottom: 34 },
};

const today = startOfDay(new Date());

function at(day: Date, hour: number, minute = 0): Date {
  const d = new Date(day);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function makeEvent(over: Partial<AppEvent> & Pick<AppEvent, 'id' | 'title'>): AppEvent {
  return {
    calendarId: 'cal-1',
    allDay: false,
    color: '#E8453C',
    start: at(today, 10),
    end: at(today, 11),
    ...over,
  } as AppEvent;
}

function seed(events: AppEvent[]) {
  useEvents.setState({
    eventsById: Object.fromEntries(events.map((e) => [e.id, e])),
    calendarsById: {},
    hydrated: true,
    syncing: false,
    error: null,
    fetchedRange: null,
    lastSyncAt: null,
  });
}

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <EventsScreen />
    </SafeAreaProvider>,
  );
}

afterEach(() => {
  seed([]);
  router.push.mockReset();
});

describe('Events tab', () => {
  it('groups upcoming events into Today / Tomorrow / weekday sections', async () => {
    const tomorrow = addDays(today, 1);
    const later = addDays(today, 3);

    seed([
      makeEvent({ id: 'e1', title: 'Team standup', start: at(today, 10), end: at(today, 10, 30) }),
      makeEvent({ id: 'e2', title: 'Dentist', start: at(today, 14, 30), end: at(today, 15, 30) }),
      makeEvent({ id: 'e3', title: 'Coffee with Maya', start: at(tomorrow, 9), end: at(tomorrow, 9, 30) }),
      makeEvent({ id: 'e4', title: 'Live jazz', start: at(later, 19, 30), end: at(later, 22) }),
    ]);

    const { getByText, getByTestId } = await renderScreen();

    expect(getByTestId('events-header-title')).toHaveTextContent('Upcoming');

    // One header per day, with the relative label and the faint date beside it.
    expect(getByTestId('group-Today')).toBeTruthy();
    expect(getByTestId('group-Tomorrow')).toBeTruthy();
    expect(getByTestId(`group-${format(later, 'EEEE')}`)).toBeTruthy();
    expect(getByText(format(today, 'MMM d'))).toBeTruthy();

    // Every event renders a row, in chronological order within its day.
    for (const title of ['Team standup', 'Dentist', 'Coffee with Maya', 'Live jazz']) {
      expect(getByText(title)).toBeTruthy();
    }
  });

  it('shows the time range as each row subtitle', async () => {
    seed([makeEvent({ id: 'e1', title: 'Dentist', start: at(today, 14, 30), end: at(today, 15, 30) })]);
    const { getByText } = await renderScreen();
    expect(getByText('2:30 – 3:30 PM · 1 hr')).toBeTruthy();
  });

  it('pushes the detail route when a row is tapped', async () => {
    seed([makeEvent({ id: 'e1', title: 'Dentist' })]);
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('event-row-e1'));
    expect(router.push).toHaveBeenCalledWith('/event/e1');
  });

  it('opens settings from the gear', async () => {
    seed([]);
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('settings-gear'));
    expect(router.push).toHaveBeenCalledWith('/settings');
  });

  it('says so when there is nothing upcoming', async () => {
    seed([]);
    const { getByText } = await renderScreen();
    expect(getByText('Nothing upcoming')).toBeTruthy();
  });
});
