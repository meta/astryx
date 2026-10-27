// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useToastBannerSwipe.ts
 * @input Uses the Toast card's root ref, a resolved Toast edge direction,
 *   timer pause/resume hooks, dismissal callback, enabled state,
 *   interactive-descendant policy, the UIKit constants table
 *   (motion/uikit/toast), the shared gesture system and the compositor
 *   animator
 * @output Attaches a PanGestureRecognizer to the card that drives
 *   swipe-to-dismiss and an animator that moves the card; returns
 *   `retract`, the exit every dismissal under a finger plays, and `rest`
 * @position Toast's touch layer: its one module of touch-only work (the
 *   gesture system, the compositor animator, the motion table), imported
 *   only by Toast.tsx; live under a coarse primary pointer
 *   (useTouchPresentation), inert with a fine pointer, where useToastGesture
 *   runs
 *
 * Under a finger (a coarse primary pointer: one touch model on every touch
 * device, iOS and Android alike), the swipe follows iOS's notification banner
 * (values and sources in motion/uikit/toast.ts). With a fine pointer Toast
 * keeps its own swipe (useToastGesture):
 *
 * - it is a one-way pan toward the Toast's edge, for touch and pen (a mouse
 *   keeps text selection), on the shared gesture system (../gestures). It
 *   begins, and takes the touch from the browser, at UIKit's pan hysteresis
 *   toward the edge when the drag is `toast.axisRatio` times more vertical
 *   than horizontal; nothing claims the touch earlier (a pan starts at
 *   10 pt). A drag that starts sideways or away from the edge, or turns back
 *   before then, fails it and leaves the browser the touch. Once it began,
 *   the touch stays the toast's: a second finger landing anywhere leaves the
 *   swipe going (spec:AST-094 FR10), while a second finger before it began
 *   fails it, so two fingers stay the page's pinch zoom;
 * - the card stays still for the first `toast.followFrom` px of finger
 *   travel, then follows at `toast.followRatio` of the finger, writing only
 *   its translation (no render, no layout read). A drag that turns back away
 *   from the edge after the swipe took the touch stretches the card that way
 *   too, as the banner does, and its release always springs it back;
 * - on release, the card dismisses if it is `toast.dismissOffset` out, or
 *   if it is at or past rest and the finger was moving toward the edge at
 *   `toast.flickVelocity` when it lifted, by the shared release filter
 *   (`isDismissRelease`): it calls `dismiss`. A card stretched away from
 *   the edge always springs back. Otherwise the card springs
 *   back to rest on the compositor, handed its release velocity, on
 *   `springs.settle` (the `spec:AST-094` FR4 row the banner's measured
 *   settle matches, imported alone); a release moving back toward rest
 *   always springs back (FR37);
 * - `retract` is how the card leaves, whatever dismissed it (a release, the
 *   close button, the timeout): from where it is, it slides past its edge on
 *   the compositor over `toast.exitMs` on `toast.exitCurve` (constants),
 *   starting at the card's release velocity after a dismissing release
 *   (FR38),
 *   without fading, as the banner retracts. It starts in the call (an input
 *   event or the timer), so no render can delay it, calls `onRetract` (the
 *   row stops clipping the card) and resolves when the card is gone; `rest`
 *   brings back a card its owner kept on screen after the dismissal;
 * - under reduced motion the animator replaces travel with its cross-fade
 *   (`design:reduced-motion`; a release is a touch release): the
 *   spring-back lands at rest and fades in, the retract fades out in place;
 * - while the card springs back or retracts, touches pass through to the
 *   page: the banner never catches a settling or leaving card;
 * - touching down pauses the auto-hide timer; anything but a dismissal
 *   resumes it.
 *
 * With a fine pointer the recognizer takes no touches and the animator is
 * detached, so the card is useToastGesture's alone: its own pan on the same
 * card. The host writes the card's touch-action for whichever of the two is
 * enabled (a disabled recognizer leaves the browser everything, FR24), so
 * both let it manage the card's style.
 *
 * SYNC: When modified, update toastSwipe.ts, Toast.doc.mjs and the finger swipe
 *   tests in ToastViewport.test.tsx and
 *   __tests__/ToastSwipe.interaction.browser.spec.ts.
 */

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {RefObject} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {PanGestureRecognizer} from '../gestures/PanGestureRecognizer';
import {useGestureRecognizer} from '../gestures/useGestureRecognizer';
import {createAnimator, type MotionHandle} from '../motion/animator';
import {SETTLE_SPRING} from '../motion/uikit/springs';
import {toast} from '../motion/uikit/toast';
import {
  followOffset,
  isDismissRelease,
  retractCurve,
  retractTarget,
} from './toastSwipe';
import type {ToastGestureDirection} from './useToastGesture';

interface SwipeSession {
  pausedTimer: boolean;
  /** Where the card is now, px from rest toward the edge. */
  offset: number;
}

