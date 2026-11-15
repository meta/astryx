// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tableRowContextUsage.ts
 * @input Immutable row contexts and the plugins whose transforms read them
 * @output Per-plugin tracked contexts, and which plugins read the row index or
 *   the row count
 * @position Private to BaseTable's row memoization; plugins never import it
 */

import type {TablePlugin, TableRowContext} from './types';
import {warnOnce} from '../utils/devWarning';

const countIndependentPlugins = new WeakSet<object>();
const indexReadingPlugins = new WeakSet<object>();
const countReadingPlugins = new WeakSet<object>();
const trackedContexts = new WeakMap<
  TableRowContext,
  WeakMap<object, TableRowContext>
>();
let transformingPlugin: object | null = null;

/** Run one plugin transform; context reads inside it are in time. */
export function runPluginTransform<R>(plugin: object, transform: () => R): R {
  const outer = transformingPlugin;
  transformingPlugin = plugin;
  try {
    return transform();
  } finally {
    transformingPlugin = outer;
  }
}

/**
 * Tracking sees only reads made during the transform. A row that does not
 * re-render keeps its old context, so a later read can return a stale index
 * or count.
 */
function warnIfLate(plugin: object, field: string): void {
  if (transformingPlugin !== plugin) {
    warnOnce(
      `table-row-context-late-read-${field}`,
      'Table',
      `A plugin read TableRowContext.${field} after its transform returned. ` +
        'Read context values during the transform and copy them into any callback it returns.',
    );
  }
}

/**
 * Skips row-context tracking for a core plugin that never reads the row index
 * or count. A later read is not tracked, so its rows can go stale.
 */
export function registerCountIndependentPlugin<
  T extends Record<string, unknown>,
>(plugin: TablePlugin<T>): TablePlugin<T> {
  countIndependentPlugins.add(plugin);
  return plugin;
}

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
  return (
    countReadingPlugins.has(plugin) && !countIndependentPlugins.has(plugin)
  );
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
  if (countIndependentPlugins.has(plugin)) {
    return context;
  }
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
      warnIfLate(plugin, 'render.logicalRowCount');
      countReadingPlugins.add(plugin);
      return context.render.logicalRowCount;
    },
  });
  const tracked: TableRowContext = Object.freeze({
    ...context,
    render,
    get logicalIndex() {
      warnIfLate(plugin, 'logicalIndex');
      indexReadingPlugins.add(plugin);
      return context.logicalIndex;
    },
    get logicalRowCount() {
      warnIfLate(plugin, 'logicalRowCount');
      countReadingPlugins.add(plugin);
      return context.logicalRowCount;
    },
  });
  byPlugin.set(plugin, tracked);
  return tracked;
}
