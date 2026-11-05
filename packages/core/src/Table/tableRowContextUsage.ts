// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tableRowContextUsage.ts
 * @input Immutable row contexts and the plugins whose transforms read them
 * @output Per-plugin tracked contexts, and which plugins read the row index or
 *   the row count
 * @position Private to BaseTable's row memoization; plugins never import it
 */

import type {TablePlugin, TableRowContext} from './types';

const indexReadingPlugins = new WeakSet<object>();
const countReadingPlugins = new WeakSet<object>();
const trackedContexts = new WeakMap<
  TableRowContext,
  WeakMap<object, TableRowContext>
>();

/** Whether a transform of the plugin has read a row's `logicalIndex`. */
export function readsRowIndex<T extends Record<string, unknown>>(
  plugin: TablePlugin<T>,
): boolean {
  return indexReadingPlugins.has(plugin);
}

/** Whether a transform of the plugin has read a row count. */
export function readsRowCount<T extends Record<string, unknown>>(
  plugin: TablePlugin<T>,
): boolean {
  return countReadingPlugins.has(plugin);
}

/**
 * The context as one plugin sees it. Its getters record which values the
 * plugin reads, so a row re-renders for a moved index or a changed count only
 * when a plugin can show it. The values stay the same as the context's.
 */
export function trackRowContext<T extends Record<string, unknown>>(
  plugin: TablePlugin<T>,
  context: TableRowContext,
): TableRowContext {
  let byPlugin = trackedContexts.get(context);
  if (byPlugin == null) {
    byPlugin = new WeakMap();
    trackedContexts.set(context, byPlugin);
  }
  const cached = byPlugin.get(plugin);
  if (cached != null) {
    return cached;
  }
  const render = Object.freeze({
    ...context.render,
    get logicalRowCount() {
      countReadingPlugins.add(plugin);
      return context.render.logicalRowCount;
    },
  });
  const tracked: TableRowContext = Object.freeze({
    ...context,
    render,
    get logicalIndex() {
      indexReadingPlugins.add(plugin);
      return context.logicalIndex;
    },
    get logicalRowCount() {
      countReadingPlugins.add(plugin);
      return context.logicalRowCount;
    },
  });
  byPlugin.set(plugin, tracked);
  return tracked;
}
