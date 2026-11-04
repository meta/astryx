// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file composerFollow.ts
 * @input The keyboard dismissal's pan and its drag, the motion animator,
 *   UIKit's rubber band, and the keyboard and finger-tracking springs
 * @output createComposerFollow: the composer's motion while a drag can
 *   dismiss the keyboard
 * @position Internal to Chat. ChatLayout attaches it to its composer and to
 *   the frosted layer under it, and drives it from the dismissal pan.
 */

import type {PanGestureRecognizer} from '../gestures/PanGestureRecognizer';
import {createMotionEngine} from '../motion/animator';
import {resolveMotion} from '../motion/resolveMotion';
import {rubberBand, rubberBandSlope} from '../motion/rubberBand';
import {springs} from '../motion/uikit/springs';
import {dismissDragOf} from './transcriptDismiss';

/** The composer's motion during a drag that can dismiss the keyboard. */
export interface ComposerFollow {
  /** Attaches the composer and the frosted layer under it, or detaches. */
  attach(
    elements: {composer: HTMLElement; edge: HTMLElement | null} | null,
  ): void;
  /** Follows the pan's state: call it from the pan's action. */
  update(pan: PanGestureRecognizer): void;
}

/**
 * The composer, and the frosted layer at the keyboard's edge, follow a drag
 * that can dismiss the keyboard. Once the finger is over the composer the
 * drag is armed: they settle down by the composer's bottom padding, toward
 * the keyboard. Then they follow the finger on UIKit's rubber band, over the
 * keyboard's height, as the keyboard itself cannot move. A lift springs them
 * back to rest from the release speed, on the keyboard's own spring. Under
 * Reduce Motion nothing moves: `showArmedCue` hears when an armed drag
 * starts and ends, so the composer can show it without motion.
 */
export function createComposerFollow(
  showArmedCue: (armed: boolean) => void,
): ComposerFollow {
  const composerMotion = createMotionEngine(null);
  const edgeMotion = createMotionEngine(null);
  let isArmed = false;
  // The composer's bottom padding, read as the drag arms.
  let detent = 0;
  // The offset they last moved toward, so a still target adds no animation.
  let target = 0;

  const isReduced = () => composerMotion.reducedMotion() !== 'off';

  const showArmed = (armed: boolean) => {
    if (armed === isArmed) {
      return;
    }
    isArmed = armed;
    const composer = composerMotion.element;
    if (composer == null) {
      return;
    }
    if (armed) {
      detent = Number.parseFloat(getComputedStyle(composer).paddingBottom) || 0;
    }
    showArmedCue(armed && isReduced());
  };

  // Both elements move on one clock, so they stay together.
  const moveTo = (
    y: number,
    spring: typeof springs.keyboard | typeof springs.fingerTracking,
    velocity?: number,
  ) => {
    target = y;
    const at = performance.now();
    for (const motion of [composerMotion, edgeMotion]) {
      motion.animate(
        {y},
        {
          spring: resolveMotion(motion.element, spring),
          velocity: velocity == null ? undefined : {y: velocity},
        },
        {at, touchRelease: spring === springs.keyboard},
      );
    }
  };

  return {
    attach(elements) {
      composerMotion.attach(elements?.composer ?? null);
      edgeMotion.attach(elements?.edge ?? null);
    },
    update(pan) {
      const drag = dismissDragOf(pan);
      if (drag == null || composerMotion.element == null) {
        return;
      }
      const overflow = pan.location().y - drag.line;
      if (pan.state === 'began' || pan.state === 'changed') {
        showArmed(overflow >= 0);
        const y = isArmed ? detent + rubberBand(overflow, drag.travel) : 0;
        if (!isReduced() && y !== target) {
          moveTo(y, springs.fingerTracking);
        }
        return;
      }
      if (pan.state === 'possible') {
        return;
      }
      const wasArmed = isArmed;
      showArmed(false);
      if (isReduced()) {
        return;
      }
      const velocity =
        pan.state === 'ended' && wasArmed
          ? pan.velocity().y * rubberBandSlope(overflow, drag.travel)
          : undefined;
      if (target !== 0 || velocity != null) {
        moveTo(0, springs.keyboard, velocity);
      }
    },
  };
}
