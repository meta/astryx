// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file themeTiming.ts
 * @input An element and the theme tokens that time one motion
 * @output readThemeTiming: the theme's eased progress from 0 to 1 for those
 *   tokens where the element is, as one timed MotionCurve. easedProgress:
 *   that curve for a length and an easing already read.
 * @position Motion foundation, internal to core. Motion that a tap, a key or
 *   the program starts reads its duration and easing from the theme with it.
 *
 * SYNC: When modified, update /packages/core/src/motion/themeTiming.test.ts
 */

import type {MotionCurve} from './animator';
import {cubicBezier} from './bezier';
import {parseCssEasing, parseMotionRoleValue} from './roles';
import {
  durationDefaults,
  easeDefaults,
  type DurationVarName,
  type EaseVarName,
} from '../theme/tokens.stylex';

/**
 * The theme tokens that time one motion. The duration tokens are a fallback
 * chain, and the last one always has a default.
 */
export interface ThemeTimingTokens {
  readonly durations: readonly [...string[], DurationVarName];
  readonly easing: EaseVarName;
}

/**
 * The eased progress from 0 to 1 over `seconds`, as a MotionCurve whose
 * velocity is in progress per second. A zero length means no motion.
 */
export function easedProgress(
  seconds: number,
  ease: (x: number) => number,
): MotionCurve {
  const at = (t: number) =>
    seconds <= 0 || t >= seconds ? 1 : ease(Math.max(0, t) / seconds);
  // A central difference, one step inside the curve at either end.
  const step = Math.min(1e-3, seconds / 100);
  return {
    duration: seconds,
    at,
    velocity: t => {
      if (seconds <= 0 || t >= seconds) {
        return 0;
      }
      const before = Math.max(0, t - step);
      const after = Math.min(seconds, t + step);
      return (at(after) - at(before)) / (after - before);
    },
  };
}

/**
 * The eased progress on the tokens, from 0 to 1, as a MotionCurve whose
 * velocity is in progress per second. It reads the tokens where the element
 * is, so a theme scope and the theme's tempo apply. An explicit zero duration
 * means no motion. An unset, empty or unparseable duration falls back to the
 * next token in the chain. The last token falls back to its default, so a bad
 * value never means no motion. An unset or unparseable easing gets its
 * default.
 */
export function readThemeTiming(
  element: Element,
  {durations, easing}: ThemeTimingTokens,
): MotionCurve {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const read = (name: string) => style?.getPropertyValue(name) ?? '';
  let durationMs: number | null = null;
  for (const name of durations) {
    durationMs = parseMotionRoleValue('duration', read(name));
    if (durationMs != null) {
      break;
    }
  }
  const last = durations[durations.length - 1] as DurationVarName;
  durationMs ??= parseMotionRoleValue('duration', durationDefaults[last]) ?? 0;
  const points = parseCssEasing(read(easing)) ??
    parseCssEasing(easeDefaults[easing]) ?? [0, 0, 1, 1];
  return easedProgress(durationMs / 1000, cubicBezier(points));
}
