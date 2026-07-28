/**
 * The pull-to-sync state machine, as pure functions.
 *
 * Every constant and formula here is lifted from the prototype's
 * `triggerSync` / `onWheel` / `onPullMove` block (design lines 1112-1142) and
 * from the behaviour the design chats converged on (chat12):
 *
 *  - the drag tracks the finger with **0.55 resistance**, capped at 100px;
 *  - releasing at **>= 70px** triggers the sync, anything less springs back;
 *  - while syncing the indicator sits at a fixed **46px** and the spinner
 *    loops; the pull value itself is irrelevant;
 *  - when the sync finishes the indicator **stays mounted** for a closing
 *    phase that eases 46 -> 0 (0.42s). Unmounting it immediately was the bug
 *    that made the content appear to jump rather than slide.
 *
 * The component in `components/PullToSync.tsx` drives Reanimated shared values
 * from these; keeping the arithmetic here means the thresholds can be tested
 * without a gesture, an animation frame or a renderer.
 *
 * The `'worklet'` directives let the same functions be called from the UI
 * thread inside gesture callbacks. Under Jest they are inert string literals.
 */

/* --------------------------------------------------------------- constants */

/** Fraction of the finger's travel the indicator actually follows. */
export const PULL_RESISTANCE = 0.55;
/** Hard cap on the pulled height, in px. */
export const PULL_MAX = 100;
/** Release at or above this to trigger a sync. */
export const PULL_TRIGGER = 70;
/** Indicator height while the sync is in flight. */
export const SYNC_HEIGHT = 46;
/** Wheel deltas are damped harder than touch — trackpads are twitchy. */
export const WHEEL_RESISTANCE = 0.4;
/** Spinner reaches full opacity this far into the pull. */
export const SPINNER_FADE_PX = 45;
/** Spinner reaches full scale this far into the pull (from 0.5). */
export const SPINNER_SCALE_PX = 90;
/** Degrees of spinner rotation per pixel pulled (100px -> one full turn). */
export const SPINNER_DEG_PER_PX = 3.6;
/** Closing phase: `height 0.42s cubic-bezier(.22,1,.36,1)`. */
export const CLOSE_MS = 420;
/** Opening phase — the design's height transition, run forwards. */
export const OPEN_MS = 220;
/** One spinner revolution: `spin 0.6s ... infinite`. */
export const SPIN_MS = 600;
/** Opacity cross-fades around the syncing phase. */
export const FADE_MS = 300;
/**
 * Floor on how long the syncing phase lasts. A LAN sync can return in 20ms,
 * which reads as a flicker rather than as feedback.
 */
export const MIN_SYNC_MS = 800;
/** Wheel gestures have no "release" — settle this long after the last tick. */
export const WHEEL_SETTLE_MS = 140;

/* ------------------------------------------------------------------ phases */

/**
 * - `idle`     — nothing on screen (height 0).
 * - `dragging` — the indicator is glued to the finger / wheel.
 * - `syncing`  — locked at {@link SYNC_HEIGHT}, spinner looping.
 * - `closing`  — easing back to 0 while still mounted.
 */
export type PullPhase = 'idle' | 'dragging' | 'syncing' | 'closing';

/** True while a new pull may move the indicator. */
export function acceptsPull(phase: PullPhase): boolean {
  'worklet';
  return phase === 'idle' || phase === 'dragging';
}

/** True while the spinner should be running its loop rather than following the pull. */
export function isSpinning(phase: PullPhase): boolean {
  'worklet';
  return phase === 'syncing' || phase === 'closing';
}

/* ------------------------------------------------------------- arithmetic */

function clampPull(value: number): number {
  'worklet';
  if (value < 0) return 0;
  return value > PULL_MAX ? PULL_MAX : value;
}

/** Finger travel -> indicator height. Upward drags produce 0, never negative. */
export function resistedPull(dy: number): number {
  'worklet';
  return clampPull(dy * PULL_RESISTANCE);
}

/**
 * Wheel deltas accumulate: a trackpad emits many small ticks, so each one adds
 * to the pull rather than replacing it. `deltaY` is negative when scrolling up.
 */
