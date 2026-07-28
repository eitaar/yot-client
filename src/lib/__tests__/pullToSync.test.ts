/**
 * The pull-to-sync state machine. These are the numbers the design chats
 * argued about — 0.55 resistance, the 70px trigger, the closing phase that
 * keeps the indicator mounted — so they are pinned here rather than left to be
 * eyeballed in a running app.
 */

import {
  MIN_SYNC_MS,
  PULL_MAX,
  PULL_TRIGGER,
  SYNC_HEIGHT,
  accumulateWheel,
  acceptsPull,
  indicatorHeight,
  initialPullState,
  isSpinning,
  pullReducer,
  resistedPull,
  shouldTriggerSync,
  spinnerOpacity,
  spinnerRotation,
  spinnerScale,
  type PullAction,
  type PullState,
} from '@/lib/pullToSync';

/** Run a sequence of actions from a starting state. */
function run(actions: PullAction[], from: PullState = initialPullState): PullState {
  return actions.reduce(pullReducer, from);
}

describe('resistance and clamping', () => {
  it('follows the finger at 0.55', () => {
    expect(resistedPull(100)).toBeCloseTo(55);
    expect(resistedPull(40)).toBeCloseTo(22);
  });

  it('caps at 100px however far the finger travels', () => {
    expect(resistedPull(1000)).toBe(PULL_MAX);
    expect(resistedPull(182)).toBe(PULL_MAX);
  });

  it('never goes negative on an upward drag', () => {
    expect(resistedPull(-200)).toBe(0);
    expect(resistedPull(0)).toBe(0);
  });
});

describe('wheel accumulation', () => {
  it('adds each tick at 0.4, since a trackpad emits many small deltas', () => {
    expect(accumulateWheel(0, -100)).toBeCloseTo(40);
    expect(accumulateWheel(40, -100)).toBeCloseTo(80);
  });

  it('clamps to the same 100px ceiling', () => {
    expect(accumulateWheel(90, -500)).toBe(PULL_MAX);
  });

  it('treats downward deltas as no pull at all', () => {
    expect(accumulateWheel(0, 120)).toBe(0);
  });
});

describe('the 70px trigger', () => {
  it('fires at exactly the threshold', () => {
    expect(shouldTriggerSync(PULL_TRIGGER)).toBe(true);
    expect(shouldTriggerSync(PULL_TRIGGER - 0.01)).toBe(false);
  });
});

describe('indicator geometry', () => {
  it('tracks the pull while dragging', () => {
    expect(indicatorHeight('dragging', 42)).toBe(42);
  });

  it('locks to 46px while syncing, whatever the pull was', () => {
    expect(indicatorHeight('syncing', 0)).toBe(SYNC_HEIGHT);
    expect(indicatorHeight('syncing', 100)).toBe(SYNC_HEIGHT);
  });

  it('is 0 when idle and when closed', () => {
    expect(indicatorHeight('idle', 0)).toBe(0);
    expect(indicatorHeight('closing', 0)).toBe(0);
  });
});

describe('spinner', () => {
  it('rotates 3.6 degrees per pixel — one full turn at the cap', () => {
    expect(spinnerRotation(0)).toBe(0);
    expect(spinnerRotation(50)).toBeCloseTo(180);
    expect(spinnerRotation(100)).toBeCloseTo(360);
  });

  it('grows 0.5 -> 1 over the first 90px', () => {
    expect(spinnerScale(0)).toBeCloseTo(0.5);
    expect(spinnerScale(45)).toBeCloseTo(1);
    expect(spinnerScale(100)).toBe(1);
  });

  it('fades in over the first 45px', () => {
    expect(spinnerOpacity('dragging', 0)).toBe(0);
    expect(spinnerOpacity('dragging', 22.5)).toBeCloseTo(0.5);
    expect(spinnerOpacity('dragging', 45)).toBe(1);
    expect(spinnerOpacity('dragging', 90)).toBe(1);
  });

  it('is fully opaque while syncing and gone once closing', () => {
    expect(spinnerOpacity('syncing', 0)).toBe(1);
    expect(spinnerOpacity('closing', 0)).toBe(0);
  });

  it('spins only in the syncing and closing phases', () => {
    expect(isSpinning('syncing')).toBe(true);
    // Still spinning through the close — the design keeps it turning while the
    // height eases away rather than freezing mid-rotation.
    expect(isSpinning('closing')).toBe(true);
    expect(isSpinning('dragging')).toBe(false);
    expect(isSpinning('idle')).toBe(false);
  });
});

