// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file tableRowContextUsage.ts
 * @input Immutable row contexts and plugin transform consumers
 * @output Private count/index-read tracking for precise row invalidation
 * @position Table memoisation; no public declaration or arity/name inference
 */
import type {TablePlugin, TableRowContext} from './types';
const countIndependentPlugins = new WeakSet<object>();
const countReadingPlugins = new WeakSet<object>();
const indexReadingPlugins = new WeakSet<object>();
const contexts = new WeakMap<
  TableRowContext,
  WeakMap<object, TableRowContext>
>();
export function registerCountIndependentPlugin<
  T extends Record<string, unknown>,
>(plugin: TablePlugin<T>): TablePlugin<T> {
  countIndependentPlugins.add(plugin);
  return plugin;
}
export function readsRowCount<T extends Record<string, unknown>>(
  plugin: TablePlugin<T>,
): boolean {
  return (
    countReadingPlugins.has(plugin) && !countIndependentPlugins.has(plugin)
  );
}
export function readsRowIndex<T extends Record<string, unknown>>(
  plugin: TablePlugin<T>,
): boolean {
  return indexReadingPlugins.has(plugin);
}
/** Immutable getters record dependency reads without changing snapshot values. */
export function trackRowCount<T extends Record<string, unknown>>(
  plugin: TablePlugin<T>,
  context: TableRowContext,
): TableRowContext {
  if (countIndependentPlugins.has(plugin)) {
    return context;
  }
  let consumers = contexts.get(context);
  if (consumers == null) {
    consumers = new WeakMap();
    contexts.set(context, consumers);
  }
  const cached = consumers.get(plugin);
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
  const tracked = Object.freeze({
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
  consumers.set(plugin, tracked);
  return tracked;
}
