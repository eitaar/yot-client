/**
 * Keeps the events store in step with the server over SSE.
 *
 * `subscribeToStream` already handles the transports, framing, backoff and the
 * 401 stop condition; this hook is only the lifecycle around it:
 *
 *  - connect once the app is paired and the stream is supported on this
 *    platform (`sseSupported` is false where neither transport exists);
 *  - route every recognised frame into `events.applyServerEvent`;
 *  - drop the connection when the app goes to the background and pick it up
 *    again on return — an idle socket on a phone is a battery cost with no
 *    payoff, and iOS will kill it anyway;
 *  - reconcile after *every* connect, since anything that happened while the
 *    socket was down never arrived as a frame.
 *
 * `AppState` on web reports `active` for a hidden tab in some browsers, so the
 * background teardown is native-only; on web the stream simply stays open.
 */

import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { sseSupported, subscribeToStream, type StreamStatus } from '@/api/sse';
import { useEvents } from '@/store/events';

export interface LiveSyncOptions {
  /** Connect only when true — i.e. a session exists and pairing is complete. */
  enabled: boolean;
  /** Called on a 401 from the stream, so the caller can drop to onboarding. */
  onUnauthorized?: () => void;
  /** Override the catch-up debounce (tests). */
  reconcileDebounceMs?: number;
}

/**
 * How recently a sync must have happened for a `ready` heartbeat to skip its
 * own. Long enough to swallow the app's mount sync, which lands within a second
 * or two of the first `ready`; short enough that a genuine reconnect after an
 * outage always reconciles.
 */
export const RECONCILE_DEBOUNCE_MS = 5000;

export function useLiveSync({
  enabled,
  onUnauthorized,
  reconcileDebounceMs = RECONCILE_DEBOUNCE_MS,
}: LiveSyncOptions): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>('idle');

  // Only tracked on native; on web the stream is always allowed.
  const [foreground, setForeground] = useState(true);

  const unauthorizedRef = useRef(onUnauthorized);
  unauthorizedRef.current = onUnauthorized;

  useEffect(() => {
    if (Platform.OS === 'web') return;

    // Only a true `background` closes the stream. `inactive` is transient —
    // the app switcher, a notification shade, an incoming call — and dropping
    // the connection for it would mean reconnecting seconds later.
    const onChange = (next: AppStateStatus) => setForeground(next !== 'background');
    const subscription = AppState.addEventListener('change', onChange);
    setForeground(AppState.currentState !== 'background');
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!enabled || !sseSupported || !foreground) {
      setStatus('idle');
      return;
    }

    let cancelled = false;
    /** When the last catch-up sync was kicked off from this subscription. */
    let lastReconcileAt = 0;

    const subscription = subscribeToStream({
      onEvent: (type, payload) => {
        if (cancelled) return;
        useEvents.getState().applyServerEvent(type, payload);
      },
      onHeartbeat: (kind) => {
        if (cancelled) return;
        // `ping` is only liveness. `ready` is the server saying the socket is
        // live *from now* — which means every change made while it was down is
        // missing, and it says it again after each internal reconnect. Syncing
        // only on the first one (the old behaviour) meant an event created
        // during an outage stayed invisible until a manual pull-to-sync.
        if (kind !== 'ready') return;

        const state = useEvents.getState();
        const now = Date.now();
        // Skip when a sync is already covering this moment: the app's own mount
        // sync fires within a second of the first `ready`, and running both
        // would double every launch's traffic for nothing.
        if (state.syncing) return;
        if (now - Math.max(state.lastSyncAt ?? 0, lastReconcileAt) < reconcileDebounceMs) return;

        lastReconcileAt = now;
        void state.sync();
      },
      onStatus: (next) => {
        if (!cancelled) setStatus(next);
      },
      onUnauthorized: () => {
        if (cancelled) return;
        unauthorizedRef.current?.();
      },
    });

    return () => {
      cancelled = true;
      subscription.close();
    };
  }, [enabled, foreground, reconcileDebounceMs]);

  return status;
}

export default useLiveSync;
