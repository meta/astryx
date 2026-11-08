// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file resolveMotion.ts
 * @input A motion role: a spring or curve of a registered motion table, or a
 *   table group and the key of one of its values. The element the motion
 *   plays on, for its theme's tempo (themeTempo.ts)
 * @output resolveMotion: the role's value at the theme's tempo.
 *   resolveSettleMs: how long a spring role, or one move on it, takes to
 *   settle there, for a CSS part that plays with it
 * @position Motion foundation; the animator resolves every spring and curve
 *   it is handed with it, and components resolve the durations they time
 *   with it
 *
 * Every touch motion passes through here, so the role a value plays is named
 * in one place. The per-role tables stay internal (`spec:AST-094` DEC-15).
 * Nothing reads a role's own CSS variable, and no page or theme style sets a
 * role. Nothing here reads layout, listens or observes, imports a table, or
 * runs on import or on the server.
 *
 * The value plays at the tempo of the theme the element is in. The tempo
 * stretches a spring and scales a duration. A curve, a part that follows a
 * finger, and a busy loop play as measured. At tempo 1 every role plays
 * exactly its table value.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/resolveMotion.test.ts
 * - /packages/core/src/motion/animator.ts (resolves each role it plays)
 */

import {motionRoleIn, motionRoleOf} from './roles';
import {isSpring} from './roleValue';
import type {MotionCurvePoints} from './roles';
import {
  settlingDuration,
  solveSpring,
  toSpring,
  type SpringDescription,
} from './spring';
import {themeTempo} from './themeTempo';

/**
 * The roles the tempo leaves as measured: the parts that follow a finger,
 * and ProgressBar's busy loop.
 */
const FIXED_ROLES: ReadonlySet<string> = new Set([
  'springs.fingerTracking',
  'switchControl.tracking',
  'progress.reducedMotionPulseMs',
]);

/** Each role spring at each tempo, so a role resolves to one object per tempo. */
const springsAtTempo = new WeakMap<object, Map<number, SpringDescription>>();

/**
 * `spring` at `tempo`. In each of its forms, the undamped period grows by the
 * tempo and the damping ratio stays. So the motion keeps its shape and takes
 * `tempo` times as long.
 */
function springAtTempo(
  spring: SpringDescription,
  tempo: number,
): SpringDescription {
  let byTempo = springsAtTempo.get(spring);
  if (byTempo == null) {
    byTempo = new Map();
    springsAtTempo.set(spring, byTempo);
  }
  let scaled = byTempo.get(tempo);
  if (scaled == null) {
    if ('response' in spring) {
      scaled = {
        response: spring.response * tempo,
        dampingRatio: spring.dampingRatio,
      };
    } else if ('duration' in spring) {
      scaled = {duration: spring.duration * tempo, bounce: spring.bounce};
    } else {
      scaled = {
        ...(spring.mass == null ? null : {mass: spring.mass}),
        stiffness: spring.stiffness / (tempo * tempo),
        damping: spring.damping / tempo,
      };
    }
    byTempo.set(tempo, scaled);
  }
  return scaled;
}

/**
 * A motion role's value at the tempo of the theme `element` is in. Hand it a
 * spring or curve of a motion table, or a table group and a key (the way to
 * name a duration, which is a bare number):
 *
 * @example
 * ```
 * const spring = resolveMotion(sheet, springs.settle);
 * const fadeMs = resolveMotion(row, timing, 'stateChangeMs');
 * ```
 *
 * The element names where the motion plays. Anything that is not a role
 * comes back unchanged. So a spring written inline at a call site keeps
 * working, and a resolved spring is not scaled again.
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
  element: Element | null | undefined,
  leafOrGroup: object,
  key?: string,
): unknown {
  const value =
    key === undefined
      ? leafOrGroup
      : (leafOrGroup as Record<string, unknown>)[key];
  const role =
    key === undefined
      ? motionRoleOf(leafOrGroup)
      : motionRoleIn(leafOrGroup, key);
  if (role == null || role.kind === 'curve' || FIXED_ROLES.has(role.id)) {
    return value;
  }
  const tempo = themeTempo(element);
  if (tempo === 1) {
    return value;
  }
  if (typeof value === 'number') {
    return value * tempo;
  }
  return isSpring(value) ? springAtTempo(value, tempo) : value;
}

/** One move a spring plays, as the animator plays it. */
export interface SpringMove {
  readonly from: number;
  readonly to: number;
  /** The start velocity, in units per second. 0 by default. */
  readonly velocity?: number;
  /** The move is over once it stays this close to `to`. */
  readonly epsilon: number;
}

/**
 * How long `spring` takes to settle, in milliseconds, at the tempo of the
 * theme `element` is in. A CSS part that plays with the spring takes this
 * duration, such as a scrim's fade under a sheet. Then the two start and land
 * together on one clock. Without `move`, it is the resolved spring's settling
 * duration. With `move`, it is how long that move plays. The animator times
 * its moves the same way, so a part that plays with one passes the move. A
 * fixed role, or a spring that is not a role, gives its own.
 *
 * @example
 * ```
 * scrim.style.transitionDuration = `${resolveSettleMs(sheet, springs.settle)}ms`;
 * ```
 */
export function resolveSettleMs(
  element: Element | null | undefined,
  spring: SpringDescription,
  move?: SpringMove,
): number {
  const resolved = toSpring(resolveMotion(element, spring));
  return move == null
    ? settlingDuration(resolved) * 1000
    : solveSpring(resolved, move).settleTime(move.epsilon) * 1000;
}