describe('reducer: dragging', () => {
  it('enters `dragging` and tracks the finger', () => {
    expect(run([{ type: 'drag', dy: 40 }])).toEqual({ phase: 'dragging', pull: 22 });
  });

  it('ignores a zero-distance drag from idle, so a tap is not a pull', () => {
    expect(run([{ type: 'drag', dy: 0 }])).toEqual(initialPullState);
    expect(run([{ type: 'drag', dy: -80 }])).toEqual(initialPullState);
  });

  it('springs back when released short of the threshold', () => {
    const state = run([{ type: 'drag', dy: 100 }, { type: 'release' }]);
    expect(state).toEqual(initialPullState);
  });

  it('triggers when released at or past the threshold', () => {
    // 128 * 0.55 = 70.4 — just over.
    const state = run([{ type: 'drag', dy: 128 }, { type: 'release' }]);
    expect(state.phase).toBe('syncing');
  });

  it('does nothing on a release that follows no drag', () => {
    expect(run([{ type: 'release' }])).toEqual(initialPullState);
  });
});

describe('reducer: wheel', () => {
  it('triggers as soon as the accumulated pull crosses, with no release', () => {
    // 40 + 20 = 60: still short, so the indicator just follows the wheel.
    const state = run([
      { type: 'wheel', deltaY: -100 },
      { type: 'wheel', deltaY: -50 },
    ]);
    expect(state).toEqual({ phase: 'dragging', pull: 60 });

    // One more tick carries it past 70 — and unlike a finger, the wheel has no
    // release, so it must fire on the crossing itself.
    expect(pullReducer(state, { type: 'wheel', deltaY: -50 }).phase).toBe('syncing');
    expect(run([{ type: 'wheel', deltaY: -200 }]).phase).toBe('syncing');
  });

  it('abandons the pull the moment the wheel reverses', () => {
    const state = run([
      { type: 'wheel', deltaY: -100 },
      { type: 'wheel', deltaY: 30 },
    ]);
    expect(state).toEqual(initialPullState);
  });
});

describe('reducer: the sync lifecycle', () => {
  const syncing = run([{ type: 'drag', dy: 200 }, { type: 'release' }]);

  it('closes rather than vanishing — the indicator stays mounted', () => {
    expect(syncing.phase).toBe('syncing');
    const closing = pullReducer(syncing, { type: 'settled' });
    // This is chat12's fix: `syncing -> closing -> idle`, never straight to
    // idle, so the 46px height has something to animate to.
    expect(closing.phase).toBe('closing');
    expect(pullReducer(closing, { type: 'closed' })).toEqual(initialPullState);
  });

  it('ignores further pulls while a sync is in flight', () => {
    expect(pullReducer(syncing, { type: 'drag', dy: 300 })).toBe(syncing);
    expect(pullReducer(syncing, { type: 'wheel', deltaY: -300 })).toBe(syncing);

    const closing = pullReducer(syncing, { type: 'settled' });
    expect(pullReducer(closing, { type: 'drag', dy: 300 })).toBe(closing);
  });

  it('will not let a cancel abort an in-flight sync', () => {
    expect(pullReducer(syncing, { type: 'cancel' })).toBe(syncing);
    expect(pullReducer({ phase: 'dragging', pull: 30 }, { type: 'cancel' })).toEqual(
      initialPullState,
    );
  });

  it('ignores out-of-order lifecycle events', () => {
    expect(pullReducer(initialPullState, { type: 'settled' })).toEqual(initialPullState);
    expect(pullReducer(initialPullState, { type: 'closed' })).toEqual(initialPullState);
  });

  it('accepts pulls only when idle or dragging', () => {
    expect(acceptsPull('idle')).toBe(true);
    expect(acceptsPull('dragging')).toBe(true);
    expect(acceptsPull('syncing')).toBe(false);
    expect(acceptsPull('closing')).toBe(false);
  });
});

describe('timings', () => {
  it('keeps the spinner up long enough to be read', () => {
    // A LAN sync can return in 20ms; without a floor it is a flicker.
    expect(MIN_SYNC_MS).toBeGreaterThanOrEqual(600);
  });
});
