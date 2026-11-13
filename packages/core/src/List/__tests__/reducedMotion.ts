// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reducedMotion.ts
 * @input The interaction harness's held animations
 * @output `expectReducedMotionCrossFade`: the browser check of the Reduce
 *   Motion cross-fade over what a change started
 * @position Test helper for the TreeList interaction specs. Each case runs
 *   under Reduce Motion with a coarse pointer (a finger).
 */

import {expect} from '@astryxdesign/a11y-spec/playwright';
import type {HeldAnimation} from '@astryxdesign/interaction-harness';

/** The limit on a touch presentation's cross-fade under Reduce Motion. */
const REDUCED_MOTION_FADE_MS = 200;

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
 * Whether the animation only lands `property` at a new value, rather than
 * moving it through the values between. A step lands it: the value changes
 * between keyframes at the same offset, or under a step easing.
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
 * The Reduce Motion cross-fade under a coarse pointer. At least one opacity
 * animation runs, and its curve ends within 200 ms. Nothing travels, scales
 * or resizes on the way, though an element may land at its new place in one
 * step, hidden by the fade. Nothing but opacity animates. `held` is what
 * `holdAnimations` returned right after the change.
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
