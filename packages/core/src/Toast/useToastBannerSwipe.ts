// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useToastBannerSwipe.ts
 * @input The Toast card's root ref, edge, timer hooks and dismissal callback
 * @output Under a finger, the banner swipe (motion/uikit/toast), the catch,
 *   and `retract`, the exit every dismissal plays; also `followOffset`,
 *   `isDismissRelease`, `retractTarget` and `retractCurve`
 * @position Toast's touch layer, used only by Toast.tsx; inert with a fine
 *   pointer
 *
 * SYNC: When modified, update Toast.doc.mjs, toastSwipe.test.ts,
 *   ToastViewport.test.tsx, __tests__/ToastCatch.interaction.browser.spec.ts
 *   and __tests__/ToastSwipeScroll.interaction.browser.spec.ts.
 */

import {useCallback, useEffect, useMemo, useRef} from 'react';
import type {RefObject} from 'react';
import {useCommittedRef} from '../hooks/useCommittedRef';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {PanGestureRecognizer} from '../gestures/PanGestureRecognizer';
import {useGestureRecognizer} from '../gestures/useGestureRecognizer';
import {
  animatorFor,
  type MotionCurve,
  type MotionHandle,
} from '../motion/animator';
import {cubicBezier, type BezierPoints} from '../motion/bezier';
import {SETTLE_SPRING} from '../motion/uikit/springs';
import {toast} from '../motion/uikit/toast';
import {lockSelection} from '../utils/selectionLock';
import type {ToastGestureDirection} from './useToastGesture';

interface SwipeSession {
  pausedTimer: boolean;
  /** Where the card is now, px from rest toward the edge. */
  offset: number;
  /** Where the finger caught the card, px from rest toward the edge. */
  caughtAt: number;
  /**
   * Ends the session's hold on text selection. A finger that caught the card
   * holds it from touch-down, any other once the swipe claims the touch. A
   * still hold on a resting card selects text as usual.
   */
  releaseSelection: (() => void) | null;
}

/** A retract in flight: where the card ends, and what its callers wait on. */
interface Exit {
  to: number;
  done: () => void;
}

export interface UseToastBannerSwipeOptions {
  /** The Toast card. */
  rootRef: RefObject<HTMLDivElement | null>;
  /** Under a finger (a coarse primary pointer): this hook owns the swipe and the exit. */
  isNotification: boolean;
  direction: ToastGestureDirection;
  canPauseTimer: boolean;
  isTimerPaused: () => boolean;
  pauseTimer: () => void;
  resumeTimer: () => void;
  dismiss: () => void;
  /** Called when the card starts to retract: its row must not clip it. */
  onRetract?: () => void;
  shouldIgnoreTarget: (
    target: EventTarget | null,
    root: HTMLElement,
  ) => boolean;
}

/** What the Toast asks of its card under a finger. */
export interface ToastBannerSwipeHandle {
  /** Slides the card past its edge; resolves when it is gone. */
  retract: () => Promise<void>;
  /** Puts a retracted card back at rest, ready to leave again. */
  rest: () => void;
}

// The swipe's math, unit-tested on the recorded banner releases. Distances are
// CSS px from rest toward the toast's edge: up for a top toast, down for a
// bottom toast. So they are positive in both placements. Velocities are px/s
// in the same direction.

/**
 * Where the card sits for a finger that travelled `fingerTravel` since
 * touch-down, positive toward the edge and negative away from it. The card
 * stays still until `toast.followFrom`, then moves at `toast.followRatio` of
 * the finger, either way. Away from the edge the card only stretches: a
 * release there always springs it back (`isDismissRelease`).
 */
export function followOffset(fingerTravel: number): number {
  const past = Math.abs(fingerTravel) - toast.followFrom;
  if (past <= 0) {
    return 0;
  }
  return Math.sign(fingerTravel) * toast.followRatio * past;
}

/**
 * Whether a release dismisses. It does when the card is at least
 * `toast.dismissOffset` out. It also does when the card is at or past rest
 * and the finger moved toward the edge at `toast.flickVelocity` or faster as
 * it lifted. The speed is the shared release filter's, which reads no speed
 * for a finger that rested before the lift. A release moving back toward
 * rest never dismisses, however far out the card is: the banner springs back
 * after a drag that turns back. A card stretched away from the edge always
 * springs back, however fast the finger flicks it back.
 */
