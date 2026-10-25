// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reducedMotion.ts
 * @input The Reduced Motion preference, the primary pointer, the motion tables
 * @output reducedMotionFade (the fade the animator would play, for motion it
 *   does not drive) and the two media queries a StyleX transition spells
 * @position The one Reduced Motion policy (design:reduced-motion) for code
 *   beside the animator: a raw Web Animations fade, a CSS transition
 *
 * Under Reduce Motion nothing moves, scales or springs. On a coarse primary
 * pointer, or for a change started by a touch drag's release on any pointer
 * (DR2), a change becomes an opacity-only cross-fade of
 * `timing.reducedMotionCrossFadeMs` (200 ms) on `timing.curves.move`; on
 * any other primary pointer it completes at once (DR3). No theme value or
 * call site lengthens the fade (DR4). The animator follows the same policy on
 * its own (animator.ts).
 *
 * In StyleX, a transition spells the two keys literally and takes its values
 * from reducedMotion.stylex.ts. A constant used as a computed key compiles to
 * a later priority layer than the literal media key, which would outrank the
 * element's state styles, so the keys stay literal:
 *
 * ```
 * transitionProperty: {
 *   default: 'opacity, translate',
 *   '@media (prefers-reduced-motion: reduce) and (pointer: coarse)': 'opacity',
 *   '@media (prefers-reduced-motion: reduce) and (not (pointer: coarse))': 'none',
 * },
 * transitionDuration: {
 *   default: '300ms',
 *   '@media (prefers-reduced-motion: reduce) and (pointer: coarse)':
 *     reducedMotionFadeConsts.duration,
 *   '@media (prefers-reduced-motion: reduce) and (not (pointer: coarse))': '0s',
 * },
 * ```
 *
 * reducedMotion.test.ts requires every such key in core to equal one of
 * `reducedMotionKeys`, exactly.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/reducedMotion.stylex.ts
 * - /packages/core/src/motion/reducedMotion.test.ts
 * - /packages/core/src/motion/animator.ts (its Reduced Motion path)
 */

import {defaultIsCoarsePointer, defaultPrefersReducedMotion} from './animator';
import {reducedMotionCrossFade} from './uikit/timing';

/** Reduce Motion on a coarse primary pointer: an opacity-only cross-fade. */
export const REDUCED_MOTION_FADE_QUERY =
  '(prefers-reduced-motion: reduce) and (pointer: coarse)';

/** Reduce Motion on any other primary pointer: the change completes at once. */
export const REDUCED_MOTION_INSTANT_QUERY =
  '(prefers-reduced-motion: reduce) and (not (pointer: coarse))';

/**
 * The fade to play under Reduce Motion. `duration` 0 means the change
 * completes at once; `easing` is a CSS timing function.
 */
export interface ReducedMotionFade {
  readonly duration: number;
  readonly easing: string;
}

/**
 * The Reduced Motion fade for a change to `element` now, for motion the
 * animator does not drive (two titles cross-fading with Web Animations):
 * null when motion is not reduced (play the normal motion), else an
 * opacity-only fade of 200 ms on a coarse pointer or for a touch release, or
 * duration 0 (at once) on any other pointer, on Core Animation's easeInOut;
 * the length is fixed.
 */
export function reducedMotionFade(
  element?: Element | null,
  options: {
    /** The change starts from the release of a touch drag (DR2). */
    touchRelease?: boolean;
  } = {},
): ReducedMotionFade | null {
  if (!defaultPrefersReducedMotion()) {
    return null;
  }
  const fades = options.touchRelease === true || defaultIsCoarsePointer();
  if (!fades) {
    return {duration: 0, easing: 'linear'};
  }
  const curve = reducedMotionCrossFade.curve;
  return {
    duration: reducedMotionCrossFade.durationMs,
    easing: `cubic-bezier(${curve.join(', ')})`,
  };
}
