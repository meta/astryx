// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file viewInputs.ts
 * @input The VegaChart props that own the Vega View lifecycle
 * @output The ViewInputs type plus latch/compare helpers VegaChart rebuilds on
 * @position Internal utility; used by VegaChart to decide when to rebuild
 *
 * SYNC: When modified, update /packages/vega/README.md
 */

import type {VegaChartProps} from './types';

/**
 * The props the Vega runtime is built from. A change to any of them produces
 * a different runtime, so the View is torn down and rebuilt. `data`,
 * `className`, `style`, and the callbacks are absent because none of them
 * change the runtime.
 */
export type ViewInputs = Pick<
  VegaChartProps,
  'spec' | 'compileOptions' | 'parseConfig' | 'parseOptions' | 'viewOptions'
>;

/**
 * The inputs the live View was built from, beside a structural copy of their
 * values at that moment.
 *
 * The copy is the whole point. Comparing the incoming props against the
 * *previous props* cannot see a spec mutated in place — both sides are the
 * same object, so the old value is already gone and the chart silently goes
 * stale. Comparing against a copy taken when the View was built can.
 *
 * The copy is also compared during render, so its verdict must be stable for
 * an unchanged input: a part that always reported "changed" would loop React
 * forever. See {@link Opaque} for the parts that cannot be copied.
 */
export type ViewInputsLatch = {
  /** The caller's own objects, handed to Vega untouched. */
  readonly inputs: ViewInputs;
  readonly snapshot: unknown;
};

/**
 * Deepest structure the copy walks. Vega and Vega-Lite specs nest far
 * shallower; the bound exists so a pathological input cannot make the walk
 * cost unbounded. Anything deeper is kept by reference (see {@link Opaque}).
 */
const MAX_DEPTH = 100;

/**
 * Stands in for a value the copy would not walk: a subtree deeper than
 * {@link MAX_DEPTH}, or one that re-enters an object already on the path (a
 * reference cycle).
 *
 * It keeps the reference it stood for, and that is the whole design. An
 * opaque part that always compared unequal would make `latchIsCurrent` false
 * on every render — and since the latch is refreshed during render, React
 * would re-render forever ("Too many re-renders"). Comparing the reference
 * instead is stable while the caller passes the same object, and rebuilds
 * exactly once when they pass a different one.
 *
 * What the narrowing costs differs by case. A cycle's re-entry edge points
 * back at an object the walk already copied, so a cyclic spec still has every
 * mutation detected. Past {@link MAX_DEPTH} the values below were never
 * copied, so an in-place edit down there is invisible until the caller passes
 * a different object — documented in the package README.
 */
type Opaque = {readonly [OPAQUE]: unknown};

const OPAQUE = Symbol('astryx.vega.opaque');

function opaque(value: unknown): Opaque {
  return {[OPAQUE]: value};
}

function isOpaque(value: unknown): value is Opaque {
  return typeof value === 'object' && value !== null && OPAQUE in value;
}

export function latchViewInputs(inputs: ViewInputs): ViewInputsLatch {
  return {inputs, snapshot: snapshotValue(inputs, 0, new Set())};
}

/**
 * Whether `inputs` still carries the values the latched View was built from.
 *
 * Plain objects and arrays are compared entry by entry, so a spec or options
 * bag rebuilt inline on every render counts as unchanged. Everything else --
 * functions (tooltip handlers, loggers, loaders, field-title formatters),
 * class instances, dates -- compares by reference, because two instances can
 * behave differently even when they look alike, and the View built from them
 * would too.
 */
export function latchIsCurrent(
  latch: ViewInputsLatch,
  inputs: ViewInputs,
): boolean {
  return matchesSnapshot(latch.snapshot, inputs);
}

/**
 * Copy the plain-object structure of `value`, keeping everything else by
 * reference. Not a general-purpose clone: it exists only so a later
 * comparison has the old values to look at.
 *
 * `path` holds the objects currently being walked, so re-entering one is
 * recognized as a cycle and kept by reference rather than followed.
 */
function snapshotValue(
  value: unknown,
  depth: number,
  path: Set<unknown>,
): unknown {
  if (!isWalkable(value)) {
    return value;
  }
  if (depth >= MAX_DEPTH || path.has(value)) {
    return opaque(value);
  }
  path.add(value);
  const copy = Array.isArray(value)
    ? value.map(item => snapshotValue(item, depth + 1, path))
    : Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          key,
          snapshotValue(entry, depth + 1, path),
        ]),
      );
  // Only an ancestor is a cycle; the same object twice in sibling positions
  // is ordinary sharing and is walked both times.
  path.delete(value);
  return copy;
}

/**
 * Compare a value against a snapshot. The walk is guided by the snapshot,
 * which is finite and acyclic by construction, so a cyclic `value` cannot
 * make this recurse forever.
 */
function matchesSnapshot(snapshot: unknown, value: unknown): boolean {
  if (isOpaque(snapshot)) {
    // Could not be walked, so the reference is all there is to compare.
    return Object.is(snapshot[OPAQUE], value);
  }
  if (Array.isArray(snapshot)) {
    return (
      Array.isArray(value) &&
      snapshot.length === value.length &&
      snapshot.every((item, index) => matchesSnapshot(item, value[index]))
    );
  }
  if (isPlainObject(snapshot)) {
    if (!isPlainObject(value)) {
      return false;
    }
    const keys = Object.keys(snapshot);
    return (
      keys.length === Object.keys(value).length &&
      keys.every(
        key =>
          Object.prototype.hasOwnProperty.call(value, key) &&
          matchesSnapshot(snapshot[key], value[key]),
      )
    );
  }
  // Primitives (Object.is also pairs both `undefined`s and both `NaN`s), and
  // every value compared by reference.
  return Object.is(snapshot, value);
}

function isWalkable(value: unknown): value is Record<string, unknown> {
  return Array.isArray(value) || isPlainObject(value);
}

/**
 * A `{...}` object literal or a null-prototype object -- the shapes a spec,
 * config, or options bag is made of. Class instances are excluded on purpose:
 * their behavior lives in methods a structural copy cannot capture.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
