// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file contextMenuPressFeedback.ts
 * @input UIKit's context-menu springs, the context-menu constants, the
 *   compositor animator, the presses ContextMenu's recognizer takes, and the
 *   context-menu-trigger mark (privateAttributes/contextMenuTrigger.stylex.ts)
 * @output useContextMenuPressFeedback: hold and release, from ContextMenu's
 *   menu; the growth follows the recognizer's finger or pen
 * @position The press feedback of ContextMenu's touch invocation
 *
 * SYNC: When modified, update /packages/core/src/ContextMenu/ContextMenu.tsx
 */

import {useCallback, useRef, type RefObject} from 'react';
import {useAttachment} from '../hooks/useAttachment';
import {useCommittedRef} from '../hooks/useCommittedRef';
import {
  closestContextMenuTrigger,
  markContextMenuTrigger,
} from '../privateAttributes/contextMenuTrigger.stylex';
import {PRESS_ONSET_MS} from '../utils/pressGesture';
import {createMotionEngine, type Animator} from '../motion/animator';
import {contextMenu} from '../motion/uikit/contextMenu';
import {
  CONTEXT_MENU_DISMISS_SPRING,
  CONTEXT_MENU_LIFT_SPRING,
} from '../motion/uikit/springs';

const {heldScale} = contextMenu.press;

export interface ContextMenuPressFeedback {
  /**
   * The recognizer took a finger or a pen that landed at `landedAt` on
   * `target`: grow from the first frame at or after its onset, 150 ms later.
   */
  begin(landedAt: number, target: Element | null): void;
  /** The menu the press opened closed: return on the dismissal spring. */
  release(): void;
  /**
   * The recognizer ended the press with no menu, at `time`: return on the
   * dismissal spring. A growth still to come does not start.
   */
  end(time: number): void;
  /**
   * The menu showed: the feedback stops where it is and holds until the menu
   * closes.
   */
  hold(): void;
}

/** A press feedback with no recognizer to ask grows at every `begin`. */
const ALWAYS_FOLLOWED: RefObject<() => boolean> = {current: () => true};

/**
 * The window that shows `element`. A trigger in a same-origin iframe or a
 * Picture-in-Picture window gets its touches, frames and timeline from that
 * window, whose clock starts later than the page's.
 */
function windowOf(element: Element): Window {
  return element.ownerDocument.defaultView ?? window;
}

/**
 * Calls `onDue` in the first animation frame of `view` that runs at or after
 * `dueAt`, on that window's clock, with the time its callback runs. `onWait`
 * runs in each frame before it. It reads only the clock. A frame comes on time
 * where a timer does not: Chromium holds the page's timers for about 100 ms
 * after it handles a touchstart. Returns the function that stops it.
 */
function watchFramesFrom(
  view: Window,
  dueAt: number,
  onWait: () => void,
  onDue: (time: number) => void,
): () => void {
  let frame = view.requestAnimationFrame(function look() {
    const time = view.performance.now();
    if (time >= dueAt) {
      onDue(time);
      return;
    }
    onWait();
    frame = view.requestAnimationFrame(look);
  });
  return () => {
    view.cancelAnimationFrame(frame);
  };
}

/**
 * The press feedback of a ContextMenu trigger. `isShown` is read at each
 * press: false for an inline trigger. It marks the element behind
 * `triggerRef`, so a replaced trigger (`triggerAs`) is followed too. It grows
 * the element behind `visualRef`, the trigger's own visual, so a layer
 * anchored in the trigger never takes the scale. The `isFollowed` ref says
 * whether ContextMenu's recognizer follows a finger or a pen now: the growth
 * starts only then.
 */
