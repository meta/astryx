// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reducedMotion.ts
 * @input The interaction harness's held animations
 * @output `expectReducedMotionCrossFade`: the browser check of
 *   `design:reduced-motion` DR1 and DR2 over what a change started
 * @position Shared by the List and TreeList interaction specs; each case runs
 *   under reduced motion with a coarse pointer (a finger)
 */

import {expect} from '@playwright/test';
import type {HeldAnimation} from '@astryxdesign/interaction-harness';

/** DR2's limit on a touch presentation's cross-fade. */
export const REDUCED_MOTION_FADE_MS = 200;

const TIMING_KEYS = new Set([
  'offset',
  'computedOffset',
  'easing',
  'composite',
]);

/** Properties that move, turn or scale an element. */
const TRAVEL = new Set(['translate', 'rotate', 'scale', 'transform']);

/** The properties an animation's keyframes change. */
function animatedProperties(animation: HeldAnimation): string[] {
  const properties = new Set<string>();
  for (const frame of animation.keyframes) {
    for (const key of Object.keys(frame)) {
      if (!TIMING_KEYS.has(key)) {
        properties.add(key);
      }
    }
  }
  return [...properties];
}

/**
 * Whether the animation only lands `property` at a new value (a step: the
 * value changes between keyframes at the same offset, or under a step
 * easing) rather than moving it through the values between.
 */
function onlyLands(animation: HeldAnimation, property: string): boolean {
  const frames = animation.keyframes.filter(frame => property in frame);
  for (let index = 0; index + 1 < frames.length; index += 1) {
    const from = frames[index];
    const to = frames[index + 1];
    if (String(from[property]) === String(to[property])) {
      continue;
    }
    const sameOffset =
      Number(from.computedOffset) === Number(to.computedOffset);
    const easing = typeof from.easing === 'string' ? from.easing : '';
    const stepped = /^step|steps\(/.test(easing);
    if (!sameOffset && !stepped) {
      return false;
    }
  }
  return true;
}

/**
 * `design:reduced-motion` DR1 and DR2, under a coarse pointer: the change
 * cross-fades (at least one opacity animation runs, its curve ending within
 * 200 ms), nothing travels, scales or resizes on the way (an element may
 * land at its new place in one step, hidden by the fade), and nothing but
 * opacity animates. `held` is what `holdAnimations` returned right after the
 * change.
 */
export function expectReducedMotionCrossFade(
  held: ReadonlyArray<HeldAnimation>,
): void {
  const summary = JSON.stringify(
    held.map(animation => ({
      target: animation.target,
      properties: animatedProperties(animation),
      curveEndMs: animation.curveEndMs,
    })),
  );
  let fades = 0;
  for (const animation of held) {
    for (const property of animatedProperties(animation)) {
      if (property === 'opacity') {
        fades += 1;
        expect(animation.curveEndMs, summary).toBeGreaterThan(0);
        expect(animation.curveEndMs, summary).toBeLessThanOrEqual(
          REDUCED_MOTION_FADE_MS + 1,
        );
      } else if (TRAVEL.has(property)) {
        expect(onlyLands(animation, property), `${property}: ${summary}`).toBe(
          true,
        );
      } else {
        expect(property, summary).toBe('opacity');
      }
    }
  }
  expect(fades, summary).toBeGreaterThan(0);
}