export interface UseToastBannerSwipeOptions {
  /** The Toast card. */
  rootRef: RefObject<HTMLDivElement | null>;
  /**
   * The notification presentation (under a finger, or `presentation="notification"`):
   * this hook owns the swipe and the exit.
   */
  isNotification: boolean;
  /**
   * The notification presentation on every device (`presentation=
   * "notification"`): the gesture host listens where the primary pointer is
   * fine too, and the pan still takes only a finger or a pen.
   */
  isForced: boolean;
  direction: ToastGestureDirection;
  enabled: boolean;
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

function panDirection(direction: ToastGestureDirection): 'down' | 'up' {
  return direction === 1 ? 'down' : 'up';
}

export function useToastBannerSwipe(
  options: UseToastBannerSwipeOptions,
): ToastBannerSwipeHandle {
  const {rootRef, isNotification} = options;
  const sessionRef = useRef<SwipeSession | null>(null);
  const settlingRef = useRef<MotionHandle | null>(null);
  const retractingRef = useRef<Promise<void> | null>(null);
  /** The next retract follows a release (a touch release, for Reduced Motion). */
  const releasedRef = useRef(false);
  /** The card's speed toward its edge at a dismissing release (px/s). */
  const releaseVelocityRef = useRef(0);
  const optionsRef = useRef(options);
  useIsomorphicLayoutEffect(() => {
    optionsRef.current = options;
  });
  const [animator] = useState(() => createAnimator(null));
  useIsomorphicLayoutEffect(() => {
    // Attached while under a finger, not for `enabled`: a swiped card keeps
    // its translation through the exit. The card moves by `translate` every
    // frame, so it gets its own layer.
    const root = isNotification ? rootRef.current : null;
    animator.attach(root);
    root?.style.setProperty('will-change', 'translate');
    return () => {
      animator.attach(null);
      root?.style.removeProperty('will-change');
    };
  }, [animator, isNotification, rootRef]);

  const pan = useGestureRecognizer(
    rootRef,
    () =>
      new PanGestureRecognizer({
        // The published name app code relates to (gesture delegates).
        name: 'Toast.swipe',
        direction: panDirection(options.direction),
        allowedPointerTypes: ['touch', 'pen'],
        axisRatio: toast.axisRatio,
        maximumNumberOfTouches: 1,
        shouldReceiveTouch: (_recognizer, touch) => {
          const root = rootRef.current;
          const current = optionsRef.current;
          if (
            root == null ||
            settlingRef.current != null ||
            retractingRef.current != null ||
            current.shouldIgnoreTarget(touch.target as EventTarget, root)
          ) {
            return false;
          }
          if (sessionRef.current == null) {
            // Touch-down: hold the auto-hide timer while the finger is on
            // the card.
            const pausedTimer =
              current.canPauseTimer && !current.isTimerPaused();
            if (pausedTimer) {
              current.pauseTimer();
            }
            sessionRef.current = {pausedTimer, offset: 0};
          }
          return true;
        },
      }),
    undefined,
    {
      isEnabled: isNotification && options.enabled,
      // One setting per element, shared with useToastGesture's pan.
      manageStyle: true,
      perEventPointer: options.isForced,
    },
  );

  useIsomorphicLayoutEffect(() => {
    pan.setDirection(panDirection(options.direction));
  }, [pan, options.direction]);

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
          session.offset = followOffset(fingerTravel);
          animator.set({y: session.offset * direction});
          return;
        }
        if (to !== 'ended' && to !== 'cancelled' && to !== 'failed') {
          return;
        }
        sessionRef.current = null;
        const fingerVelocity = recognizer.velocity().y * direction;
        if (
          to === 'ended' &&
          isDismissRelease(session.offset, fingerVelocity)
        ) {
          // The retract starts in this call and continues the card's speed
          // (the follow ratio of the finger's, spec:AST-094 FR38).
          releasedRef.current = true;
          releaseVelocityRef.current = fingerVelocity * toast.followRatio;
          dismiss();
          releasedRef.current = false;
          return;
        }
        if (session.offset !== 0) {
          // The card moves at the follow ratio of the finger, so it hands on
          // that share of the finger's speed (none if the touch was taken
          // away).
          const velocity =
            to === 'ended' ? fingerVelocity * toast.followRatio : 0;
          // Under reduced motion the animator replaces the spring with a
          // cross-fade (a touch release): the card lands at rest and fades in.
          const handle = animator.animate(
            {y: 0},
            {spring: SETTLE_SPRING, velocity: {y: velocity * direction}},
            {crossfadeAs: 'entrance', touchRelease: true},
          );
          settlingRef.current = handle;
          void handle.finished.then(() => {
            if (settlingRef.current === handle) {
              settlingRef.current = null;
            }
          });
        }
        if (session.pausedTimer) {
          resumeTimer();
        }
      }),
    [animator, pan],
  );

  // Everything before the first await runs in the call, so the retract starts
  // in the input event or the timer that asked for it.
  const retract = useCallback(async (): Promise<void> => {
    if (retractingRef.current != null) {
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
    settlingRef.current = null;
    const from = animator.get('y');
    const to = retractTarget(
      box,
      view.innerHeight,
      optionsRef.current.direction,
    );
    optionsRef.current.onRetract?.();
    // Under reduced motion the animator replaces the slide with a cross-fade:
    // the card fades out where it is.
    const touchRelease = releasedRef.current;
    const handle = animator.play(
      {
        y: retractCurve(
          from,
          to,
          toast.exitMs,
          toast.exitCurve,
          // After a dismissing release: the card's speed toward its edge.
          touchRelease
            ? releaseVelocityRef.current * optionsRef.current.direction
            : undefined,
        ),
      },
      {crossfadeAs: 'exit', touchRelease},
    );
    retractingRef.current = handle.finished.then(() => undefined);
    await retractingRef.current;
  }, [animator, rootRef]);

  const rest = useCallback(() => {
    retractingRef.current = null;
    animator.set({y: 0, opacity: 1});
  }, [animator]);

  return useMemo(() => ({retract, rest}), [retract, rest]);
}
