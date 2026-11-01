// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PressTracker.ts
 * @input Touches the arena delivers to a pressable view (TouchConsumer)
 * @output Exports createPressTracker and its PressTracker interface
 *   (UIControl's touch tracking, built by a factory per
 *   architecture:react-component-runtime INV13), its options, the
 *   control event type, and PRESS_PROFILES (a control's and a table cell's
 *   tracking and release clock)
 * @position View-level consumer of packages/core/src/gestures: what a
 *   UIControl does with the touches no gesture recognizer took
 *
 * UIControl semantics, event for event:
 *
 * - `touchDown` when the finger lands; the highlight comes on in the same
 *   frame, unless the control sits in a scroller, where it waits
 *   `contentTouchDelay` (UIScrollView.delaysContentTouches) so a flick
 *   paints nothing.
 * - `touchDragInside` / `touchDragOutside` on every move, `touchDragExit` /
 *   `touchDragEnter` when the finger crosses the control's bounds EXPANDED
 *   by `trackingExpansion` (a fingertip dragged a little off a button is
 *   still on it). The highlight follows inside / outside.
 * - `touchUpInside` / `touchUpOutside` at the lift. A tap quicker than the
 *   scroller delay shows the highlight at the lift for `quickTapFlash`.
 * - `touchCancel` when a recognizer took the touch (`cancelsTouchesInView`)
 *   or the browser took it to scroll: the highlight goes at once, with no
 *   release, one frame before the content moves.
 *
 * Two profiles (PRESS_PROFILES) cover what UIKit does:
 *
 * - `control` (a button, a switch): as above.
 * - `cell` (a table or collection row): the highlight waits the
 *   content-touch delay inside a scroll view and comes on at once outside one
 *   (`spec:AST-094` FR11), travel past the pan hysteresis cancels the press
 *   for good (the scroll view took the touch), and a quicker tap highlights
 *   at the lift straight into the release, with no flash.
 *
 * And UIControl's iOS 6 rule: a single-finger single tap recognizer on an
 * ANCESTOR does not beat the control's own action for a touch on it (the
 * default veto; `vetoesAncestorRecognizer` replaces it, as a slider vetoes a
 * pan along its track).
 *
 * The bounds are read once, when the finger lands; nothing reads layout
 * during the press. Activation stays the browser's click, which the arena
 * swallows for a touch a recognizer took.
 */

import {UIKIT_GESTURES} from '../motion/uikit/gestures';
import {timing} from '../motion/uikit/timing';
import {travel} from './geometry';
import type {GestureRecognizer} from './GestureRecognizer';
import type {TapGestureRecognizer} from './TapGestureRecognizer';
import type {GestureTouch, TouchConsumer} from './types';

export type ControlEvent =
  | 'touchDown'
  | 'touchDragInside'
  | 'touchDragOutside'
  | 'touchDragEnter'
  | 'touchDragExit'
  | 'touchUpInside'
  | 'touchUpOutside'
  | 'touchCancel';

export interface PressBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface PressTrackerOptions {
  /** The control's bounds in client px, read when a finger lands. */
  getBounds: () => PressBounds | null;
  /** The view the tracker belongs to; recognizers on it are not ancestors. */
  view?: unknown;
  onControlEvent?: (event: ControlEvent, touch: GestureTouch) => void;
  onHighlightChange?: (isHighlighted: boolean) => void;
  trackingExpansion?: number;
  /**
   * When the highlight waits `contentTouchDelay`: inside a scroller (a
   * control or a cell), always, or never. @default 'inScrollers'
   */
  highlightDelay?: PressHighlightDelay;
  /**
   * Travel (px) past which the press is cancelled for good, with no
   * re-highlight on the way back (a cell whose scroll view took the touch).
   * Unset, the finger is tracked in and out of the expanded bounds.
   */
  cancelTravel?: number;
  /**
   * How long a tap quicker than the delay shows the highlight at the lift,
   * ms; 0 highlights and releases at once. @default the quick-tap flash
   */
  quickTapFlash?: number;
  /** Which ancestor recognizers the control's own action beats. */
  vetoesAncestorRecognizer?: (recognizer: GestureRecognizer) => boolean;
  /** @default () => true */
  isEnabled?: () => boolean;
  /**
   * Whether this finger is braking a scroll it set moving (see
   * GestureHost.isScrollBraking): a native list highlights nothing for one,
   * and the control does not track it at all. Asked only for a finger: a
   * mouse or a pen never brakes (`spec:AST-094` FR11).
   */
  isBraking?: (touch: GestureTouch) => boolean;
}

