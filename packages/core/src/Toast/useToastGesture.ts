// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useToastGesture.ts
 * @input Uses a resolved Toast edge direction, timer pause/resume hooks,
 *   dismissal callback, enabled state, and interactive-descendant policy
 * @output Returns the Toast card root ref; the swipe is a pan on the shared
 *   gesture host
 * @position Internal Toast gesture unit; attached to the Toast card root
 *
 * Toast's own swipe, wherever the banner swipe does not apply (a fine primary
 * pointer, or `presentation="toast"`): a finger, a pen or a mouse moves the
 * card 1:1 toward its edge and fades it a little. A release toward the edge dismisses
 * when it travelled past max(40% of the card's height, 48 px), or when it was
 * a flick: moving toward the edge faster than 1.2 px/ms when it lifted, at
 * any travel, by the pan's release velocity (the shared VelocityTracker, read
 * at the lift, so a contact that rested before lifting reads no speed).
 * Without that, a one-line toast (40% of which is below the 48 px floor)
 * could only be dragged away, never flicked.
 *
 * The swipe is a PanGestureRecognizer on the shared gesture host
 * (`spec:AST-094` FR43, FR24): it takes every pointer and a trackpad's
 * scroll (not a mouse wheel's notches), and once it claims a mouse or a pen
 * drag the host clears and holds off text selection (FR41); it
 * begins at the pan's 10 pt toward the edge (FR17), a second finger never ends
 * a swipe that began (FR10), and a drag sideways or away from the edge stays
 * the page's.
 */

import {useEffect, useRef} from 'react';
import type {RefObject} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {PanGestureRecognizer} from '../gestures/PanGestureRecognizer';
import {useGestureRecognizer} from '../gestures/useGestureRecognizer';

const SWIPE_DISMISS_RATIO = 0.4;
/** The dismiss distance of a card too short for its height ratio to reach it. */
const SWIPE_DISMISS_MIN_DISTANCE = 48;
/** Speed toward the edge, px/ms, at which a release dismisses whatever its travel. */
const FLICK_VELOCITY = 1.2;
/** How much more vertical than horizontal a drag must be to swipe the card. */
const VERTICAL_INTENT_RATIO = 1.2;
const SWIPE_EXIT_DISTANCE = '120%';
const SWIPE_ACTIVE_FADE_MAX = 0.4;
const SWIPE_ACTIVE_SCALE_MAX = 0.02;

export type ToastGestureDirection = 1 | -1;

interface UseToastGestureOptions {
  direction: ToastGestureDirection;
  enabled: boolean;
  canPauseTimer: boolean;
  isTimerPaused: () => boolean;
  pauseTimer: () => void;
  resumeTimer: () => void;
  dismiss: () => void;
  shouldIgnoreTarget: (
    target: EventTarget | null,
    root: HTMLElement,
  ) => boolean;
}

interface UseToastGestureResult {
  rootRef: RefObject<HTMLDivElement | null>;
}

/** One contact on the card, from touch-down to its release. */
interface SwipeSession {
  pausedTimer: boolean;
  surfaceSize: number;
  dismissThreshold: number;
}

function swipeProgressValue(travel: number, surfaceSize: number): number {
  return Math.min(Math.max(travel / surfaceSize, 0), 1);
}

function clearTransientStyles(root: HTMLElement): void {
  root.style.removeProperty('transition-duration');
  root.style.removeProperty('--_toast-swipe-y');
  root.style.removeProperty('--_toast-swipe-exit-y');
  root.style.removeProperty('--_toast-swipe-opacity');
  root.style.removeProperty('--_toast-swipe-scale');
}

function panDirection(direction: ToastGestureDirection): 'down' | 'up' {
  return direction === 1 ? 'down' : 'up';
}

export function useToastGesture(
  options: UseToastGestureOptions,
): UseToastGestureResult {
  const rootRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef(options);
  useIsomorphicLayoutEffect(() => {
    optionsRef.current = options;
  });
  const sessionRef = useRef<SwipeSession | null>(null);

  const pan = useGestureRecognizer(
    rootRef,
    () =>
      new PanGestureRecognizer({
        // The published name app code relates to (gesture delegates); the
        // banner swipe carries it where that presentation applies.
        name: 'Toast.swipe',
        direction: panDirection(options.direction),
        // A trackpad's scroll moves the card as a finger does (FR43). A
        // mouse wheel's notches stay the page's: one notch is past the dismiss
        // distance, so any page scroll that crossed the card would dismiss it.
        allowedScrollTypes: ['continuous'],
        axisRatio: VERTICAL_INTENT_RATIO,
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
            // Touch-down: hold the auto-hide timer while the contact is on
            // the card.
            const pausedTimer =
              current.canPauseTimer && !current.isTimerPaused();
            if (pausedTimer) {
              current.pauseTimer();
            }
            const surfaceSize = Math.max(
              root.getBoundingClientRect().height,
              1,
            );
            sessionRef.current = {
              pausedTimer,
              surfaceSize,
              dismissThreshold: Math.max(
                surfaceSize * SWIPE_DISMISS_RATIO,
                SWIPE_DISMISS_MIN_DISTANCE,
              ),
            };
          }
          return true;
        },
      }),
    undefined,
    // The host writes the card's touch-action for the enabled pan (a touch
    // screen's finger, FR18); one setting per element, shared with the
    // banner swipe's.
    {isEnabled: options.enabled, manageStyle: true},
  );

  useIsomorphicLayoutEffect(() => {
    pan.setDirection(panDirection(options.direction));
  }, [pan, options.direction]);

  useEffect(
    () =>
      pan.addTransitionListener((recognizer, _from, to) => {
        const session = sessionRef.current;
        const root = rootRef.current;
        if (session == null || root == null) {
          return;
        }
        const {direction, dismiss, resumeTimer} = optionsRef.current;
        // Travel toward the edge since touch-down, the pan's 10 pt included.
        const travel = Math.max(0, recognizer.totalTranslation().y * direction);
        if (to === 'began' || to === 'changed') {
          if (to === 'began') {
            root.style.setProperty('transition-duration', '0s');
          }
          const progress = swipeProgressValue(travel, session.surfaceSize);
          root.style.setProperty('--_toast-swipe-y', `${travel * direction}px`);
          root.style.setProperty(
            '--_toast-swipe-opacity',
            (1 - progress * SWIPE_ACTIVE_FADE_MAX).toFixed(3),
          );
          root.style.setProperty(
            '--_toast-swipe-scale',
            (1 - progress * SWIPE_ACTIVE_SCALE_MAX).toFixed(3),
          );
          return;
        }
        if (to !== 'ended' && to !== 'cancelled' && to !== 'failed') {
          return;
        }
        sessionRef.current = null;
        // Toward the edge, px/ms, read at the lift: a contact that rested
        // longer than the stillness interval before lifting reads no speed
        // (AST-100 FR2). A flick needs no minimum travel of its own: the
        // swipe already had to pass the pan's 10 pt toward the edge.
        const velocity = (recognizer.velocity().y * direction) / 1000;
        clearTransientStyles(root);
        if (
          to === 'ended' &&
          (travel >= session.dismissThreshold || velocity > FLICK_VELOCITY)
        ) {
          // The exit animation owns the final translation; the live-drag
          // transform, fade and scale are cleared first so a standalone
          // Toast does not stay partly translated or faded after its
          // dismiss callback fires.
          root.style.setProperty(
            '--_toast-swipe-exit-y',
            direction === 1
              ? SWIPE_EXIT_DISTANCE
              : `calc(-1 * ${SWIPE_EXIT_DISTANCE})`,
          );
          dismiss();
          return;
        }
        if (session.pausedTimer) {
          resumeTimer();
        }
      }),
    [pan],
  );

  return {rootRef};
}
