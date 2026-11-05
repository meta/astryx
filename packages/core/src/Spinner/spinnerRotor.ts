// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file spinnerRotor.ts
 * @input StyleX keyframes and the slow-min duration token
 * @output The one turning arc: SPINNER_ARC_FRACTION, spinnerRotorStyles.turn
 *   and syncRotationPhase
 * @position Spinner's rotor, shared by Spinner and Lab's indeterminate
 *   CircularProgress (through `@astryxdesign/core/internal/spinner-rotor`), so
 *   both rings turn the same way on the compositor.
 */

import * as stylex from '@stylexjs/stylex';
import {durationVars} from '../theme/tokens.stylex';

/** The fraction of the ring the arc covers: 135°. */
export const SPINNER_ARC_FRACTION = 0.375;

/**
 * Full turns in one iteration of the rotation.
 *
 * Chromium wakes the main thread at each iteration boundary while the
 * document listens for `animationiteration`. React listens for it on every
 * root. One iteration holds 100 turns, so the wake comes once in 100 turns.
 * Each turn is 360 degrees, so the ring looks the same.
 */
const TURNS_PER_ITERATION = 100;

/**
 * A `transform` animation runs on the compositor, so the ring keeps turning
 * while a script runs. A `stroke-dashoffset` animation would repaint the arc
 * on the main thread every frame, so it would stop while a script runs.
 */
const rotation = stylex.keyframes({
  '0%': {transform: 'rotate(0deg)'},
  '100%': {transform: `rotate(${360 * TURNS_PER_ITERATION}deg)`},
});

export const spinnerRotorStyles = stylex.create({
  turn: {
    // Mobile Safari keeps a re-timed animation off the main thread only on an
    // element with its own layer. So the rotor declares one before the start
    // time is set (see `pinRotorsToTimelineOrigin`).
    willChange: 'transform',
    // Reduced motion slows the turn but never stops it: a still ring reads as
    // broken. The ring's role and name still say that work is busy.
    animationDuration: {
      // The loop reads the duration before a theme's tempo scales it.
      default: `calc(var(--_astryx-pre-tempo-duration-slow-min, ${durationVars['--duration-slow-min']}) * ${TURNS_PER_ITERATION})`,
      '@media (prefers-reduced-motion: reduce)': `calc(3s * ${TURNS_PER_ITERATION})`,
    },
    animationIterationCount: 'infinite',
    animationName: rotation,
    animationTimingFunction: 'linear',
  },
});

/**
 * Pin every ring's rotation to the document timeline's origin instead of its
 * own start time, so spinners mounted seconds apart stay in phase.
 *
 * Setting `startTime` is exact where arithmetic on a clock read is not. A
 * negative `animation-delay` computed at mount is only as good as the gap
 * between the clock read and the frame the animation starts in. At 10x CPU
 * throttling that gap measured 116 degrees of drift.
 *
 * Rotors are collected and pinned in one frame. `getAnimations()` resolves
 * style, and `startTime` dirties it again. So pinning them one at a time makes
 * each mount re-force what the previous one invalidated: 53 style recalcs for
 * 38 spinners, against 19 batched.
 */
const pendingRotors = new Set<Element>();
let flushScheduled = false;

function pinRotorsToTimelineOrigin(): void {
  flushScheduled = false;
  const animations: Animation[] = [];
  for (const rotor of pendingRotors) {
    animations.push(...rotor.getAnimations());
  }
  pendingRotors.clear();
  for (const animation of animations) {
    animation.startTime = 0;
  }
}

/**
 * Ref callback for a rotor: the one place a mounted ring touches the DOM.
 *
 * It reads nothing back — the geometry is resolved by the cascade, not in JS.
 */
export function syncRotationPhase(
  rotor: Element | null,
): (() => void) | undefined {
  if (rotor == null) {
    return undefined;
  }
  // jsdom implements no Web Animations, and this runs in every consumer's
  // component tests.
  if (typeof rotor.getAnimations !== 'function') {
    return undefined;
  }
  pendingRotors.add(rotor);
  if (!flushScheduled) {
    flushScheduled = true;
    requestAnimationFrame(pinRotorsToTimelineOrigin);
  }
  return () => {
    pendingRotors.delete(rotor);
  };
}