export function isDismissRelease(offset: number, velocity: number): boolean {
  if (velocity < 0) {
    return false;
  }
  return (
    offset >= toast.dismissOffset ||
    (offset >= 0 && velocity >= toast.flickVelocity)
  );
}

/** How far past its edge a retracting card ends: clear of its shadow. */
export const RETRACT_CLEARANCE = 16;

/**
 * Where a retracting card ends, as its translation (px, down positive):
 * fully past its edge. `box` is the card's untranslated box in viewport px;
 * `direction` is 1 for a bottom toast, -1 for a top one.
 */
export function retractTarget(
  box: {readonly top: number; readonly bottom: number},
  viewportHeight: number,
  direction: 1 | -1,
): number {
  return direction === -1
    ? -(box.bottom + RETRACT_CLEARANCE)
    : viewportHeight - box.top + RETRACT_CLEARANCE;
}

/**
 * The retract as a curve the animator plays: from `from` to `to` (px) over
 * `durationMs` on the timing curve `points`. After a dismissing release,
 * `releaseVelocity` is the card's speed at the lift, in px/s on the axis of
 * `from` and `to`. The retract starts at that speed. The curve's first
 * control point sets the initial slope. A release faster than the curve can
 * start carries the card out sooner instead of overshooting. Without a
 * release (the close button, the timeout, the app's dismiss), it plays the
 * banner's fitted curve.
 */
export function retractCurve(
  from: number,
  to: number,
  durationMs: number,
  points: BezierPoints,
  releaseVelocity?: number,
): MotionCurve {
  let duration = Math.max(durationMs, 1) / 1000;
  let curvePoints = points;
  const distance = to - from;
  if (releaseVelocity != null && distance !== 0 && points[0] > 0) {
    // The curve's initial slope is y1 / x1 (progress per unit of time
    // fraction); the card's initial speed is distance × slope / duration.
    const [x1, , x2, y2] = points;
    const speed = Math.max(0, releaseVelocity / distance);
    let y1 = x1 * speed * duration;
    if (y1 > 1) {
      // y1 above 1 would overshoot the target: shorten the retract so the
      // curve can start at the release speed with y1 = 1.
      duration = 1 / (x1 * speed);
      y1 = 1;
    }
    curvePoints = [x1, y1, x2, y2];
  }
  const ease = cubicBezier(curvePoints);
  const progress = (t: number) => Math.min(1, Math.max(0, t / duration));
  const at = (t: number) => from + (to - from) * ease(progress(t));
  const step = duration / 1000;
  return {
    duration,
    at,
    velocity: t => {
      const a = Math.max(0, t - step);
      const b = Math.min(duration, t + step);
      return (at(b) - at(a)) / (b - a);
    },
  };
}

function panDirection(direction: ToastGestureDirection): 'down' | 'up' {
  return direction === 1 ? 'down' : 'up';
}

/**
 * Turns the card's stylesheet transitions off. They run its entrance. Once the
 * touch layer moves the card, they would replay its fades: WebKit restarts the
 * opacity transition when a Reduce Motion dip hands the opacity back. Under a
 * finger nothing else transitions the card.
 */
function stillTransitions(root: HTMLElement): void {
  root.style.setProperty('transition-property', 'none');
}

