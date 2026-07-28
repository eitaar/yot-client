jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { StreamOptions, StreamSubscription } from '@/api/sse';
import { useLiveSync } from '@/hooks/useLiveSync';
import { useEvents } from '@/store/events';

/**
 * The SSE lifecycle hook. `subscribeToStream` is mocked — its own parsing,
 * transport and backoff behaviour is already covered in `api/__tests__/sse` —
 * so what is tested here is the wiring: when it connects, what it does with a
 * frame, and that it hangs up on unmount.
 */

// `mock`-prefixed names are the only out-of-scope variables a jest factory may
// close over.
const mockClose = jest.fn();
let mockLastOptions: StreamOptions | null = null;

jest.mock('@/api/sse', () => ({
  __esModule: true,
  sseSupported: true,
  subscribeToStream: jest.fn((options: StreamOptions): StreamSubscription => {
    mockLastOptions = options;
    return { close: mockClose, status: 'connecting' };
  }),
}));

const { subscribeToStream } = jest.requireMock('@/api/sse') as {
  subscribeToStream: jest.Mock;
};

/** Narrowed accessor — the mock assigns it on every subscribe. */
const lastOptions = (): StreamOptions | null => mockLastOptions;

function Harness({
  enabled,
  onUnauthorized,
  reconcileDebounceMs,
}: {
  enabled: boolean;
  onUnauthorized?: () => void;
  reconcileDebounceMs?: number;
}) {
  const status = useLiveSync({ enabled, onUnauthorized, reconcileDebounceMs });
  return <Text testID="status">{status}</Text>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLastOptions = null;
  useEvents.setState({
    eventsById: {},
    calendarsById: {},
    fetchedRange: null,
    lastSyncAt: null,
    syncing: false,
    error: null,
    hydrated: true,
  });
});

describe('useLiveSync', () => {
  it('does not connect until the app is paired', async () => {
    await render(<Harness enabled={false} />);
    expect(subscribeToStream).not.toHaveBeenCalled();
  });

  it('connects once paired and hangs up on unmount', async () => {
    const view = await render(<Harness enabled />);
    expect(subscribeToStream).toHaveBeenCalledTimes(1);

    await view.unmount();
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('routes a created event straight into the store', async () => {
    await render(<Harness enabled />);

    lastOptions()?.onEvent?.('event.created', {
      id: 'evt-1',
      calendar_id: 'cal-1',
      title: 'Design review',
      start_at: '2026-07-28T14:30:00Z',
      end_at: '2026-07-28T15:30:00Z',
      all_day: false,
    } as never);

    await waitFor(() => expect(useEvents.getState().eventsById['evt-1']).toBeDefined());
    expect(useEvents.getState().eventsById['evt-1'].title).toBe('Design review');
  });

  it('removes a deleted event', async () => {
    useEvents.setState({
      eventsById: {
        'evt-1': {
          id: 'evt-1',
          calendarId: 'cal-1',
          title: 'Gone',
          start: new Date('2026-07-28T14:30:00Z'),
          end: new Date('2026-07-28T15:30:00Z'),
          allDay: false,
          color: '#E8453C',
        },
      },
    });

    await render(<Harness enabled />);
    lastOptions()?.onEvent?.('event.deleted', { id: 'evt-1' } as never);

    await waitFor(() => expect(useEvents.getState().eventsById['evt-1']).toBeUndefined());
  });

  it('reports the stream status back to the caller', async () => {
    const view = await render(<Harness enabled />);
    lastOptions()?.onStatus?.('open');
    await waitFor(() => expect(view.getByTestId('status')).toHaveTextContent('open'));
  });

  it('escalates a 401 to the caller so the app can drop to onboarding', async () => {
    const onUnauthorized = jest.fn();
    await render(<Harness enabled onUnauthorized={onUnauthorized} />);

    lastOptions()?.onUnauthorized?.();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});

/**
 * H1. `subscribeToStream` reconnects internally with backoff and the server
 * sends a fresh `ready` on each new connection. Catching up only on the first
 * one meant an event created during an outage stayed invisible until the user
 * pulled to sync by hand.
 */
describe('useLiveSync catch-up (H1)', () => {
  let sync: jest.Mock;

  beforeEach(() => {
    sync = jest.fn(async () => ({ ok: true as const }));
    useEvents.setState({ sync } as never);
  });

  const ready = () => lastOptions()?.onHeartbeat?.('ready', '');
  const ping = () => lastOptions()?.onHeartbeat?.('ping', '');

  it('reconciles on the first ready', async () => {
    await render(<Harness enabled />);
    ready();
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('reconciles again on the ready of every reconnect', async () => {
    // Zero debounce: the point here is that a later `ready` is not ignored.
    await render(<Harness enabled reconcileDebounceMs={0} />);

    ready();
    ready();
    ready();

    expect(sync).toHaveBeenCalledTimes(3);
  });

  it('ignores pings — they are liveness, not a reconnect', async () => {
    await render(<Harness enabled reconcileDebounceMs={0} />);
    ping();
    ping();
    expect(sync).not.toHaveBeenCalled();
  });

  it('debounces against the mount sync so a launch does not sync twice', async () => {
    // The app's own `sync()` on launch has just landed.
    useEvents.setState({ lastSyncAt: Date.now() });
    await render(<Harness enabled />);

    ready();

    expect(sync).not.toHaveBeenCalled();
  });

  it('still reconciles when the last sync is older than the debounce', async () => {
    useEvents.setState({ lastSyncAt: Date.now() - 10 * 60 * 1000 });
    await render(<Harness enabled />);

    ready();

    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('does not pile a catch-up on top of a sync already running', async () => {
    useEvents.setState({ syncing: true });
    await render(<Harness enabled reconcileDebounceMs={0} />);

    ready();

    expect(sync).not.toHaveBeenCalled();
  });

  it('does not reconcile after the hook has been torn down', async () => {
    const view = await render(<Harness enabled reconcileDebounceMs={0} />);
    const heartbeat = lastOptions()?.onHeartbeat;

    await view.unmount();
    heartbeat?.('ready', '');

    expect(sync).not.toHaveBeenCalled();
  });
});
