// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useToastGesture.ts
 * @input Uses a resolved Toast edge direction, timer pause/resume hooks,
 *   dismissal callback, enabled state, and interactive-descendant policy
 * @output Returns the Toast card root ref and touch/pen gesture bindings
 * @position Internal Toast gesture unit; attached to the Toast card root
 *
 * A release toward the edge dismisses when it travelled past
 * max(40% of the card's height, 48 px), or when it was a flick: faster than
 * 1.2 px/ms on average, at any travel, timed by the input events themselves.
 * Without that, a one-line toast (40% of which is below the 48 px floor)
 * could only be dragged away, never flicked.
 */

import {useCallback, useEffect, useRef} from 'react';
import type {PointerEvent as ReactPointerEvent, RefObject} from 'react';

const DRAG_PROMOTION_SLOP = 8;
const SWIPE_DISMISS_RATIO = 0.4;
/** The dismiss distance of a card too short for its height ratio to reach it. */
const SWIPE_DISMISS_MIN_DISTANCE = 48;
/** Average speed, px/ms, at which a release dismisses whatever its travel. */
const FLICK_VELOCITY = 1.2;
const VERTICAL_INTENT_RATIO = 1.2;
const SWIPE_EXIT_DISTANCE = '120%';
const SWIPE_ACTIVE_FADE_MAX = 0.4;
const SWIPE_ACTIVE_SCALE_MAX = 0.02;

export type ToastGestureDirection = 1 | -1;

interface GesturePoint {
  source: 'touch' | 'pen';
  pointerId: number;
  clientX: number;
  clientY: number;
  /**
   * The input event's `timeStamp`. Browsers deliver moves on the next frame,
   * so the time a handler runs can trail the finger by a frame or two; the
   * event's own time is when the finger was there.
   */
  time: number;
}

interface GestureState {
  source: GesturePoint['source'];
  pointerId: number;
  startX: number;
  startY: number;
  startTime: number;
  direction: ToastGestureDirection;
  intent: 'pending' | 'vertical' | 'opposite';
  pausedTimer: boolean;
  surfaceSize: number;
  dismissThreshold: number;
}

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

interface ToastGestureBindings {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onLostPointerCapture: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

interface UseToastGestureResult {
  rootRef: RefObject<HTMLDivElement | null>;
  bindings: ToastGestureBindings;
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

export function useToastGesture({
  direction,
  enabled,
  canPauseTimer,
  isTimerPaused,
  pauseTimer,
  resumeTimer,
  dismiss,
  shouldIgnoreTarget,
}: UseToastGestureOptions): UseToastGestureResult {
  const rootRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<GestureState | null>(null);

  const resetGesture = useCallback(
    (shouldResume: boolean) => {
      const root = rootRef.current;
      const state = gestureRef.current;
      gestureRef.current = null;
      if (root) {
        clearTransientStyles(root);
      }
      if (shouldResume && state?.pausedTimer) {
        resumeTimer();
      }
    },
    [resumeTimer],
  );

  const beginGesture = useCallback(
    (point: GesturePoint, target: EventTarget | null): boolean => {
      const root = rootRef.current;
      if (
        !root ||
        !enabled ||
        gestureRef.current != null ||
        shouldIgnoreTarget(target, root)
      ) {
        return false;
      }
      const pausedTimer = canPauseTimer && !isTimerPaused();
      if (pausedTimer) {
        pauseTimer();
      }
      const surfaceSize = Math.max(root.getBoundingClientRect().height, 1);
      gestureRef.current = {
        source: point.source,
        pointerId: point.pointerId,
        startX: point.clientX,
        startY: point.clientY,
        startTime: point.time,
        direction,
        intent: 'pending',
        pausedTimer,
        surfaceSize,
        dismissThreshold: Math.max(
          surfaceSize * SWIPE_DISMISS_RATIO,
          SWIPE_DISMISS_MIN_DISTANCE,
        ),
      };
      return true;
    },
    [
      canPauseTimer,
      direction,
      enabled,
      isTimerPaused,
      pauseTimer,
      shouldIgnoreTarget,
    ],
  );

  const moveGesture = useCallback(
    (
      point: GesturePoint,
      preventDefault: () => void,
      releaseCapture?: () => void,
    ) => {
      const state = gestureRef.current;
      const root = rootRef.current;
      if (
        !state ||
        !root ||
        point.source !== state.source ||
        point.pointerId !== state.pointerId
      ) {
        return;
      }
      const deltaX = point.clientX - state.startX;
      const deltaY = point.clientY - state.startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      if (state.intent === 'pending') {
        if (absX > DRAG_PROMOTION_SLOP && absX > absY) {
          releaseCapture?.();
          resetGesture(true);
          return;
        }
        if (
          absY <= DRAG_PROMOTION_SLOP ||
          absY <= absX * VERTICAL_INTENT_RATIO
        ) {
          return;
        }
        state.intent = deltaY * state.direction > 0 ? 'vertical' : 'opposite';
        if (state.intent === 'opposite') {
          releaseCapture?.();
          resetGesture(true);
          return;
        }
        root.style.setProperty('transition-duration', '0s');
      }
      preventDefault();
      const travel = Math.max(0, deltaY * state.direction);
      const progress = swipeProgressValue(travel, state.surfaceSize);
      root.style.setProperty(
        '--_toast-swipe-y',
        `${travel * state.direction}px`,
      );
      root.style.setProperty(
        '--_toast-swipe-opacity',
        (1 - progress * SWIPE_ACTIVE_FADE_MAX).toFixed(3),
      );
      root.style.setProperty(
        '--_toast-swipe-scale',
        (1 - progress * SWIPE_ACTIVE_SCALE_MAX).toFixed(3),
      );
    },
    [resetGesture],
  );

  const endGesture = useCallback(
    (point: GesturePoint) => {
      const state = gestureRef.current;
      const root = rootRef.current;
      if (
        !state ||
        !root ||
        point.source !== state.source ||
        point.pointerId !== state.pointerId
      ) {
        return;
      }
      const travel = Math.max(
        0,
        (point.clientY - state.startY) * state.direction,
      );
      const elapsed = Math.max(1, point.time - state.startTime);
      // A flick needs no minimum travel of its own: the swipe already had to
      // pass the slop toward the edge to begin.
      const isDismissed =
        state.intent === 'vertical' &&
        (travel >= state.dismissThreshold || travel / elapsed > FLICK_VELOCITY);

      gestureRef.current = null;
      root.style.removeProperty('transition-duration');
      if (isDismissed) {
        // The exit animation owns the final translation. Clear the live-drag
        // transform/fade/scale first so a standalone Toast does not remain
        // partially translated or faded after its dismiss callback fires.
        clearTransientStyles(root);
        root.style.setProperty(
          '--_toast-swipe-exit-y',
          state.direction === 1
            ? SWIPE_EXIT_DISTANCE
            : `calc(-1 * ${SWIPE_EXIT_DISTANCE})`,
        );
        dismiss();
        return;
      }
      clearTransientStyles(root);
      if (state.pausedTimer) {
        resumeTimer();
      }
    },
    [dismiss, resumeTimer],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        event.pointerType === 'pen' &&
        (event.button == null || event.button === 0) &&
        beginGesture(
          {
            source: 'pen',
            pointerId: event.pointerId,
            clientX: event.clientX,
            clientY: event.clientY,
            time: event.timeStamp,
          },
          event.target,
        )
      ) {
        rootRef.current?.setPointerCapture?.(event.pointerId);
      }
    },
    [beginGesture],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== 'pen') {
        return;
      }
      moveGesture(
        {
          source: 'pen',
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          time: event.timeStamp,
        },
        () => event.preventDefault(),
        () => rootRef.current?.releasePointerCapture?.(event.pointerId),
      );
    },
    [moveGesture],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== 'pen') {
        return;
      }
      rootRef.current?.releasePointerCapture?.(event.pointerId);
      endGesture({
        source: 'pen',
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        time: event.timeStamp,
      });
    },
    [endGesture],
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        event.pointerType === 'pen' &&
        gestureRef.current?.source === 'pen' &&
        gestureRef.current?.pointerId === event.pointerId
      ) {
        resetGesture(true);
      }
    },
    [resetGesture],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) {
      return;
    }
    const point = (touch: Touch, event: TouchEvent): GesturePoint => ({
      source: 'touch',
      pointerId: touch.identifier,
      clientX: touch.clientX,
      clientY: touch.clientY,
      time: event.timeStamp,
    });
    const changedTouch = (event: TouchEvent) => {
      const state = gestureRef.current;
      const pointerId = state?.source === 'touch' ? state.pointerId : null;
      return pointerId == null
        ? undefined
        : [...event.changedTouches].find(
            touch => touch.identifier === pointerId,
          );
    };
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches?.length !== 1) {
        // A second contact means the browser may be handling pinch zoom or
        // two-finger scrolling. Abandon any accepted one-finger swipe before
        // touchmove can suppress that native gesture.
        resetGesture(true);
        return;
      }
      const touch = event.changedTouches[0];
      if (touch != null) {
        beginGesture(point(touch, event), event.target);
      }
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches?.length !== 1) {
        resetGesture(true);
        return;
      }
      const touch = changedTouch(event);
      if (touch) {
        moveGesture(point(touch, event), () => {
          if (event.cancelable) {
            event.preventDefault();
          }
        });
      }
    };
    const handleTouchEnd = (event: TouchEvent) => {
      if (event.touches.length > 0) {
        resetGesture(true);
        return;
      }
      const touch = changedTouch(event);
      if (touch) {
        endGesture(point(touch, event));
      } else if (event.touches.length === 0) {
        resetGesture(true);
      }
    };
    const handleTouchCancel = () => resetGesture(true);

    root.addEventListener('touchstart', handleTouchStart, {passive: true});
    root.addEventListener('touchmove', handleTouchMove, {passive: false});
    root.addEventListener('touchend', handleTouchEnd, {passive: true});
    root.addEventListener('touchcancel', handleTouchCancel, {passive: true});
    return () => {
      root.removeEventListener('touchstart', handleTouchStart);
      root.removeEventListener('touchmove', handleTouchMove);
      root.removeEventListener('touchend', handleTouchEnd);
      root.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [beginGesture, enabled, endGesture, moveGesture, resetGesture]);

  return {
    rootRef,
    bindings: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
      onLostPointerCapture: handlePointerCancel,
    },
  };
}
