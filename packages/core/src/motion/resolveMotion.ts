// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file resolveMotion.ts
 * @input An element and a motion role: a spring or curve of a registered
 *   motion table, or a table group and the key of one of its values
 * @output resolveMotion: the role's value under the element's theme, or the
 *   table's value when no theme sets it
 * @position Motion foundation; the animator resolves every spring and curve
 *   it is handed with it, and components resolve the durations they time
 *   with it
 *
 * A theme sets a role by writing its CSS variable (motion/roles.ts) on its
 * scope, the nearest `[data-astryx-theme]` element (or the root element). The
 * value is read from that scope's computed style when a motion starts: a style
 * read, never a layout, and at most once per scope and role until something
 * that can change it happens (a theme attribute changes, theme CSS is inserted
 * or edited, the window resizes, or the pointer, contrast or reduced-motion
 * preference changes). An empty or malformed value means the table's value.
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
  epoch: number;
  values: Map<string, string>;
}

const scopes = new WeakMap<Element, ScopeValues>();
const watched = new WeakSet<Document>();
let epoch = 0;

/** Media queries whose change can switch an adaptation rule on or off. */
const ENVIRONMENT_QUERIES = [
  '(pointer: coarse)',
  '(pointer: fine)',
  '(prefers-reduced-motion: reduce)',
  '(prefers-contrast: more)',
  '(prefers-contrast: less)',
];

/** Starts watching what can change a theme's motion values, once per document. */
function watch(doc: Document): void {
  if (watched.has(doc)) {
    return;
  }
  watched.add(doc);
  const invalidate = () => {
    epoch += 1;
  };
  if (typeof MutationObserver === 'function') {
    const observer = new MutationObserver(invalidate);
    observer.observe(doc.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-astryx-theme', 'data-theme'],
    });
    if (doc.head != null) {
      observer.observe(doc.head, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    }
  }
  const view = doc.defaultView;
  if (view != null) {
    view.addEventListener('resize', invalidate);
    for (const query of ENVIRONMENT_QUERIES) {
      view.matchMedia?.(query).addEventListener?.('change', invalidate);
    }
  }
}

/** The raw value of a role's CSS variable under `element`'s theme scope. */
function readVariable(element: Element, role: MotionRole): string {
  const doc = element.ownerDocument;
  const view = doc?.defaultView;
  if (view == null || !element.isConnected) {
    return '';
  }
  watch(doc);
  const scope = element.closest('[data-astryx-theme]') ?? doc.documentElement;
  let cached = scopes.get(scope);
  if (cached == null || cached.epoch !== epoch) {
    cached = {epoch, values: new Map()};
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
 * A motion role's value under `element`'s theme: the value a theme set with
 * `defineTheme({motion})`, or the table's value when none did. Hand it a
 * spring or curve of a motion table, or a table group and a key (the way to
 * name a duration, which is a bare number):
 *
 * @example
 * ```
 * const spring = resolveMotion(sheet, springs.sheetPresent);
 * const fadeMs = resolveMotion(row, timing.press, 'highlightOutMs');
 * ```
 *
 * Anything that is not a registered role comes back unchanged, so a spring
 * written inline at a call site keeps working.
 * @experimental
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
