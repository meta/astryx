// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file resolveMotion.ts
 * @input An element and a motion role: a spring or curve of a registered
 *   motion table, or a table group and the key of one of its values
 * @output resolveMotion: the role's value set on the element's scope, or the
 *   table's value when none is set
 * @position Motion foundation; the animator resolves every spring and curve
 *   it is handed with it, and components resolve the durations they time
 *   with it
 *
 * Only a registered table's leaves are roles: the touch code that animates
 * with a table calls its register<Name>Table() first, and a leaf of a table
 * nothing registered plays its own value. Nothing here imports a table.
 *
 * A role's value is set by writing its CSS variable (motion/roles.ts) on a
 * scope, the nearest `[data-astryx-theme]` element (or the root element);
 * nothing public writes one while touch motion stays internal. The
 * value is read from that scope's computed style when a motion starts: a style
 * read, never a layout, and at most once per scope and role per task (the
 * motions one task starts share it), or again within the task when the
 * scope's theme attribute changes. Nothing is listened to or observed. An empty or malformed
 * value means the table's value.
 * Nothing runs on import or on the server, and a detached element reads the
 * table's value.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/resolveMotion.test.ts
 * - /packages/core/src/motion/animator.ts (resolves each role it plays)
 */

import {
  motionRoleIn,
  motionRoleOf,
  parseMotionRoleValue,
  type MotionCurvePoints,
  type MotionRole,
} from './roles';
import type {SpringDescription} from './spring';

interface ScopeValues {
  /** The task the values were read in. */
  task: number;
  /** The theme attributes they were read under. */
  theme: string;
  values: Map<string, string>;
}

const scopes = new WeakMap<Element, ScopeValues>();

/**
 * The current task: a number that changes once the task that read it ends,
 * so values are shared by the motions one task starts and read again by the
 * next. Nothing is listened to or observed.
 */
let task = 0;
let taskEnding = false;
function currentTask(): number {
  if (!taskEnding) {
    taskEnding = true;
    queueMicrotask(() => {
      taskEnding = false;
      task += 1;
    });
  }
  return task;
}

/** The raw value of a role's CSS variable under `element`'s theme scope. */
function readVariable(element: Element, role: MotionRole): string {
  const doc = element.ownerDocument;
  const view = doc?.defaultView;
  if (view == null || !element.isConnected) {
    return '';
  }
  const scope = element.closest('[data-astryx-theme]') ?? doc.documentElement;
  // A theme switched earlier in this task changes these attributes.
  const theme = `${scope.getAttribute('data-astryx-theme') ?? ''} ${
    doc.documentElement.getAttribute('data-theme') ?? ''
  }`;
  const now = currentTask();
  let cached = scopes.get(scope);
  if (cached == null || cached.task !== now || cached.theme !== theme) {
    cached = {task: now, theme, values: new Map()};
    scopes.set(scope, cached);
  }
  let value = cached.values.get(role.variable);
  if (value == null) {
    value = view.getComputedStyle(scope).getPropertyValue(role.variable);
    cached.values.set(role.variable, value);
  }
  return value;
}

function resolveRole<T>(
  element: Element | null | undefined,
  role: MotionRole | undefined,
  fallback: T,
): T | SpringDescription | MotionCurvePoints | number {
  if (role == null || element == null) {
    return fallback;
  }
  return (
    parseMotionRoleValue(role.kind, readVariable(element, role)) ?? fallback
  );
}

/**
 * A motion role's value under `element`'s scope: the value its CSS variable
 * carries there, or the table's value when none is set. Hand it a
 * spring or curve of a motion table, or a table group and a key (the way to
 * name a duration, which is a bare number):
 *
 * @example
 * ```
 * const spring = resolveMotion(sheet, springs.settle);
 * const fadeMs = resolveMotion(row, timing.press, 'highlightOutMs');
 * ```
 *
 * Anything that is not a registered role comes back unchanged, so a spring
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
  element: Element | null | undefined,
  leafOrGroup: object,
  key?: string,
): unknown {
  if (key === undefined) {
    return resolveRole(element, motionRoleOf(leafOrGroup), leafOrGroup);
  }
  return resolveRole(
    element,
    motionRoleIn(leafOrGroup, key),
    (leafOrGroup as Record<string, unknown>)[key],
  );
}
