// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useBaseTablePlugins.ts
 * @input React, types.ts
 * @output Exports useBaseTablePlugins hook
 * @position Utility hook; used by Table to convert named plugin records to stable arrays
 *
 * ## Plugin Ordering
 *
 * First-party plugins are sorted into a canonical order so that plugin
 * interactions are deterministic regardless of how the consumer writes
 * their `plugins={{ ... }}` record. Unknown/custom plugin names are
 * appended after the known set in their original record order.
 *
 * Canonical order:
 *   1. columnSettings — column filtering (future: transformColumns)
 *   2. sort           — header cell sort controls
 *   3. tree           — indent + expander on the tree column
 *   4. selection      — checkbox column + row selection
 *   5. pagination     — pagination controls around the table
 *
 * Rationale:
 * - columnSettings filters columns before sort/selection see them
 * - sort adds header cell UI before selection adds its header column
 * - tree wraps the first *user* column before selection prepends its
 *   checkbox column, so the expander never lands in the checkbox column
 * - selection adds its column after sort so the checkbox header
 *   doesn't get a sort button
 * - pagination wraps the table in context last (outermost provider)
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Table/index.ts (exports)
 * - /packages/core/src/Table/Table.tsx (primary consumer)
 */

import {useEffect, useRef} from 'react';
import {internByIdentity} from './internByIdentity';
import type {TablePlugin} from './types';
import {devWarn} from '../utils/devWarning';

// ======================================================================// Canonical Plugin Order
// ======================================================================
/**
 * Canonical ordering for first-party plugin names.
 * Plugins are sorted by their position in this array.
 * Unknown names are appended after the known set.
 *
 * This decides LAYOUT — which column lands left of which, who wraps whom. It
 * must never decide whether the table works: a plugin that renders in one
 * order and crashes in the other is broken, and adding it here buys a lucky
 * order rather than a fix.
 */
const PLUGIN_ORDER: ReadonlyArray<string> = [
  'columnSettings',
  'sort',
  'tree',
  'selection',
  'pagination',
];

/** Lookup map for O(1) ordering checks. */
const PLUGIN_ORDER_MAP = new Map(
  PLUGIN_ORDER.map((name, index) => [name, index]),
);

/**
 * Sort plugin entries into canonical order.
 * Known plugins are sorted by PLUGIN_ORDER; unknown plugins preserve
 * their original record insertion order and appear after all known plugins.
 */
function sortPluginEntries<T extends Record<string, unknown>>(
  entries: [string, TablePlugin<T>][],
): [string, TablePlugin<T>][] {
  // Sentinel value for unknown plugins — higher than any known index
  const unknownBase = PLUGIN_ORDER.length;

  return entries.sort(([a], [b]) => {
    const orderA = PLUGIN_ORDER_MAP.get(a) ?? unknownBase;
    const orderB = PLUGIN_ORDER_MAP.get(b) ?? unknownBase;

    // If both are unknown, preserve original order (sort is stable)
    return orderA - orderB;
  });
}

// ======================================================================// Hook
// ======================================================================
// Plugin Validation (dev mode only)
// ======================================================================
/** Known declaration fields on the TablePlugin interface. */
const VALID_DECLARATION_KEYS = new Set(['rowModel', 'renderState']);

/** Known transform method names on the TablePlugin interface. */
const VALID_TRANSFORM_KEYS = new Set([
  'transformColumns',
  'transformTable',
  'transformHeaderRow',
  'transformHeaderCell',
  'transformBodyRow',
  'transformBodyCell',
  'transformScrollWrapper',
  'transformTableContext',
]);

/**
 * Validate a plugin object in development mode.
 * Warns about common mistakes like misspelled transform names,
 * non-function values where functions are expected, or
 * completely empty plugins that add pipeline overhead for nothing.
 */