export function useToastBannerSwipe(
  options: UseToastBannerSwipeOptions,
): ToastBannerSwipeHandle {
  const {rootRef, isNotification} = options;
  const sessionRef = useRef<SwipeSession | null>(null);
  const settlingRef = useRef<MotionHandle | null>(null);
  const retractingRef = useRef<Promise<void> | null>(null);
  const exitRef = useRef<Exit | null>(null);
  const exitHandleRef = useRef<MotionHandle | null>(null);
  /** The next retract follows a release (a touch release, for Reduced Motion). */
  const releasedRef = useRef(false);
  /** The card's speed toward its edge at a dismissing release (px/s). */
  const releaseVelocityRef = useRef(0);
  // The recognizer's callbacks read the newest committed options.
  const optionsRef = useCommittedRef(options);
  // The card's one animator, shared with anything else that moves it. Only
  // this hook calls it, and only under a finger, so with a fine pointer the
  // card is useToastGesture's alone.
  const cardAnimator = useCallback(() => {
    const root = rootRef.current;
    return root == null ? null : animatorFor(root);
  }, [rootRef]);
  useIsomorphicLayoutEffect(() => {
    // Under a finger the card moves by `translate` on every frame of a drag,
    // so it keeps its own layer and no move repaints it.
    const root = isNotification ? rootRef.current : null;
    root?.style.setProperty('will-change', 'translate');
    return () => {
      root?.style.removeProperty('will-change');
      // With a fine pointer the stylesheet's transitions run the card again.
      root?.style.removeProperty('transition-property');
    };
  }, [isNotification, rootRef]);

  const pan = useGestureRecognizer(
    rootRef,
    () =>
      new PanGestureRecognizer({
        // The published name app code relates to (gesture delegates).
        name: 'Toast.swipe',
        direction: panDirection(options.direction),
        allowedPointerTypes: ['touch', 'pen'],
        axisRatio: toast.axisRatio,
        // The browser decides a touch on its first move, so the pan decides
        // there too.
        firstMoveDecides: true,
        maximumNumberOfTouches: 1,
        shouldReceiveTouch: (_recognizer, touch) => {
          const root = rootRef.current;
          const current = optionsRef.current;
          if (
            root == null ||
            current.shouldIgnoreTarget(touch.target as EventTarget, root)
          ) {
            return false;
          }
          if (sessionRef.current == null) {
            const isLeaving = exitRef.current != null;
            const animator = cardAnimator();
            let caughtAt = 0;
            let releaseSelection: (() => void) | null = null;
            if (
              animator != null &&
              (isLeaving || settlingRef.current != null)
            ) {
              // The finger catches a moving card where it shows.
              stillTransitions(root);
              caughtAt = animator.get('y') * current.direction;
              animator.stop();
              settlingRef.current = null;
              releaseSelection = lockSelection(
                [root],
                touch.target as EventTarget | null,
              );
            }
            // Touch-down: hold the auto-hide timer while the finger is on
            // the card. A leaving card's toast is already dismissed.
            const pausedTimer =
              !isLeaving && current.canPauseTimer && !current.isTimerPaused();
            if (pausedTimer) {
              current.pauseTimer();
            }
            sessionRef.current = {
              pausedTimer,
              offset: caughtAt,
              caughtAt,
              releaseSelection,
            };
          }
          return true;
        },
      }),
    undefined,
    {
      isEnabled: isNotification,
      manageStyle: isNotification,
    },
  );

  // Slides the card from where it shows to the end of its exit. After a
  // release, `velocity` is the card's speed toward its edge (px/s).
  const playExit = useCallback(
    (velocity: number | undefined, touchRelease: boolean) => {
      const exit = exitRef.current;
      const animator = cardAnimator();
      if (exit == null || animator == null) {
        return;
      }
      // Under reduced motion the animator replaces the slide with a
      // cross-fade: the card fades out where it is.
      const handle = animator.play(
        {
          y: retractCurve(
            animator.get('y'),
            exit.to,
            toast.exitMs,
            toast.exitCurve,
            velocity == null
              ? undefined
              : velocity * optionsRef.current.direction,
          ),
        },
        {crossfadeAs: 'exit', touchRelease},
      );
      exitHandleRef.current = handle;
      void handle.finished.then(isFinished => {
        if (exitHandleRef.current === handle) {
          exitHandleRef.current = null;
        }
        // A finger that catches the card stops the curve. Its release plays
        // the exit again, and only an exit that ends lets the card go.
        if (isFinished && exitRef.current === exit) {
          exitRef.current = null;
          exit.done();
        }
      });
    },
    [cardAnimator, optionsRef],
  );

  // Keeps the pan recognizer, which lives outside React, heading toward the
  // toast's edge.
  useIsomorphicLayoutEffect(() => {
    pan.setDirection(panDirection(options.direction));
  }, [pan, options.direction]);

  // Subscribes to the pan recognizer's state changes, which drive the card.
  useEffect(
    () =>
      pan.addTransitionListener((recognizer, _from, to) => {
        const session = sessionRef.current;
        if (session == null) {
          return;
        }
        const {direction, dismiss, resumeTimer} = optionsRef.current;
        // Finger travel toward the edge since touch-down, hysteresis
        // included: the card's dead zone is measured from where it landed.
        const fingerTravel = recognizer.totalTranslation().y * direction;
        if (to === 'began' || to === 'changed') {
          const root = rootRef.current;
          if (to === 'began' && root != null) {
            stillTransitions(root);
          }
          if (session.releaseSelection == null && root != null) {
            session.releaseSelection = lockSelection([root], null);
          }
          session.offset = session.caughtAt + followOffset(fingerTravel);
          cardAnimator()?.set({y: session.offset * direction});
          return;
        }
        if (to !== 'ended' && to !== 'cancelled' && to !== 'failed') {
          return;
        }
        session.releaseSelection?.();
        sessionRef.current = null;
        const fingerVelocity = recognizer.velocity().y * direction;
        if (exitRef.current != null) {
          // The toast was dismissed before the lift, so the card leaves from
          // where the finger lets it go, at its speed toward the edge.
          playExit(
            to === 'ended' && fingerVelocity > 0
              ? fingerVelocity * toast.followRatio
              : undefined,
            to === 'ended',
          );
          return;
        }
        if (
          to === 'ended' &&
          isDismissRelease(session.offset, fingerVelocity)
        ) {
          // The retract starts in this call and continues the card's speed,
          // the follow ratio of the finger's.
          releasedRef.current = true;
          releaseVelocityRef.current = fingerVelocity * toast.followRatio;
          dismiss();
          releasedRef.current = false;
          return;
        }
        if (session.offset !== 0) {
          // The card moves at the follow ratio of the finger, so it hands on
          // that share of the finger's speed. A touch taken away hands on none.
          const velocity =
            to === 'ended' ? fingerVelocity * toast.followRatio : 0;
          // Under reduced motion the animator replaces the spring with a
          // cross-fade (a touch release): the card lands at rest and fades in.
          const handle = cardAnimator()?.animate(
            {y: 0},
            {spring: SETTLE_SPRING, velocity: {y: velocity * direction}},
            {crossfadeAs: 'entrance', touchRelease: true},
          );
          if (handle != null) {
            settlingRef.current = handle;
            void handle.finished.then(() => {
              if (settlingRef.current === handle) {
                settlingRef.current = null;
              }
            });
          }
        }
        if (session.pausedTimer) {
          resumeTimer();
        }
      }),
    [cardAnimator, optionsRef, pan, playExit, rootRef],
  );

  // Everything before the first await runs in the call, so the retract starts
  // in the input event or the timer that asked for it.
  const retract = useCallback(async (): Promise<void> => {
    if (retractingRef.current != null) {
      // An exit that nothing plays and no finger holds plays again.
      if (exitHandleRef.current == null && sessionRef.current == null) {
        playExit(undefined, false);
      }
      await retractingRef.current;
      return;
    }
    const root = rootRef.current;
    // The untranslated box: the card's wrapper never moves with it.
    const box = root?.parentElement?.getBoundingClientRect();
    const view = root?.ownerDocument.defaultView;
    if (root == null || box == null || view == null) {
      return;
    }
    stillTransitions(root);
    settlingRef.current = null;
    const to = retractTarget(
      box,
      view.innerHeight,
      optionsRef.current.direction,
    );
    optionsRef.current.onRetract?.();
    let done = () => {};
    retractingRef.current = new Promise<void>(resolve => {
      done = resolve;
    });
    exitRef.current = {to, done};
    // A finger on the card holds it, and its release plays the exit. After a
    // dismissing release: the card's speed toward its edge.
    if (sessionRef.current == null) {
      const touchRelease = releasedRef.current;
      playExit(
        touchRelease ? releaseVelocityRef.current : undefined,
        touchRelease,
      );
    }
    await retractingRef.current;
  }, [optionsRef, playExit, rootRef]);

  const rest = useCallback(() => {
    const exit = exitRef.current;
    exitRef.current = null;
    retractingRef.current = null;
    exit?.done();
    cardAnimator()?.set({y: 0, opacity: 1});
  }, [cardAnimator]);

  return useMemo(() => ({retract, rest}), [retract, rest]);
}
