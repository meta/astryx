// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file resolveMotion.ts
 * @input A motion role: a spring or curve of a registered motion table, or a
 *   table group and the key of one of its values
 * @output resolveMotion: the role's value
 * @position Motion foundation; the animator resolves every spring and curve
 *   it is handed with it, and components resolve the durations they time
 *   with it
 *
 * Every touch motion passes through here, so the role a value plays is named
 * in one place. Until the public motion-token set is decided, a role plays
 * its table value: touch motion stays internal (`spec:AST-094` DEC-11), so
 * nothing reads a role's CSS variable and no page or theme style can retune
 * it. Nothing here reads style or layout, listens or observes, imports a
 * table, or runs on import or on the server.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/resolveMotion.test.ts
 * - /packages/core/src/motion/animator.ts (resolves each role it plays)
 */

import type {MotionCurvePoints} from './roles';
import type {SpringDescription} from './spring';

/**
 * A motion role's value: the table's value while touch motion stays internal
 * (`spec:AST-094` DEC-11). Hand it a spring or curve of a motion table, or a
 * table group and a key (the way to name a duration, which is a bare number):
 *
 * @example
 * ```
 * const spring = resolveMotion(sheet, springs.settle);
 * const fadeMs = resolveMotion(row, timing, 'stateChangeMs');
 * ```
 *
 * The element names where the motion plays, for when a public role reaches
 * it; anything that is not a role comes back unchanged too, so a spring
 * written inline at a call site keeps working.
 */
export function resolveMotion<T extends SpringDescription>(
  element: Element | null | undefined,
  spring: T,
): T | SpringDescription;
export function resolveMotion(
  element: Element | null | undefined,
  curve: MotionCurvePoints,
): MotionCurvePoints;
export function resolveMotion<G extends object, K extends keyof G & string>(
  element: Element | null | undefined,
  group: G,
  key: K,
): G[K] extends number
  ? number
  : G[K] extends MotionCurvePoints
    ? MotionCurvePoints
    : G[K] | SpringDescription;
export function resolveMotion(
  _element: Element | null | undefined,
  leafOrGroup: object,
  key?: string,
): unknown {
  return key === undefined
    ? leafOrGroup
    : (leafOrGroup as Record<string, unknown>)[key];
}
