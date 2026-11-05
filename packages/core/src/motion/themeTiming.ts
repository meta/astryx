// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file themeTiming.ts
 * @input An element, and the CSS or the theme tokens that time one motion
 * @output readThemeTiming: the eased progress from 0 to 1 that times a motion,
 *   as one timed MotionCurve. It reads the element's own transition, or
 *   tokens where the element is. readThemeTokens and resolveTiming: that
 *   duration and easing as values. easedProgress: the curve for a length and
 *   an easing already read.
 * @position Motion foundation, internal to core. Motion that a tap, a key or
 *   the program starts reads its duration and easing from the theme with it.
 *
 * SYNC: When modified, update /packages/core/src/motion/themeTiming.test.ts
 *   and /packages/core/src/motion/__tests__/themeTiming.interaction.browser.spec.ts
 */

import type {MotionCurve} from './animator';
import {cubicBezier} from './bezier';
import {parseCssEasing, parseMotionRoleValue} from './roles';
import type {MotionCurvePoints} from './roleValue';
import {resolveTokenReferences} from '../theme/tokenReferences';
import {
  durationDefaults,
  easeDefaults,
  type DurationVarName,
  type EaseVarName,
} from '../theme/tokens.stylex';

/** The theme tokens that time one motion. */
export interface ThemeTimingTokens {
  readonly duration: DurationVarName;
  readonly easing: EaseVarName;
}

/** A duration and an easing that time a motion, each null when unresolved. */
export interface ResolvedTiming {
  /** The duration in ms, zero or more. */
  readonly ms: number | null;
  readonly points: MotionCurvePoints | null;
}

/**
 * The eased progress from 0 to 1 over `seconds`, as a MotionCurve whose
 * velocity is in progress per second. A curve of no length is at its end.
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

/** The first transition's duration in a computed style, in ms. */
function firstDurationMs(style: CSSStyleDeclaration): number | null {
  return parseMotionRoleValue(
    'duration',
    style.transitionDuration.split(',')[0] ?? '',
  );
}

/** The first transition's easing in a computed style. */
function firstEasing(style: CSSStyleDeclaration): MotionCurvePoints | null {
  return parseCssEasing(
    style.transitionTimingFunction.split(/,(?![^(]*\))/)[0] ?? '',
  );
}

/** The curve for a duration and an easing, or null if either cannot play. */
function progressOf({ms, points}: ResolvedTiming): MotionCurve | null {
  if (ms == null || ms <= 0 || points == null) {
    return null;
  }
  return easedProgress(ms / 1000, cubicBezier(points));
}

/**
 * A duration and an easing written in CSS, resolved as a transition resolves
 * them where `element` is. A plain time or easing parses as written. Other
 * text, such as `calc()`, resolves on a hidden probe's transition. The
 * duration is null when it is not a time of zero or more. The easing is null
 * when it is not a cubic Bézier, and a text left out gives null.
 */
export function resolveTiming(
  element: Element,
  {duration, easing}: {readonly duration?: string; readonly easing?: string},
): ResolvedTiming {
  const plainMs =
    duration == null ? null : parseMotionRoleValue('duration', duration);
  const plainPoints = easing == null ? null : parseCssEasing(easing);
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  const needsMs = duration != null && plainMs == null;
  const needsPoints = easing != null && plainPoints == null;
  if (view == null || (!needsMs && !needsPoints)) {
    return {ms: plainMs, points: plainPoints};
  }
  const probe = doc.createElement('span');
  // A computed value needs no layout, so the probe never renders.
  probe.style.setProperty('display', 'none', 'important');
  // The browser refuses a value it cannot read, and the property stays unset.
  const takes = (property: string, value: string) => {
    probe.style.setProperty(property, value, 'important');
    return probe.style.getPropertyValue(property) !== '';
  };
  const hasMs = needsMs && takes('transition-duration', duration);
  const hasPoints = needsPoints && takes('transition-timing-function', easing);
  (doc.body ?? doc.documentElement).append(probe);
  try {
    const style = view.getComputedStyle(probe);
    return {
      ms: hasMs ? firstDurationMs(style) : plainMs,
      points: hasPoints ? firstEasing(style) : plainPoints,
    };
  } finally {
    probe.remove();
  }
}

/**
 * The value of `token` in `style`. With none, it is the default core declares,
 * and the references in that default read their own tokens in `style` too.
 */
function tokenValue(
  style: CSSStyleDeclaration,
  token: DurationVarName | EaseVarName,
): string {
  const own = style.getPropertyValue(token).trim();
  if (own !== '') {
    return own;
  }
  const declared: Record<string, string> = {};
  for (const [name, value] of Object.entries({
    ...durationDefaults,
    ...easeDefaults,
  })) {
    declared[name] = style.getPropertyValue(name).trim() || value;
  }
  return resolveTokenReferences(declared)[token] ?? '';
}

/**
 * The duration and easing of theme tokens where `element` is, resolved as a
 * transition resolves them. A token with no value there reads the default
 * core declares. A token left out gives null.
 */
export function readThemeTokens(
  element: Element,
  {
    duration,
    easing,
  }: {readonly duration?: DurationVarName; readonly easing?: EaseVarName},
): ResolvedTiming {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style == null) {
    return {ms: null, points: null};
  }
  return resolveTiming(element, {
    duration: duration == null ? undefined : tokenValue(style, duration),
    easing: easing == null ? undefined : tokenValue(style, easing),
  });
}

/**
 * The eased progress from 0 to 1 that times a motion of `element`, as a
 * MotionCurve whose velocity is in progress per second. With no tokens, it
 * reads the element's own transition, where its stylesheet applies the
 * theme's tokens. With tokens, it reads them as readThemeTokens does. Null
 * when the duration is not a positive length or the easing does not parse:
 * the caller decides what that motion does.
 */
export function readThemeTiming(
  element: Element,
  tokens?: ThemeTimingTokens,
): MotionCurve | null {
  if (tokens != null) {
    return progressOf(readThemeTokens(element, tokens));
  }
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return style == null
    ? null
    : progressOf({ms: firstDurationMs(style), points: firstEasing(style)});
}
