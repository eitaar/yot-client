jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { format, startOfDay } from 'date-fns';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { AppEvent } from '@/api/types';
import { useEvents } from '@/store/events';
import CalendarScreen from '../../app/(tabs)/index';

/**
 * Mount tests for the Calendar tab. The store is filled directly rather than
 * mocked — it is the same shape a real sync produces, and it keeps the
 * memoized `eventsOnDay` selector in the path under test.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } };

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 58, left: 0, right: 0, bottom: 34 },
};

const today = startOfDay(new Date());

function at(hour: number, minute = 0): Date {
  const d = new Date(today);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function makeEvent(over: Partial<AppEvent> & Pick<AppEvent, 'id' | 'title'>): AppEvent {
  return {
    calendarId: 'cal-1',
    allDay: false,
    color: '#E8453C',
    start: at(10),
    end: at(11),
    ...over,
  } as AppEvent;
}

/** Two events that overlap, so the layout has to split them into two lanes. */
const OVERLAP: AppEvent[] = [
  makeEvent({ id: 'e1', title: 'Design review', start: at(10), end: at(11, 30) }),
  makeEvent({ id: 'e2', title: 'Standup', start: at(10, 30), end: at(11), color: '#4361EE' }),
];

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
      <CalendarScreen />
    </SafeAreaProvider>,
  );
}

afterEach(() => {
  seed([]);
  router.push.mockReset();
});

describe('Calendar tab', () => {
  it('renders the day header, week strip and a timeline block per event', async () => {
    seed(OVERLAP);
    const { getByTestId, getByText } = await renderScreen();

    // Day header: the big date number and the month-year line.
    expect(getByTestId('day-number')).toHaveTextContent(String(today.getDate()));
    expect(getByTestId('day-month')).toHaveTextContent(format(today, 'MMMM yyyy'));
    expect(getByText('TODAY')).toBeTruthy();

    // Both overlapping events are laid out.
    expect(getByTestId('timeline-canvas')).toBeTruthy();
    expect(getByTestId('timeline-block-e1')).toBeTruthy();
    expect(getByTestId('timeline-block-e2')).toBeTruthy();
    // Both titles show up twice (timeline + month list), so assert in place.
    expect(getByTestId('timeline-block-e1')).toHaveTextContent(/Design review/);
    expect(getByTestId('timeline-block-e2')).toHaveTextContent(/Standup/);
    // Overlap put them in lanes, which switches the label to the condensed
    // "start · duration" form (design line 405).
    expect(getByTestId('timeline-block-e1')).toHaveTextContent(/10:00 AM · 1 hr 30 min/);

    // The week strip offers the selected day.
    expect(getByTestId(`week-day-${format(today, 'yyyy-MM-dd')}`)).toBeTruthy();
  });

  it('opens the event detail route from a timeline block', async () => {
    seed(OVERLAP);
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('timeline-block-e1'));
    expect(router.push).toHaveBeenCalledWith('/event/e1');
  });

  it('shows the empty state on a day with nothing scheduled', async () => {
    seed([]);
    const { getByTestId } = await renderScreen();
    expect(getByTestId('timeline-empty')).toHaveTextContent('Nothing scheduled');
  });

  /**
   * Regression: an all-day event used to be fed to `layoutDay` like any other,
   * which opened the window to 00:00–24:00 and squeezed every timed event on
   * that day into half a lane from midnight to midnight.
   */
  it('renders all-day events above the timeline, out of the layout', async () => {
    const allDay = makeEvent({
      id: 'ad1',
      title: 'Conference',
      allDay: true,
      start: today,
      end: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      color: '#1B8C5A',
    });
    seed([allDay, ...OVERLAP]);
    const { getByTestId, getByText } = await renderScreen();

    // It shows, but as a chip above the grid — not as a capsule.
    expect(getByTestId('all-day-row')).toBeTruthy();
    expect(getByText('Conference')).toBeTruthy();
    expect(getByText('All day')).toBeTruthy();

    // The timed events keep their own window and both lanes.
    expect(getByTestId('timeline-block-e1')).toBeTruthy();
    expect(getByTestId('timeline-block-e2')).toBeTruthy();
  });

  it('navigates months without changing the selected day', async () => {
    seed([]);
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('month-handle'));
    expect(getByTestId('month-label')).toHaveTextContent(format(today, 'MMMM yyyy'));

    await fireEvent.press(getByTestId('month-next'));

    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    await waitFor(() =>
      expect(getByTestId('month-label')).toHaveTextContent(format(nextMonth, 'MMMM yyyy')),
    );
    // The selected day is untouched: the list header and the day view agree.
    expect(getByTestId('month-list-day')).toHaveTextContent(format(today, 'EEEE, MMMM d'));
    expect(getByTestId('day-number')).toHaveTextContent(String(today.getDate()));
  });
});