export function accumulateWheel(current: number, deltaY: number): number {
  'worklet';
  return clampPull(current + -deltaY * WHEEL_RESISTANCE);
}

/** The release test. */
export function shouldTriggerSync(pull: number): boolean {
  'worklet';
  return pull >= PULL_TRIGGER;
}

/** Height the indicator should occupy right now. */
export function indicatorHeight(phase: PullPhase, pull: number): number {
  'worklet';
  if (phase === 'syncing') return SYNC_HEIGHT;
  if (phase === 'closing' || phase === 'idle') return 0;
  return clampPull(pull);
}

/** `rotate(${pull * 3.6}deg)` while dragging. */
export function spinnerRotation(pull: number): number {
  'worklet';
  return clampPull(pull) * SPINNER_DEG_PER_PX;
}

/** `scale(min(0.5 + pull / 90, 1))`. */
export function spinnerScale(pull: number): number {
  'worklet';
  const scale = 0.5 + clampPull(pull) / SPINNER_SCALE_PX;
  return scale > 1 ? 1 : scale;
}

/** `opacity: min(pull / 45, 1)`, full while syncing, 0 once closed. */
export function spinnerOpacity(phase: PullPhase, pull: number): number {
  'worklet';
  if (phase === 'syncing') return 1;
  if (phase === 'closing' || phase === 'idle') return 0;
  const opacity = clampPull(pull) / SPINNER_FADE_PX;
  return opacity > 1 ? 1 : opacity;
}

/* -------------------------------------------------------------- transitions */

export interface PullState {
  phase: PullPhase;
  pull: number;
}

export const initialPullState: PullState = { phase: 'idle', pull: 0 };

export type PullAction =
  /** Finger moved to `dy` px below where the pull started. */
  | { type: 'drag'; dy: number }
  /** One wheel tick; `deltaY` follows the DOM sign convention. */
  | { type: 'wheel'; deltaY: number }
  /** Finger lifted, or the wheel went quiet for {@link WHEEL_SETTLE_MS}. */
  | { type: 'release' }
  /** The `sync()` promise settled *and* {@link MIN_SYNC_MS} has elapsed. */
  | { type: 'settled' }
  /** The closing animation finished. */
  | { type: 'closed' }
  /** The gesture was cancelled or the surface unmounted mid-pull. */
  | { type: 'cancel' };

/**
 * The whole behaviour in one place. `phase === 'syncing'` on the way out of a
 * `release` (or a `wheel` that crossed the threshold) is the caller's signal to
 * actually call `sync()`.
 *
 * Pulls arriving during `syncing` / `closing` are dropped — the design ignores
 * them, and re-entering a sync from its own closing animation looks broken.
 */
export function pullReducer(state: PullState, action: PullAction): PullState {
  switch (action.type) {
    case 'drag': {
      if (!acceptsPull(state.phase)) return state;
      const pull = resistedPull(action.dy);
      // A pull of 0 from idle is not a drag — it is a plain tap or an upward
      // swipe, and promoting it to `dragging` would swallow the next release.
      if (pull === 0 && state.phase === 'idle') return state;
      return { phase: 'dragging', pull };
    }

    case 'wheel': {
      if (!acceptsPull(state.phase)) return state;
      if (action.deltaY > 0) {
        // Scrolling back down abandons the pull immediately.
        return state.pull > 0 ? initialPullState : state;
      }
      const pull = accumulateWheel(state.pull, action.deltaY);
      if (pull === 0) return state;
      // The wheel has no release event, so it triggers as soon as it crosses.
      if (shouldTriggerSync(pull)) return { phase: 'syncing', pull: 0 };
      return { phase: 'dragging', pull };
    }

    case 'release': {
      if (state.phase !== 'dragging') return state;
      if (shouldTriggerSync(state.pull)) return { phase: 'syncing', pull: 0 };
      return initialPullState;
    }

    case 'settled':
      return state.phase === 'syncing' ? { phase: 'closing', pull: 0 } : state;

    case 'closed':
      return state.phase === 'closing' ? initialPullState : state;

    case 'cancel':
      // Never interrupt an in-flight sync: the request is already out.
      return acceptsPull(state.phase) ? initialPullState : state;

    default:
      return state;
  }
}