const PRESS = UIKIT_GESTURES.press;

export type PressHighlightDelay = 'inScrollers' | 'always' | 'never';

/**
 * How a kind of pressable tracks a finger and how long its release takes.
 */
export interface PressProfile {
  readonly highlightDelay: PressHighlightDelay;
  readonly cancelTravel?: number;
  readonly quickTapFlash: number;
  /** The release (`fading`) clock a painter uses, ms. */
  readonly releaseMs: number;
}

export const PRESS_PROFILES = {
  /** UIControl: same-frame highlight outside scrollers, 70 pt tracking. */
  control: {
    highlightDelay: 'inScrollers',
    quickTapFlash: PRESS.quickTapFlash.value,
    // The shared press styles release every surface on the deselect clock
    // until a control runs its own release (UIButton's 250 ms), so a
    // painter's `fading` never outlasts the fade it shows.
    releaseMs: timing.press.highlightOutMs,
  },
  /**
   * A table or collection cell: inside a scroll view it highlights after the
   * content-touch delay, outside one at once (AST-094 FR11: the delay applies
   * only inside scroll views); cancelled by the scroll.
   */
  cell: {
    highlightDelay: 'inScrollers',
    cancelTravel: UIKIT_GESTURES.pan.hysteresis.value,
    quickTapFlash: 0,
    releaseMs: timing.press.highlightOutMs,
  },
} as const satisfies Record<string, PressProfile>;

export type PressProfileName = keyof typeof PRESS_PROFILES;

/**
 * UIButton's rule, the tracker's default ancestor veto: an ancestor's
 * single-finger single tap. A tap is told apart by its `kind`
 * (`architecture:react-component-runtime` INV13).
 */
export function vetoesSingleTap(recognizer: GestureRecognizer): boolean {
  if (recognizer.kind !== 'tap') {
    return false;
  }
  const tap = recognizer as TapGestureRecognizer;
  return tap.numberOfTapsRequired === 1 && tap.numberOfTouchesRequired === 1;
}

/**
 * A control's touch tracking, the gesture host's consumer for one element
 * (UIControl's `beginTracking` / `continueTracking` / `endTracking`): it
 * reports control events and the highlight. Built by
 * {@link createPressTracker}.
 */
export interface PressTracker extends TouchConsumer {
  /** Whether the control paints its pressed highlight now. */
  readonly isHighlighted: boolean;
  /** Whether a touch is being tracked. */
  readonly isTracking: boolean;
  /** Whether the tracked touch is inside the bounds plus the expansion. */
  readonly isTouchInside: boolean;
  /**
   * How far past its bounds a tracked touch still counts as inside, px; its
   * hook keeps it in step with the option.
   */
  trackingExpansion: number;
  /**
   * Whether the control takes touches now: a disabled one gives the host no
   * reason to listen (`spec:AST-094` FR24).
   */
  isEnabled(): boolean;
  allowsAncestorRecognizer(recognizer: unknown): boolean;
  /** Drop any highlight and timers (the control unmounted or was disabled). */
  dispose(): void;
}

