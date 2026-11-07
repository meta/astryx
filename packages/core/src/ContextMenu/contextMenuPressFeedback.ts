// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file contextMenuPressFeedback.ts
 * @input UIKit's context-menu springs, the context-menu constants, the
 *   compositor animator, the presses ContextMenu's recognizer takes, and the
 *   press state core's press machine writes
 * @output useContextMenuPressFeedback: hold and release, from ContextMenu's
 *   menu; the growth follows the recognizer's finger, or a pen's press mark
 * @position The press feedback of ContextMenu's touch invocation
 *
 * SYNC: When modified, update /packages/core/src/ContextMenu/ContextMenu.tsx
 */

// The growth starts in the first frame at or after the onset, 150 ms after a
// finger lands, while the recognizer follows that finger. It plays its whole
// spring from rest, from that frame, as Core Animation starts an animation at
// its commit. The recognizer reports the landing; a pointer-only pen's press
// waits for the press machine's "on". Only the recognizer's failure or cancel
// returns it. A long press is a gesture, so the
// growth plays UIKit's lift spring and each return its dismissal spring. The
// compositor plays them, so a busy main thread does not stall them. Once the
// menu opens, the trigger holds its size until the menu closes. Then it returns
// on the dismissal spring. An inline trigger and Reduce Motion show no growth.

import {useCallback, useRef, type RefObject} from 'react';
import {useAttachment} from '../hooks/useAttachment';
import {usePressFeedback} from '../hooks/usePressFeedback';
import {PRESSED_ATTRIBUTE} from '../utils/pressFeedback';
import {PRESS_ONSET_MS} from '../utils/pressGesture';
import {observeMutations} from '../utils/sharedMutationObserver';
import {createMotionEngine, type Animator} from '../motion/animator';
import {contextMenu} from '../motion/uikit/contextMenu';
import {
  CONTEXT_MENU_DISMISS_SPRING,
  CONTEXT_MENU_LIFT_SPRING,
} from '../motion/uikit/springs';

const {heldScale} = contextMenu.press;

export interface ContextMenuPressFeedback {
  /**
   * The recognizer took a finger that landed at `landedAt` on `target`: grow
   * from the first frame at or after its onset, 150 ms later.
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
   * The menu showed: the feedback stops where it is. The menu's cursor anchor
   * sits inside the trigger, and anchor positioning follows its transformed
   * box. So a trigger that still grows would carry the open menu with it.
   */
  hold(): void;
}

/** A press feedback with no recognizer to ask grows at every "on". */
const ALWAYS_FOLLOWED: RefObject<() => boolean> = {current: () => true};

/** With no recognizer to ask, the onset is the "on" itself. */
const NO_LANDING: RefObject<() => number | null> = {current: () => null};

/** With no recognizer to ask, every "on" is a pen's. */
const NO_FINGER: RefObject<() => boolean> = {current: () => false};

// The triggers a press mark belongs to: every mounted trigger, whether it
// shows growth or not. A mark inside a trigger belongs to the nearest of them
// at or above it. So a press on a nested trigger grows no outer trigger.
const pressMarkOwners = new WeakSet<Element>();

/**
 * Calls `onDue` in the first animation frame that runs at or after `dueAt`, on
 * the event clock, with the time its callback runs. `onWait` runs in each frame
 * before it. It reads only the clock. A frame comes on time where a timer does
 * not: Chromium holds the page's timers for about 100 ms after it handles a
 * touchstart. Returns the function that stops it.
 */
function watchFramesFrom(
  dueAt: number,
  onWait: () => void,
  onDue: (time: number) => void,
): () => void {
  let frame = requestAnimationFrame(function look() {
    const time = performance.now();
    if (time >= dueAt) {
      onDue(time);
      return;
    }
    onWait();
    frame = requestAnimationFrame(look);
  });
  return () => {
    cancelAnimationFrame(frame);
  };
}

function pressMarkOwnerOf(marked: Element): Element | null {
  for (
    let node: Element | null = marked;
    node != null;
    node = node.parentElement
  ) {
    if (pressMarkOwners.has(node)) {
      return node;
    }
  }
  return null;
}

/**
 * The press feedback of a ContextMenu trigger. `isShown` is read at each
 * press: false for an inline trigger. It follows the element behind
 * `triggerRef`, so a replaced trigger (`triggerAs`) is followed too. The
 * `isFollowed` ref says whether ContextMenu's recognizer follows a finger or
 * a pen now: the growth starts only then. The `landedAt` ref gives the time
 * that finger landed, so the growth starts at its onset. The `followsFinger`
 * ref says whether that contact is a finger, whose onset `begin` sets.
 */
