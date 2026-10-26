// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file roleValue.ts
 * @input A role id, or a role's kind and value
 * @output isMotionRoleId, motionRoleVariable and formatMotionRoleValue (a
 *   role value's CSS form), with the role kinds
 * @position The value half of the internal motion roles: no registry and
 *   no parsing. roles.ts holds the registry and re-exports these.
 *
 * SYNC: When modified, update /packages/core/src/motion/roles.test.ts.
 */

import {durationBounceOf, toSpring, type SpringDescription} from './spring';

/** The three kinds of value a role can hold. */
export type MotionRoleKind = 'spring' | 'duration' | 'curve';

/** Cubic-bézier control points `[x1, y1, x2, y2]`. */
export type MotionCurvePoints = readonly [number, number, number, number];

const ROLE_ID = /^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/;

/** Whether `id` is a well-formed role name (a dotted table path). */
export function isMotionRoleId(id: string): boolean {
  return ROLE_ID.test(id);
}

/** The CSS custom property for a role: `--motion-` + the path in kebab case. */
export function motionRoleVariable(id: string): string {
  if (!isMotionRoleId(id)) {
    throw new Error(
      `motion role "${id}" must be a dotted table path such as "springs.sheetPresent"`,
    );
  }
  return `--motion-${id
    .split('.')
    .map(part => part.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`))
    .join('-')}`;
}

export function isSpring(value: unknown): value is SpringDescription {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return (
    ('response' in value && 'dampingRatio' in value) ||
    ('duration' in value && 'bounce' in value) ||
    ('stiffness' in value && 'damping' in value)
  );
}

export function isCurve(value: unknown): value is MotionCurvePoints {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every(n => typeof n === 'number')
  );
}

/** Six significant digits: enough for any motion, free of float noise. */
export function short(n: number): string {
  return String(Number(n.toPrecision(6)));
}

/**
 * A role value as its CSS custom property holds it:
 * - spring: SwiftUI's duration and bounce, `0.5s 0.15` (exact for every
 *   spring: mass folds into the duration, overdamping into a negative bounce);
 * - duration: `250ms`;
 * - curve: `cubic-bezier(0.42, 0, 0.58, 1)`, usable as is in CSS.
 * Throws on a value that is not a valid value of its kind.
 */
export function formatMotionRoleValue(
  kind: MotionRoleKind,
  value: unknown,
): string {
  if (kind === 'spring') {
    if (!isSpring(value)) {
      throw new TypeError(
        'a spring is {response, dampingRatio}, {duration, bounce} or {mass?, stiffness, damping}',
      );
    }
    const {duration, bounce} = durationBounceOf(toSpring(value));
    if (!(bounce < 1)) {
      throw new RangeError(
        'a spring must settle: its bounce must be below 1 (a damping ratio above 0)',
      );
    }
    return `${short(duration)}s ${short(bounce)}`;
  }
  if (kind === 'duration') {
    if (!(typeof value === 'number' && Number.isFinite(value) && value >= 0)) {
      throw new TypeError('a duration is a finite number of milliseconds ≥ 0');
    }
    return `${short(value)}ms`;
  }
  if (!isCurve(value) || !value.every(Number.isFinite)) {
    throw new TypeError('a curve is four finite numbers [x1, y1, x2, y2]');
  }
  if (value[0] < 0 || value[0] > 1 || value[2] < 0 || value[2] > 1) {
    throw new RangeError("a curve's x1 and x2 must lie in [0, 1]");
  }
  return `cubic-bezier(${value.map(short).join(', ')})`;
}
