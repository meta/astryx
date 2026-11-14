// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Component style-map merging
 *
 * One merge rule for component overrides, shared by `extends` inheritance,
 * generated type-scale rules, and the `onDark`/`onLight` surfaces. Merging
 * is per style key and per property; a restated pseudo-class block replaces
 * the base's whole.
 *
 * @input two ComponentStyleMaps — the base and the overrides that win
 * @output a merged ComponentStyleMap
 * @position packages/core/src/theme/mergeComponents.ts
 */

import type {ComponentStyleMap} from './defineTheme';

/** The style keys that hold a block for one color mode. */
const COLOR_MODE_KEYS = ['@light', '@dark'] as const;

/**
 * An object's entries, each read through `read`: an entry `read` gives as
 * undefined is dropped, and an object that held entries and keeps none is
 * undefined itself. Anything that is not a plain object is returned as it
 * is (a null is a value). An object with nothing dropped or changed is
 * returned as it is.
 */
function readEntries<T>(
  value: T,
  read: (entry: unknown) => unknown,
): T | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  const entries = Object.entries(value);
  let changed = false;
  const kept: [string, unknown][] = [];
  for (const [key, entry] of entries) {
    const set = entry === undefined ? undefined : read(entry);
    if (set === undefined) {
      changed = true;
      continue;
    }
    changed ||= set !== entry;
    kept.push([key, set]);
  }
  if (entries.length > 0 && kept.length === 0) {
    return undefined;
  }
  return changed ? (Object.fromEntries(kept) as T) : value;
}

/**
 * A block without the properties it leaves undefined, at every depth. A
 * nested block (a pseudo-class or color-mode block) stays even when that
 * empties it: a restated pseudo-class block still replaces the base's.
 */
function withoutUndefined(value: unknown): unknown {
  const set = readEntries(value, withoutUndefined);
  return set === undefined ? {} : set;
}

/**
 * A component style map without what it leaves undefined: a component, a
 * style key, or a property at any depth is not set, and so is a component
 * or style key whose every value is. Every layer that reads a theme's
 * component map (the merge, each resolved layer, the stylesheet) reads it
 * through this.
 */
export function withoutUnsetComponents(
  map: ComponentStyleMap | undefined,
): ComponentStyleMap | undefined {
  return readEntries(map, rules =>
    readEntries(rules, styles => readEntries(styles, withoutUndefined)),
  );
}

/**
 * Deep-merge component style maps: `overrides` wins per style key, and every
 * component and key the base declared that the overrides do not mention is
 * carried through untouched.
 */
export function deepMergeComponents(
  inheritedMap?: ComponentStyleMap,
  ownMap?: ComponentStyleMap,
): ComponentStyleMap | undefined {
  const base = withoutUnsetComponents(inheritedMap);
  const overrides = withoutUnsetComponents(ownMap);
  if (!base && !overrides) {
    return undefined;
  }
  if (!base) {
    return overrides;
  }
  if (!overrides) {
    return base;
  }

  const result: ComponentStyleMap = {};

  // Start with all base entries
  for (const [component, rules] of Object.entries(base)) {
    result[component] = {...rules};
  }

  // Merge overrides on top
  for (const [component, rules] of Object.entries(overrides)) {
    if (!result[component]) {
      result[component] = {...rules};
    } else {
      for (const [key, styles] of Object.entries(rules)) {
        const merged = {...result[component][key], ...styles};
        // A color-mode block merges by property too, as the style key does.
        for (const mode of COLOR_MODE_KEYS) {
          const inherited = result[component][key]?.[mode];
          const own = styles[mode];
          if (typeof inherited === 'object' && typeof own === 'object') {
            merged[mode] = {...inherited, ...own};
          }
        }
        result[component][key] = merged;
      }
    }
  }

  return result;
}