export function useContextMenuPressFeedback(
  triggerRef: RefObject<HTMLElement | null>,
  visualRef: RefObject<HTMLElement | null>,
  isShown: boolean,
  isFollowed: RefObject<() => boolean> = ALWAYS_FOLLOWED,
): ContextMenuPressFeedback {
  const animatorRef = useRef<Animator | null>(null);
  const isShownRef = useCommittedRef(isShown);
  // Whether the visual carries a scale of ours (to put back and clear).
  const isGrownRef = useRef(false);
  // The menu the press opened is up: the growth holds until it closes.
  const isHeldRef = useRef(false);
  // Null while no shown trigger is attached, so `begin` grows nothing.
  const onsetRef = useRef<
    ((landedAt: number, target: Element | null) => void) | null
  >(null);
  const stopOnsetRef = useRef<(() => void) | null>(null);
  const stopOnset = useCallback(() => {
    stopOnsetRef.current?.();
    stopOnsetRef.current = null;
  }, []);

  // The compositor animator lives with the visual it grows. A replaced
  // visual, or a feedback that goes while the visual stays, takes the
  // animation and the scale of ours with it.
  useAttachment(
    visualRef,
    element => () => {
      animatorRef.current?.dispose();
      animatorRef.current = null;
      if (isGrownRef.current) {
        isGrownRef.current = false;
        element.style.removeProperty('scale');
      }
    },
    null,
  );

  const animatorFor = useCallback((): Animator | null => {
    const element = visualRef.current;
    if (element == null) {
      return null;
    }
    // Another window's timeline runs on its own clock and frames.
    const view = windowOf(element);
    animatorRef.current ??= createMotionEngine(
      element,
      view === window
        ? {}
        : {
            now: () => view.performance.now(),
            requestFrame: callback => {
              view.requestAnimationFrame(frame => callback(frame));
            },
          },
    );
    return animatorRef.current;
  }, [visualRef]);

  // Back at 1: drop the inline scale, which would otherwise leave the visual
  // a stacking context and a containing block for fixed descendants.
  const settleBack = useCallback((finished: Promise<boolean>) => {
    void finished.then(isDone => {
      const element = animatorRef.current?.element;
      if (isDone && element != null && isGrownRef.current) {
        isGrownRef.current = false;
        element.style.removeProperty('scale');
      }
    });
  }, []);

  const start = useCallback(
    (time: number) => {
      if (!isShownRef.current || isHeldRef.current || !isFollowed.current()) {
        return;
      }
      const animator = animatorFor();
      const element = animator?.element;
      // Under Reduce Motion the view does not grow (UIKit's
      // `reducedMotionFeedback`), and no fade stands in for it.
      if (
        animator == null ||
        element == null ||
        (animator.reducedMotion() !== 'off' &&
          !contextMenu.reducedMotionFeedback)
      ) {
        return;
      }
      isGrownRef.current = true;
      // `time` is when the first frame at or after the onset runs. The curve
      // starts there from rest, so no frame skips into it.
      animator.animate(
        {scale: heldScale},
        {spring: CONTEXT_MENU_LIFT_SPRING},
        {at: time},
      );
    },
    [animatorFor, isFollowed, isShownRef],
  );

  const end = useCallback(
    (time: number) => {
      stopOnset();
      const animator = animatorRef.current;
      const element = animator?.element;
      if (
        animator == null ||
        element == null ||
        !isGrownRef.current ||
        isHeldRef.current
      ) {
        return;
      }
      settleBack(
        animator.animate(
          {scale: 1},
          {spring: CONTEXT_MENU_DISMISS_SPRING},
          {at: time},
        ).finished,
      );
    },
    [settleBack, stopOnset],
  );

  const release = useCallback(() => {
    isHeldRef.current = false;
    const animator = animatorRef.current;
    const element = animator?.element;
    if (animator == null || element == null || !isGrownRef.current) {
      return;
    }
    settleBack(
      animator.animate({scale: 1}, {spring: CONTEXT_MENU_DISMISS_SPRING})
        .finished,
    );
  }, [settleBack]);

  const begin = useCallback((landed: number, target: Element | null) => {
    onsetRef.current?.(landed, target);
  }, []);

  const hold = useCallback(() => {
    stopOnset();
    isHeldRef.current = true;
    if (isGrownRef.current) {
      animatorRef.current?.stop(['scale']);
    }
  }, [stopOnset]);

  // Grow from the onset, 150 ms after a finger or a pen lands. The recognizer
  // reports the landing as it takes the contact. The press machine's mark is
  // not waited for: inside a scroll view it comes late, and never for a press
  // that travels past 10 px first. Only the recognizer ends the growth
  // (`end`).
  useAttachment(
    triggerRef,
    element => {
      // Every mounted trigger is marked, whether it shows growth or not, so a
      // landing on a nested trigger grows no outer trigger.
      const unmark = markContextMenuTrigger(element);
      if (!isShown) {
        return unmark;
      }
      const startAt = (onsetAt: number) => {
        stopOnset();
        stopOnsetRef.current = watchFramesFrom(
          windowOf(element),
          onsetAt,
          // The engine is built in a frame, not in the handler of the touch,
          // so the frame that starts the growth only creates its animation.
          animatorFor,
          time => {
            stopOnsetRef.current = null;
            start(time);
          },
        );
      };
      onsetRef.current = (landed, target) => {
        if (target != null && closestContextMenuTrigger(target) !== element) {
          return;
        }
        startAt(landed + PRESS_ONSET_MS);
      };
      return () => {
        stopOnset();
        onsetRef.current = null;
        unmark();
      };
    },
    isShown,
  );

  return {begin, release, end, hold};
}
