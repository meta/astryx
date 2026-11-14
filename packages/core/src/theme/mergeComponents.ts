// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Component style-map merging
 *
 * One merge rule for component overrides, shared by every layer that composes
 * them: `extends` inheritance, generated type-scale rules, and the on-media
 * (`onDark`/`onLight`) surfaces. Merging is per style key, so a child that
 * restates one property of `button.base` keeps the rest of the base's; a
 * color-mode block (`@light`, `@dark`) merges per property the same way. A
 * component, style key, or property left `undefined` is not set: in a style
 * key or a color-mode block, the base's value for that property stays. A
 * restated pseudo-class block (`:hover`) replaces the base's block whole; a
 * property left `undefined` inside it is not set either.
 *
 * @input two ComponentStyleMaps — the base and the overrides that win
 * @output a merged ComponentStyleMap
 * @position packages/core/src/theme/mergeComponents.ts
 */

import type {ComponentStyleMap} from './defineTheme';

/** The style keys that hold a block for one color mode. */
const COLOR_MODE_KEYS = ['@light', '@dark'] as const;

/**
 * A value without what it leaves undefined: each property of a plain
 * object, at every depth (a style key's nested pseudo-class and color-mode
 * blocks). A null is kept: it is a value. A value with nothing undefined is
 * returned as it is.
 */
function withoutUndefined<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  let changed = false;
  const entries: [string, unknown][] = [];
  for (const [key, nested] of Object.entries(value)) {
    if (nested === undefined) {
      changed = true;
      continue;
    }
    const kept = withoutUndefined(nested);
    changed ||= kept !== nested;
    entries.push([key, kept]);
  }
  return changed ? (Object.fromEntries(entries) as T) : value;
}

/**
 * A component style map without what it leaves undefined: a component, a
 * style key, or a property at any depth is not set. Every layer that reads
 * a theme's component map (the merge, each resolved layer) reads it through
 * this.
 */
export function withoutUnsetComponents(
  map: ComponentStyleMap | undefined,
): ComponentStyleMap | undefined {
  return map === undefined ? undefined : withoutUndefined(map);
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
