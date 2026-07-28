jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import {
  buildSeedItems,
  designFranchises,
  itemById,
  useTracking,
} from '@/store/tracking';
import TrackingDetailScreen from '../../app/tracking/[id]';

/**
 * Tracking detail. The store is seeded from the same demo source the app uses,
 * anchored to the real current date, so the countdown copy under test is the
 * copy a user would see today.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: jest.fn(() => ({ id: 't1' })),
}));

const routerMock = jest.requireMock('expo-router') as {
  router: { back: jest.Mock };
  useLocalSearchParams: jest.Mock;
};

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 58, left: 0, right: 0, bottom: 34 },
};

function seed() {
  useTracking.setState({
    franchises: designFranchises.map((f) => ({ ...f })),
    items: buildSeedItems(new Date()),
    seededAt: new Date().toISOString(),
    hydrated: true,
  });
}

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <TrackingDetailScreen />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  seed();
  routerMock.useLocalSearchParams.mockReturnValue({ id: 't1' });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('Tracking detail', () => {
  it('renders the franchise, title, countdown and metadata for an active range', async () => {
    // t1 "Arlecchino Rerun" is seeded as live: started 12d ago, 12d to run.
    const { getByTestId, getByText } = await renderScreen();

    expect(getByTestId('tracking-franchise')).toHaveTextContent('Genshin Impact');
    expect(getByTestId('tracking-title')).toHaveTextContent('Arlecchino Rerun');
    expect(getByTestId('tracking-countdown')).toHaveTextContent('12 days left');

    // Active multi-day range: progress bar plus the ago/left caption.
    expect(getByTestId('tracking-progress')).toBeTruthy();
    expect(getByText('12d ago')).toBeTruthy();
    expect(getByText('12d left')).toBeTruthy();

    // Type is capitalised by style; Duration is the span in days.
    expect(getByText('Type')).toBeTruthy();
    expect(getByText('gacha')).toBeTruthy();
    expect(getByText('Duration')).toBeTruthy();
    expect(getByText('24 days')).toBeTruthy();
  });

  it('shows "In N days" and no progress bar for a future single-day item', async () => {
    // t11 "Season 2 Premiere" is 18 days out and spans a single day.
    routerMock.useLocalSearchParams.mockReturnValue({ id: 't11' });
    const { getByTestId, queryByTestId, queryByText } = await renderScreen();

    expect(getByTestId('tracking-title')).toHaveTextContent('Season 2 Premiere');
    expect(getByTestId('tracking-countdown')).toHaveTextContent('In 18 days');
    expect(queryByTestId('tracking-progress')).toBeNull();
    expect(queryByText('Duration')).toBeNull();
  });

  it('shows TBA for an unannounced item', async () => {
    routerMock.useLocalSearchParams.mockReturnValue({ id: 't13' });
    const { getByTestId } = await renderScreen();

    expect(getByTestId('tracking-title')).toHaveTextContent('Version 1.3');
    expect(getByTestId('tracking-countdown')).toHaveTextContent('TBA');
  });

  it('counts a same-day item down to zero, as the design does', async () => {
    // t2 is anchored to the seed day itself, so it is *active* with nothing
    // left to run. The design's branch order (line 945) puts "N days left"
    // ahead of "Today", so a same-day item reads "0 days left"; the "Today"
    // branch only fires for a not-yet-active item starting today.
    const t2 = itemById(useTracking.getState(), 't2');
    expect(t2?.start).not.toBeNull();

    routerMock.useLocalSearchParams.mockReturnValue({ id: 't2' });
    const { getByTestId } = await renderScreen();
    expect(getByTestId('tracking-countdown')).toHaveTextContent('0 days left');
  });

  it('falls back gracefully for an unknown id', async () => {
    routerMock.useLocalSearchParams.mockReturnValue({ id: 'nope' });
    const { getByText } = await renderScreen();
    expect(getByText('Not found')).toBeTruthy();
  });

  it('goes back from the Back link', async () => {
    const { getByTestId } = await renderScreen();
    await fireEvent.press(getByTestId('tracking-back'));
    expect(routerMock.router.back).toHaveBeenCalled();
  });
});
