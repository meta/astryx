// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reducedMotion.ts
 * @input The Reduced Motion preference, the primary pointer, the motion tables
 * @output reducedMotionFade (the fade the animator would play, for motion it
 *   does not drive), playReducedMotionDip, and the queries a transition spells
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
import {resolveMotion} from './resolveMotion';
import {
  reducedMotionCrossFade,
  registerReducedMotionCrossFade,
} from './uikit/timing';

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
  if (element != null) {
    registerReducedMotionCrossFade();
  }
  const curve =
    element != null
      ? resolveMotion(element, reducedMotionCrossFade.curve)
      : reducedMotionCrossFade.curve;
  return {
    duration: reducedMotionCrossFade.durationMs,
    easing: `cubic-bezier(${curve.join(', ')})`,
  };
}

/** A running Reduced Motion dip. */
export interface ReducedMotionDip {
  /** Stops the dip. A change that has not landed yet never lands. */
  cancel(): void;
}

/**
 * Plays `fade` on `element` as a dip, and runs `land` at its middle: the
 * fade-out, the change, then the fade-in. The fade-out holds at 0 until `land`
 * has run, and the fade-in starts only after it. So the change never shows at
 * full opacity, however late the main thread runs. A timer at the middle can
 * fire after the fade-in has begun.
 *
 * `land` must apply the change before it returns: the fade-in starts right
 * after it. `from` is the opacity the fade-out starts at: a leaving element
 * fades out from where it is.
 *
 * @example
 * ```
 * const dip = playReducedMotionDip(scroller, fade, () => scroller.scrollTo({top}));
 * // A newer change replaces it:
 * dip.cancel();
 * ```
 */
export function playReducedMotionDip(
  element: Element,
  fade: ReducedMotionFade,
  land: () => void,
  from = 1,
): ReducedMotionDip {
  const half = fade.duration / 2;
  let isCancelled = false;
  let fadeIn: Animation | null = null;
  const fadeOut = element.animate(
    [{opacity: from, easing: fade.easing}, {opacity: 0}],
    {duration: half, fill: 'forwards'},
  );
  fadeOut.finished.then(
    () => {
      if (isCancelled) {
        return;
      }
      land();
      // The fade-in holds 0 until it starts: after a long stall, its start can
      // come after the frame that runs this.
      fadeIn = element.animate(
        [{opacity: 0, easing: fade.easing}, {opacity: 1}],
        {duration: half, fill: 'backwards'},
      );
      // The fade-in keeps the dip's own schedule: it starts where the fade-out
      // ended, so the dip keeps its length. The clock is read after the
      // landing, because a frame's timestamp does not count the landing's own
      // work. After a long stall, half of the fade-in still plays.
      const fadeOutEnd = endTime(fadeOut, half);
      if (fadeOutEnd != null) {
        fadeIn.startTime = Math.max(fadeOutEnd, performance.now() - half / 2);
      }
      // The fade-in now holds the opacity, so the held 0 can go.
      fadeOut.cancel();
    },
    // A cancelled fade-out rejects `finished`: nothing lands.
    () => {},
  );
  return {
    cancel() {
      isCancelled = true;
      fadeOut.cancel();
      fadeIn?.cancel();
    },
  };
}

/** When `animation` was due to end, on its timeline (ms), if it has started. */
function endTime(animation: Animation, duration: number): number | null {
  const start = animation.startTime;
  return typeof start === 'number' ? start + duration : null;
}
