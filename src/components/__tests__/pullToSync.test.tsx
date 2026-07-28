jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { render } from '@testing-library/react-native';
import { ScrollView, Text } from 'react-native';

import PullToSync, { type PullScrollProps } from '@/components/PullToSync';

/**
 * The pull *behaviour* is covered exhaustively by `lib/pullToSync` — a gesture
 * cannot be driven meaningfully through the test renderer. What is worth
 * pinning here is the component's contract: both call shapes mount, the
 * indicator exists from the first frame (chat12: it must never unmount, so it
 * must never be conditionally rendered either), and the render-prop form hands
 * out a usable set of scroll props.
 */

describe('PullToSync', () => {
  it('wraps content in its own ScrollView and keeps the indicator mounted', async () => {
    const { getByTestId, getByText } = await render(
      <PullToSync testID="pull" scrollTestID="pull-scroll">
        <Text>Upcoming</Text>
      </PullToSync>,
    );

    expect(getByText('Upcoming')).toBeTruthy();
    expect(getByTestId('pull-scroll')).toBeTruthy();
    // Present at rest, at height 0 — not conditionally rendered.
    expect(getByTestId('pull-indicator')).toBeTruthy();
    expect(getByTestId('pull-spinner')).toBeTruthy();
  });

  it('hands the render-prop form a ref, an onScroll and a throttle', async () => {
    let received: PullScrollProps | null = null;

    const { getByTestId } = await render(
      <PullToSync testID="feed-pull">
        {(scrollProps) => {
          received = scrollProps;
          return (
            <ScrollView {...scrollProps} testID="inner-scroll">
              <Text>Feed</Text>
            </ScrollView>
          );
        }}
      </PullToSync>,
    );

    expect(getByTestId('inner-scroll')).toBeTruthy();
    expect(received).not.toBeNull();
    const props = received as unknown as PullScrollProps;
    expect(typeof props.onScroll).toBe('function');
    expect(props.scrollEventThrottle).toBe(16);
    expect(props.ref).toBeTruthy();
  });

  it('names its indicator after the surface, so several can coexist', async () => {
    const { getByTestId } = await render(
      <PullToSync testID="events-pull">
        <Text>rows</Text>
      </PullToSync>,
    );

    expect(getByTestId('events-pull-indicator')).toBeTruthy();
  });
});