export function useContextMenuPressFeedback(
  triggerRef: RefObject<HTMLElement | null>,
  isShown: boolean,
  isFollowed: RefObject<() => boolean> = ALWAYS_FOLLOWED,
  landedAt: RefObject<() => number | null> = NO_LANDING,
  followsFinger: RefObject<() => boolean> = NO_FINGER,
): ContextMenuPressFeedback {
  // The press machine's document listener, while this feedback is mounted.
  usePressFeedback();
  const animatorRef = useRef<Animator | null>(null);
  const isShownRef = useRef(isShown);
  isShownRef.current = isShown;
  // Whether the trigger carries a scale of ours (to put back and clear).
  const isGrownRef = useRef(false);
  // The menu the press opened is up: the growth holds until it closes.
  const isHeldRef = useRef(false);
  // Null while no shown trigger is attached, so `begin` grows nothing.
  const fingerOnsetRef = useRef<
    ((landedAt: number, target: Element | null) => void) | null
  >(null);
  // Stops the frame watch of a growth still to come.
  const stopOnsetRef = useRef<(() => void) | null>(null);
  const stopOnset = useCallback(() => {
    stopOnsetRef.current?.();
    stopOnsetRef.current = null;
  }, []);

  // The compositor animator lives with the trigger it follows. A replaced
  // trigger, or a feedback that goes while the trigger stays, takes the
  // animation and the scale of ours with it.
  useAttachment(
    triggerRef,
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
    const element = triggerRef.current;
    if (element == null) {
      return null;
    }
    animatorRef.current ??= createMotionEngine(element);
    return animatorRef.current;
  }, [triggerRef]);

  // Back at 1: drop the inline scale, which would otherwise leave the trigger
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
    [animatorFor, isFollowed],
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
    fingerOnsetRef.current?.(landed, target);
  }, []);

  const hold = useCallback(() => {
    stopOnset();
    isHeldRef.current = true;
    if (isGrownRef.current) {
      animatorRef.current?.stop(['scale']);
    }
  }, [stopOnset]);

  // Grow from the onset, 150 ms after the finger lands. The recognizer reports
  // the landing as it takes the finger, whether or not the press machine
  // marks the press. Inside a scroll view the machine marks late, and it never
  // marks a press that travels past 10 px first. A pen's onset waits for the
  // mark. The machine marks the innermost pressable surface, so a control
  // inside the trigger can carry the mark. Only the recognizer ends the growth
  // (`end`).
  useAttachment(
    triggerRef,
    element => {
      pressMarkOwners.add(element);
      if (!isShown) {
        return () => {
          pressMarkOwners.delete(element);
        };
      }
      const isMarkedOn = () =>
        element.getAttribute(PRESSED_ATTRIBUTE) === 'on' ||
        [...element.querySelectorAll(`[${PRESSED_ATTRIBUTE}="on"]`)].some(
          marked => pressMarkOwnerOf(marked) === element,
        );
      let isPressed = isMarkedOn();
      let markedAt = 0;
      const startAt = (onsetAt: number) => {
        stopOnset();
        stopOnsetRef.current = watchFramesFrom(
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
      // A pen's mark: the gesture host took that pen from the same input
      // before the mark's record comes, so the recognizer follows it already.
      const growAtMark = () => {
        // The recognizer times a finger's onset from its landing.
        if (followsFinger.current() || !isFollowed.current()) {
          return;
        }
        const landed = landedAt.current();
        startAt(
          landed == null
            ? markedAt
            : Math.max(markedAt, landed + PRESS_ONSET_MS),
        );
      };
      fingerOnsetRef.current = (landed, target) => {
        // A finger on a nested trigger grows only that trigger.
        if (target != null && pressMarkOwnerOf(target) !== element) {
          return;
        }
        startAt(landed + PRESS_ONSET_MS);
      };
      const stopObserving = observeMutations(
        element,
        {attributes: true, attributeFilter: [PRESSED_ATTRIBUTE], subtree: true},
        () => {
          const next = isMarkedOn();
          if (next !== isPressed) {
            isPressed = next;
            if (next) {
              if (!followsFinger.current()) {
                stopOnset();
                markedAt = performance.now();
                growAtMark();
              }
            } else if (!isFollowed.current()) {
              // A finger the recognizer still follows keeps its onset, past
              // the machine's shorter travel.
              stopOnset();
            }
          }
        },
      );
      return () => {
        stopOnset();
        stopObserving();
        fingerOnsetRef.current = null;
        pressMarkOwners.delete(element);
      };
    },
    isShown,
  );

  return {begin, release, end, hold};
}