/** Track a control's touches (see {@link PressTracker}). */
export function createPressTracker(options: PressTrackerOptions): PressTracker {
  let touchId: number | null = null;
  let bounds: PressBounds | null = null;
  let highlightTimer: ReturnType<typeof setTimeout> | null = null;
  let flashTimer: ReturnType<typeof setTimeout> | null = null;
  /** A pending highlight whose finger travelled: it will never paint. */
  let isPendingDead = false;

  const state = {
    isHighlighted: false,
    isTracking: false,
    isTouchInside: false,
  };
  const contains = (touch: GestureTouch): boolean => {
    if (bounds == null) {
      return true;
    }
    const margin = tracker.trackingExpansion;
    return (
      touch.x >= bounds.left - margin &&
      touch.x <= bounds.right + margin &&
      touch.y >= bounds.top - margin &&
      touch.y <= bounds.bottom + margin
    );
  };

  const emit = (event: ControlEvent, touch: GestureTouch): void => {
    options.onControlEvent?.(event, touch);
  };

  const setHighlighted = (value: boolean): void => {
    if (state.isHighlighted === value) {
      return;
    }
    state.isHighlighted = value;
    options.onHighlightChange?.(value);
  };

  const clearHighlightTimer = (): void => {
    if (highlightTimer != null) {
      clearTimeout(highlightTimer);
      highlightTimer = null;
    }
  };

  const clearFlash = (): void => {
    if (flashTimer != null) {
      clearTimeout(flashTimer);
      flashTimer = null;
    }
  };

  const finish = (): void => {
    touchId = null;
    state.isTracking = false;
    state.isTouchInside = false;
    bounds = null;
  };

  const touchCancelled = (touch: GestureTouch): void => {
    if (touch.id !== touchId) {
      return;
    }
    clearHighlightTimer();
    emit('touchCancel', touch);
    setHighlighted(false);
    finish();
  };

  const tracker: PressTracker = {
    get isHighlighted() {
      return state.isHighlighted;
    },
    get isTracking() {
      return state.isTracking;
    },
    get isTouchInside() {
      return state.isTouchInside;
    },
    trackingExpansion:
      options.trackingExpansion ??
      UIKIT_GESTURES.control.trackingExpansion.value,

    isEnabled(): boolean {
      return options.isEnabled?.() !== false;
    },

    touchBegan(touch: GestureTouch): void {
      if (
        touchId != null ||
        options.isEnabled?.() === false ||
        // The scroll brake is a finger's (`spec:AST-094` FR11, DEC-21).
        (touch.pointerType === 'touch' && options.isBraking?.(touch) === true)
      ) {
        return;
      }
      clearFlash();
      touchId = touch.id;
      bounds = options.getBounds();
      state.isTracking = true;
      state.isTouchInside = true;
      isPendingDead = false;
      emit('touchDown', touch);
      const delay = options.highlightDelay ?? 'inScrollers';
      const delays =
        touch.pointerType === 'touch' &&
        (delay === 'always' ||
          (delay === 'inScrollers' && touch.scroll?.isInsideScroller === true));
      if (delays) {
        highlightTimer = setTimeout(() => {
          highlightTimer = null;
          if (state.isTouchInside) {
            setHighlighted(true);
          }
        }, PRESS.contentTouchDelay.value);
      } else {
        setHighlighted(true);
      }
    },

    touchMoved(touch: GestureTouch): void {
      if (touch.id !== touchId) {
        return;
      }
      const cancelTravel = options.cancelTravel;
      if (cancelTravel != null && travel(touch) > cancelTravel) {
        // A cell's scroll view took the touch: the press is over.
        touchCancelled(touch);
        return;
      }
      if (highlightTimer != null && travel(touch) > PRESS.slop.value) {
        // A finger travelling before the delay ran out is scrolling: the
        // press it began never paints, as a flick on a list paints nothing.
        clearTimeout(highlightTimer);
        highlightTimer = null;
        isPendingDead = true;
      }
      const inside = contains(touch);
      if (inside !== state.isTouchInside) {
        state.isTouchInside = inside;
        emit(inside ? 'touchDragEnter' : 'touchDragExit', touch);
        if (highlightTimer == null && !isPendingDead) {
          setHighlighted(inside);
        }
      }
      emit(inside ? 'touchDragInside' : 'touchDragOutside', touch);
    },

    touchEnded(touch: GestureTouch): void {
      if (touch.id !== touchId) {
        return;
      }
      const inside = contains(touch);
      const wasPending = highlightTimer != null;
      clearHighlightTimer();
      emit(inside ? 'touchUpInside' : 'touchUpOutside', touch);
      const flash = options.quickTapFlash ?? PRESS.quickTapFlash.value;
      if (wasPending && inside) {
        // Quicker than the delay: the highlight shows at the lift, for the
        // flash, or (a cell) straight into the release.
        setHighlighted(true);
        if (flash > 0) {
          flashTimer = setTimeout(() => {
            flashTimer = null;
            setHighlighted(false);
          }, flash);
        } else {
          setHighlighted(false);
        }
      } else {
        setHighlighted(false);
      }
      finish();
    },

    touchCancelled,

    allowsAncestorRecognizer(recognizer: unknown): boolean {
      const candidate = recognizer as GestureRecognizer;
      if (candidate.view != null && candidate.view === options.view) {
        return true;
      }
      const vetoes = options.vetoesAncestorRecognizer ?? vetoesSingleTap;
      return !vetoes(candidate);
    },

    dispose(): void {
      clearHighlightTimer();
      clearFlash();
      setHighlighted(false);
      finish();
    },
  };
  return tracker;
}
