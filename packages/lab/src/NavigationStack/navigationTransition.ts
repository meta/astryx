// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file navigationTransition.ts
 * @input The navigation table (navigationMotion.ts) and Core's rubber band
 *   (its internal touch entry)
 * @output Pure math for NavigationStack's transition: layer values and
 *   velocities at a progress (`layersAt`, `layerVelocities`). Also the pop's
 *   release rule (`shouldFinishPop`) and progress from travel or a caught
 *   screen (`progressFromTravel`, `progressFromScreen`).
 * @position Lab NavigationStack internals; no DOM, no React. The component
 *   hands these numbers to the compositor animator.
 *
 * SYNC: When modified, update navigationTransition.test.ts.
 */

import {rubberBand, rubberBandInverse} from '@astryxdesign/core/internal/touch';

import {navigation} from './navigationMotion';

/**
 * The layers, as UIKit moves them on iOS 26.2 (measured):
 * - top card: x = p · W;
 * - card under it: x = parallax · W · (1 − p), so from −0.3 W to 0;
 * - dimming over the card under it: opacity 1 − p (black at 10 %);
 * - bars: each moves with its screen's card. Under a finger, the revealed
 *   bar holds still.
 *
 * Every layer is linear in p, so one spring run on all of them with
 * velocities scaled the same way keeps them on one trajectory.
 */
export interface TransitionLayers {
  /** The top card's translateX, px. */
  readonly topX: number;
  /** The covered card's translateX, px. */
  readonly underX: number;
  /** The dimming's opacity over the covered card, 0–1. */
  readonly dim: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * The layers at progress `p` for a container `width` px wide. `p` is the
 * share of the width the top card has uncovered: 0 when a push has landed,
 * 1 when a pop has landed. A push runs p 1 → 0 and a pop runs p 0 → 1. An
 * interactive pop scrubs p with the finger (UIKit's `percentComplete`).
 * `direction` is the writing direction: under RTL cards enter from the left,
 * so every x flips.
 */
export function layersAt(
  p: number,
  width: number,
  direction: 'ltr' | 'rtl' = 'ltr',
): TransitionLayers {
  const sign = direction === 'rtl' ? -1 : 1;
  return {
    topX: sign * p * width,
    underX: sign * navigation.parallax * width * (1 - p),
    dim: clamp01(1 - p),
  };
}

/**
 * The layers' velocities (px/s and 1/s) when progress moves at `dp` per
 * second. They use the same scaling as `layersAt`, so a spring started with
 * these keeps every layer on the progress curve.
 */
export function layerVelocities(
  dp: number,
  width: number,
  direction: 'ltr' | 'rtl' = 'ltr',
): TransitionLayers {
  const sign = direction === 'rtl' ? -1 : 1;
  return {
    topX: sign * dp * width,
    underX: -sign * navigation.parallax * width * dp,
    dim: -dp,
  };
}

/**
 * Progress of the push and pop springs' starting velocity: they do not start
 * from rest (8.773 widths per second on iOS 26.2). Negative for a push
 * (p heads to 0), positive for a pop.
 */
export function programmaticVelocity(kind: 'push' | 'pop'): number {
  return kind === 'push' ? -navigation.pushVelocity : navigation.pushVelocity;
}

/**
 * Progress from a finger's horizontal travel since the pop began, px, added
 * to the progress the cards had when it began. A pop grabbed mid-flight
 * continues from where it is. At most 1. Below 0 (the finger brought back
 * past where the screen is fully in place) it resists with UIKit's rubber
 * band. The release springs it back.
 */
export function progressFromTravel(
  startProgress: number,
  travelX: number,
  width: number,
  direction: 'ltr' | 'rtl' = 'ltr',
): number {
  if (width <= 0) {
    return clamp01(startProgress);
  }
  const sign = direction === 'rtl' ? -1 : 1;
  const p = startProgress + (sign * travelX) / width;
  // Past the start the screen resists as UIKit's does; never past the far
  // edge.
  return p < 0
    ? rubberBand(p * width, width, navigation.interactivePopRubberBand) / width
    : Math.min(1, p);
}

/**
 * The progress a finger resumes from when it catches the top screen at
 * translateX `x`, px. It is the progress `progressFromTravel` shows there, so
 * the screen does not jump. Past the start it undoes the rubber band.
 */
export function progressFromScreen(
  x: number,
  width: number,
  direction: 'ltr' | 'rtl' = 'ltr',
): number {
  if (width <= 0) {
    return 0;
  }
  const shown = (direction === 'rtl' ? -x : x) / width;
  return shown < 0
    ? rubberBandInverse(
        shown * width,
        width,
        navigation.interactivePopRubberBand,
      ) / width
    : Math.min(1, shown);
}

/**
 * The interactive pop's release rule (iOS 26.2, 58 of 61 releases). The pop
 * finishes when progress plus 0.35 s of the release velocity, in widths per
 * second, passes half the width. Otherwise it cancels. A still finger at
 * 0.475 cancels; at 0.05 a flick needs about 2 widths per second. A release
 * moving back toward the start cancels, whatever the travel so far.
 */
export function shouldFinishPop(
  progress: number,
  velocityWidthsPerSecond: number,
): boolean {
  if (velocityWidthsPerSecond < 0) {
    return false;
  }
  return (
    progress +
      navigation.interactivePopFinishProjection * velocityWidthsPerSecond >
    navigation.interactivePopFinishThreshold
  );
}

/** A finger's horizontal velocity, px/s, in widths per second toward a pop. */
export function popVelocity(
  velocityX: number,
  width: number,
  direction: 'ltr' | 'rtl' = 'ltr',
): number {
  if (width <= 0) {
    return 0;
  }
  return ((direction === 'rtl' ? -1 : 1) * velocityX) / width;
}
