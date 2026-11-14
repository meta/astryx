// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Component style-map merging
 *
 * One merge rule for component overrides, shared by every layer that composes
 * them: `extends` inheritance, generated type-scale rules, and the on-media
 * (`onDark`/`onLight`) surfaces. Merging is per style key, so a child that
 * restates one property of `button.base` keeps the rest of the base's; a
 * color-mode block (`@light`, `@dark`) merges per property the same way. A
 * property the overrides leave `undefined`, in a style key or a color-mode
 * block, is not set: the base's value stays. A restated pseudo-class block
 * (`:hover`) replaces the base's block whole; a property left `undefined`
 * inside it is not set, and the stylesheet writes nothing for it.
 *
 * @input two ComponentStyleMaps — the base and the overrides that win
 * @output a merged ComponentStyleMap
 * @position packages/core/src/theme/mergeComponents.ts
 */

import type {ComponentStyleMap} from './defineTheme';

/** The style keys that hold a block for one color mode. */
const COLOR_MODE_KEYS = ['@light', '@dark'] as const;

/** A style block without the properties it leaves undefined. */
function withoutUndefined<T extends object>(block: T): T {
  return Object.fromEntries(
    Object.entries(block).filter(([, value]) => value !== undefined),
  ) as T;
}

/**
 * Deep-merge component style maps: `overrides` wins per style key, and every
 * component and key the base declared that the overrides do not mention is
 * carried through untouched.
 */
export function deepMergeComponents(
  base?: ComponentStyleMap,
  overrides?: ComponentStyleMap,
): ComponentStyleMap | undefined {
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
        // A property left undefined is not set: the inherited value stays,
        // as for a page token.
        const merged = {...result[component][key], ...withoutUndefined(styles)};
        // A color-mode block merges by property too, as the style key does.
        for (const mode of COLOR_MODE_KEYS) {
          const inherited = result[component][key]?.[mode];
          const own = styles[mode];
          if (typeof inherited === 'object' && typeof own === 'object') {
            merged[mode] = {...inherited, ...withoutUndefined(own)};
          }
        }
        result[component][key] = merged;
      }
    }
  }

  return result;
}