function validatePlugin<T extends Record<string, unknown>>(
  name: string,
  plugin: TablePlugin<T>,
): void {
  // Validation always runs — warnings are cheap and help catch plugin bugs

  const keys = Object.keys(plugin);

  // Warn about unknown keys (likely misspelled transform names)
  for (const key of keys) {
    if (!VALID_TRANSFORM_KEYS.has(key) && !VALID_DECLARATION_KEYS.has(key)) {
      devWarn(
        'Table',
        `Plugin "${name}" has unknown key "${key}". ` +
          `Valid keys: ${[...VALID_DECLARATION_KEYS, ...VALID_TRANSFORM_KEYS].join(', ')}. ` +
          `This key will be ignored.`,
      );
    }
  }

  // Warn about non-function values on known transform keys
  for (const key of keys) {
    if (VALID_TRANSFORM_KEYS.has(key)) {
      const value = (plugin as Record<string, unknown>)[key];
      if (value != null && typeof value !== 'function') {
        devWarn(
          'Table',
          `Plugin "${name}" has non-function value for "${key}" ` +
            `(got ${typeof value}). Transform will be skipped.`,
        );
      }
    }
  }

  // Warn about empty plugins that add pipeline overhead
  const hasTransforms = keys.some(
    key =>
      VALID_TRANSFORM_KEYS.has(key) &&
      typeof (plugin as Record<string, unknown>)[key] === 'function',
  );
  if (!hasTransforms && plugin.renderState == null) {
    devWarn(
      'Table',
      `Plugin "${name}" has no transform methods. ` +
        `It will be included in the pipeline but won't do anything.`,
    );
  }
}

/**
 * Converts a named plugin record (`Record<string, TablePlugin>`) to a stable
 * memoized array for `BaseTable`. Compares plugin values by identity so
 * that inline `plugins={{ selection: stablePlugin }}` doesn't break row
 * memoization — only produces a new array when a plugin value actually changes.
 *
 * Plugins are sorted into a canonical order (see PLUGIN_ORDER) so that
 * interactions between first-party plugins are deterministic.
 *
 * @param basePlugins - Stable array of built-in plugins (e.g. Astryx style plugin)
 * @param userPlugins - Named plugin record from the consumer
 * @returns Stable array of plugins suitable for BaseTable. Every caller with
 *   the same plugins gets this one array, so treat it as read-only.
 *
 * @example
 * ```
 * const plugins = useBaseTablePlugins([tablePlugin], userPlugins);
 * <BaseTable plugins={plugins} ... />
 * ```
 */
export function useBaseTablePlugins<T extends Record<string, unknown>>(
  basePlugins: TablePlugin<T>[],
  userPlugins: Record<string, TablePlugin<T>> | undefined,
): TablePlugin<T>[] {
  // Every render with the same merged plugins, in the same order, gets one
  // array, so a render React discards cannot leave another. No state or ref
  // is written during render.
  const result = internByIdentity(mergePlugins(basePlugins, userPlugins));

  // The array the dev console last validated.
  const validatedRef = useRef<TablePlugin<T>[] | null>(null);
  // Syncs the dev console's plugin warnings with the committed plugins. Each
  // array is validated once, so a StrictMode replay prints nothing more.
  useEffect(() => {
    if (validatedRef.current === result) {
      return;
    }
    validatedRef.current = result;
    if (userPlugins) {
      for (const [name, plugin] of Object.entries(userPlugins)) {
        validatePlugin(name, plugin);
      }
    }
  }, [result, userPlugins]);
  return result;
}

/**
 * Sorts user plugins into canonical order after the base plugins.
 */
function mergePlugins<T extends Record<string, unknown>>(
  basePlugins: TablePlugin<T>[],
  userPlugins: Record<string, TablePlugin<T>> | undefined,
): TablePlugin<T>[] {
  const sortedUserPlugins = userPlugins
    ? sortPluginEntries(Object.entries(userPlugins)).map(([, plugin]) => plugin)
    : [];

  return [...basePlugins, ...sortedUserPlugins];
}
