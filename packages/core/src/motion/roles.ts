// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file roles.ts
 * @input The motion tables (motion/uikit and each component's own table)
 * @output registerMotionTable, motionRoleOf, motionRoleIn, listMotionRoles,
 *   motionRoleVariable, and the CSS form of a role's value
 *   (formatMotionRoleValue, parseMotionRoleValue)
 * @position Motion foundation, internal to core: read by the code that
 *   resolves a role when a motion starts. No public API writes a role: touch
 *   motion stays internal until the public motion-token set is decided.
 *
 * A motion role is one value of a motion table: a
 * spring, a duration (a key ending in `Ms`, in milliseconds) or a curve (four
 * cubic-bézier control points). The roles are the ones `spec:AST-094` FR4
 * names, each by its table path, such as `springs.settle` or
 * `timing.curves.move`: a table lists its roles when it registers, and every
 * other value, a component's measured spring included, stays an internal
 * constant. No shipped component reads the roles yet.
 * A role is carried by one CSS custom property, `--motion-` followed by its id
 * in kebab case (`--motion-springs-settle`), which nothing public writes; an
 * empty property means the table's value, so the table stays the one measured
 * source of every value.
 *
 * Gesture thresholds, the velocity filter, the timings that decide who gets a
 * touch and haptics are not motion: they are not roles (tables leave them out
 * with `exclude`).
 *
 * SYNC: When modified, update /packages/core/src/motion/roles.test.ts.
 */

import {
  formatMotionRoleValue,
  isCurve,
  isMotionRoleId,
  isSpring,
  motionRoleVariable,
  type MotionCurvePoints,
  type MotionRoleKind,
} from './roleValue';
import type {DurationBounce, SpringDescription} from './spring';

export {formatMotionRoleValue, isMotionRoleId, motionRoleVariable};
export type {MotionCurvePoints, MotionRoleKind};

/** One registered role. */
export interface MotionRole {
  /** The table path, e.g. `springs.sheetDetent`. */
  readonly id: string;
  readonly kind: MotionRoleKind;
  /** The CSS custom property that carries the role's value. */
  readonly variable: string;
  /** The table's value: what plays when the property is empty. */
  readonly value: SpringDescription | number | MotionCurvePoints;
}

const rolesById = new Map<string, MotionRole>();
/** A table id → the table registered under it. */
const tablesById = new Map<string, object>();
/** A spring or curve leaf → its role. */
const roleOfLeaf = new WeakMap<object, MotionRole>();
/** A table or one of its groups → its path. */
const pathOfGroup = new WeakMap<object, string>();
/** A table path → the role id it is registered under, when renamed. */
const roleIdOfPath = new Map<string, string>();

/**
 * Registers a motion table: each spring, `…Ms` duration and curve leaf that
 * `roles` lists (its role name, relative to the table) becomes a role named
 * by its path under `id`; the table's other values stay internal constants. A leaf object the table shares between
 * two keys is replaced in the table by an equal copy, so each role has its own
 * object (an animator resolves a role from the object it is handed).
 * `exclude` lists paths, relative to the table, that are not motion;
 * `rename` maps a path, relative to the table, to the role name it is
 * registered under (relative too), so a role is named for its use while the
 * table keeps its source's name. Registering the same table under the same id
 * again does nothing.
 */
export function registerMotionTable(
  id: string,
  table: object,
  {
    roles = [],
    exclude = [],
    rename = {},
  }: {
    roles?: ReadonlyArray<string>;
    exclude?: ReadonlyArray<string>;
    rename?: Readonly<Record<string, string>>;
  } = {},
): void {
  if (!/^[a-z][A-Za-z0-9]*$/.test(id)) {
    throw new Error(`motion table id "${id}" must be one camelCase word`);
  }
  // Registering the same table again changes nothing: each table's
  // register function may run from every touch module that uses it.
  if (tablesById.get(id) === table) {
    return;
  }
  tablesById.set(id, table);
  const skip = new Set(exclude.map(path => `${id}.${path}`));
  const listed = new Set(roles.map(name => `${id}.${name}`));
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
      const relative = path.slice(id.length + 1);
      const roleId = relative in rename ? `${id}.${rename[relative]}` : path;
      // Only the roles the table lists; every other value stays internal.
      if (!listed.has(roleId)) {
        continue;
      }
      if (roleId !== path) {
        roleIdOfPath.set(path, roleId);
      }
      let leaf = value as SpringDescription | number | MotionCurvePoints;
      if (typeof leaf === 'object') {
        const taken = roleOfLeaf.get(leaf);
        if (taken != null && taken.id !== roleId) {
          leaf = Object.freeze(Array.isArray(leaf) ? [...leaf] : {...leaf}) as
            SpringDescription | MotionCurvePoints;
          group[key] = leaf;
        }
      }
      const role: MotionRole = {
        id: roleId,
        kind,
        variable: motionRoleVariable(roleId),
        value: leaf,
      };
      rolesById.set(roleId, role);
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
  if (prefix == null) {
    return undefined;
  }
  const path = `${prefix}.${key}`;
  return rolesById.get(roleIdOfPath.get(path) ?? path);
}

/** The role with this id, once its table is registered. */
export function motionRole(id: string): MotionRole | undefined {
  return rolesById.get(id);
}

/** Every registered role, by id. */
export function listMotionRoles(): MotionRole[] {
  return [...rolesById.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
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
    // A bounce of 1 is undamped: it never settles.
    return duration > 0 && bounce > -1 && bounce < 1
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
