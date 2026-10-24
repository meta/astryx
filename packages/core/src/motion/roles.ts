// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file roles.ts
 * @input The motion tables (motion/uikit and each component's own table)
 * @output registerMotionTable, motionRoleOf, motionRoleIn, listMotionRoles,
 *   motionRoleVariable, and the CSS form of a role's value
 *   (formatMotionRoleValue, parseMotionRoleValue)
 * @position Motion foundation; read by the theme (`defineTheme({motion})`
 *   writes role values) and by the code that resolves a role when a motion
 *   starts
 *
 * A motion role is one value of a motion table that a theme may retune: a
 * spring, a duration (a key ending in `Ms`, in milliseconds) or a curve (four
 * cubic-bézier control points). It is named by its table path, for example
 * `springs.sheetDetent`, `timing.curves.easeInOut` or `sheet.present`, and
 * carried by one CSS custom property, `--motion-` followed by the path in
 * kebab case (`--motion-springs-sheet-detent`). A theme writes that property
 * only for the roles it sets; an empty property means the table's value, so
 * the table stays the one measured source of every default.
 *
 * Gesture thresholds, the velocity filter, the timings that decide who gets a
 * touch and haptics are not motion: they are not roles (tables leave them out
 * with `exclude`).
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/roles.test.ts
 * - /scripts/generate-motion-roles.mjs (the generated role table in docs)
 */

import {
  durationBounceOf,
  toSpring,
  type DurationBounce,
  type SpringDescription,
} from './spring';

/** The three kinds of value a role can hold. */
export type MotionRoleKind = 'spring' | 'duration' | 'curve';

/**
 * Cubic-bézier control points `[x1, y1, x2, y2]`.
 * @experimental
 */
export type MotionCurvePoints = readonly [number, number, number, number];

/** One registered role. */
export interface MotionRole {
  /** The table path, e.g. `springs.sheetDetent`. */
  readonly id: string;
  readonly kind: MotionRoleKind;
  /** The CSS custom property that carries a theme's value. */
  readonly variable: string;
  /** The table's value: the default when no theme sets the role. */
  readonly value: SpringDescription | number | MotionCurvePoints;
}

const ROLE_ID = /^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/;

const rolesById = new Map<string, MotionRole>();
/** A spring or curve leaf → its role. */
const roleOfLeaf = new WeakMap<object, MotionRole>();
/** A table or one of its groups → its path. */
const pathOfGroup = new WeakMap<object, string>();

/** Whether `id` is a well-formed role name (a dotted table path). */
export function isMotionRoleId(id: string): boolean {
  return ROLE_ID.test(id);
}

/** The CSS custom property for a role: `--motion-` + the path in kebab case. */
export function motionRoleVariable(id: string): string {
  if (!isMotionRoleId(id)) {
    throw new Error(
      `motion role "${id}" must be a dotted table path such as "sheet.present"`,
    );
  }
  return `--motion-${id
    .split('.')
    .map(part => part.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`))
    .join('-')}`;
}

function isSpring(value: unknown): value is SpringDescription {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return (
    ('response' in value && 'dampingRatio' in value) ||
    ('duration' in value && 'bounce' in value) ||
    ('stiffness' in value && 'damping' in value)
  );
}

function isCurve(value: unknown): value is MotionCurvePoints {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every(n => typeof n === 'number')
  );
}

/**
 * Registers a motion table: each spring, `…Ms` duration and curve leaf becomes
 * a role named by its path under `id`. A leaf object the table shares between
 * two keys is replaced in the table by an equal copy, so each role has its own
 * object (an animator resolves a role from the object it is handed).
 * `exclude` lists paths, relative to the table, that are not motion.
 */
export function registerMotionTable(
  id: string,
  table: object,
  {exclude = []}: {exclude?: ReadonlyArray<string>} = {},
): void {
  if (!/^[a-z][A-Za-z0-9]*$/.test(id)) {
    throw new Error(`motion table id "${id}" must be one camelCase word`);
  }
  const skip = new Set(exclude.map(path => `${id}.${path}`));
  const walk = (group: Record<string, unknown>, prefix: string) => {
    pathOfGroup.set(group, prefix);
    for (const [key, value] of Object.entries(group)) {
      const path = `${prefix}.${key}`;
      if (skip.has(path)) {
        continue;
      }
      let kind: MotionRoleKind | null = null;
      if (isSpring(value)) {
        kind = 'spring';
      } else if (isCurve(value)) {
        kind = 'curve';
      } else if (typeof value === 'number' && key.endsWith('Ms')) {
        kind = 'duration';
      } else if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        walk(value as Record<string, unknown>, path);
        continue;
      }
      if (kind == null) {
        continue;
      }
      let leaf = value as SpringDescription | number | MotionCurvePoints;
      if (typeof leaf === 'object') {
        const taken = roleOfLeaf.get(leaf);
        if (taken != null && taken.id !== path) {
          leaf = Object.freeze(Array.isArray(leaf) ? [...leaf] : {...leaf}) as
            SpringDescription | MotionCurvePoints;
          group[key] = leaf;
        }
      }
      const role: MotionRole = {
        id: path,
        kind,
        variable: motionRoleVariable(path),
        value: leaf,
      };
      rolesById.set(path, role);
      if (typeof leaf === 'object') {
        roleOfLeaf.set(leaf, role);
      }
    }
  };
  walk(table as Record<string, unknown>, id);
}

/** The role a spring or curve leaf of a registered table plays, if any. */
export function motionRoleOf(leaf: unknown): MotionRole | undefined {
  return leaf !== null && typeof leaf === 'object'
    ? roleOfLeaf.get(leaf)
    : undefined;
}

/**
 * The role `group[key]` plays, for a table or one of its groups: the way to
 * name a duration, which is a bare number.
 */
export function motionRoleIn(
  group: object,
  key: string,
): MotionRole | undefined {
  const prefix = pathOfGroup.get(group);
  return prefix == null ? undefined : rolesById.get(`${prefix}.${key}`);
}

/** The role with this id, once its table is registered. */
export function motionRole(id: string): MotionRole | undefined {
  return rolesById.get(id);
}

/** Every registered role, by id. */
export function listMotionRoles(): MotionRole[] {
  return [...rolesById.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Six significant digits: enough for any motion, free of float noise. */
function short(n: number): string {
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

const NUMBER = '(-?(?:\\d+\\.?\\d*|\\.\\d+)(?:e-?\\d+)?)';
const SPRING_VALUE = new RegExp(`^${NUMBER}s\\s+${NUMBER}$`);
const DURATION_VALUE = new RegExp(`^${NUMBER}(ms|s)$`);
const CURVE_VALUE = new RegExp(
  `^cubic-bezier\\(\\s*${NUMBER}\\s*,\\s*${NUMBER}\\s*,\\s*${NUMBER}\\s*,\\s*${NUMBER}\\s*\\)$`,
);

/**
 * Reads a role value back from its CSS custom property. Returns null for an
 * empty or malformed value: the caller then uses the table's value.
 */
export function parseMotionRoleValue(
  kind: 'spring',
  text: string,
): DurationBounce | null;
export function parseMotionRoleValue(
  kind: 'duration',
  text: string,
): number | null;
export function parseMotionRoleValue(
  kind: 'curve',
  text: string,
): MotionCurvePoints | null;
export function parseMotionRoleValue(
  kind: MotionRoleKind,
  text: string,
): DurationBounce | number | MotionCurvePoints | null;
export function parseMotionRoleValue(
  kind: MotionRoleKind,
  text: string,
): DurationBounce | number | MotionCurvePoints | null {
  const value = text.trim();
  if (value === '') {
    return null;
  }
  if (kind === 'spring') {
    const m = SPRING_VALUE.exec(value);
    if (m == null) {
      return null;
    }
    const duration = Number(m[1]);
    const bounce = Number(m[2]);
    return duration > 0 && bounce > -1 && bounce <= 1
      ? {duration, bounce}
      : null;
  }
  if (kind === 'duration') {
    const m = DURATION_VALUE.exec(value);
    if (m == null) {
      return null;
    }
    const ms = Number(m[1]) * (m[2] === 's' ? 1000 : 1);
    return ms >= 0 ? ms : null;
  }
  const m = CURVE_VALUE.exec(value);
  if (m == null) {
    return null;
  }
  const points = [m[1], m[2], m[3], m[4]].map(Number) as unknown as [
    number,
    number,
    number,
    number,
  ];
  return points[0] >= 0 && points[0] <= 1 && points[2] >= 0 && points[2] <= 1
    ? points
    : null;
}
