// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file Pinned column runs that first-party plugins declare.
 * @input Plugins that pin columns, and the resolved columns
 * @output The widest pinned start and end runs, without a new caller prop
 * @position Shared between the sticky columns plugin and column windowing;
 *   Table itself never reads it
 */
import type {TableColumn} from './types';
import {sharedWeakMap} from '../utils/sharedRealm';

/** Column counts in the pinned start and end runs. */
export interface PinnedColumnRuns {
  startCount: number;
  endCount: number;
}
type PinnedRunResolver = (
  columns: ReadonlyArray<TableColumn<Record<string, unknown>>>,
) => PinnedColumnRuns;
// Shared across copies of Core, so a copied sticky-columns plugin and the
// package Table agree on the pinned runs.
const pinnedRunResolvers = sharedWeakMap<object, PinnedRunResolver>(
  'table/pinned-column-runs',
  1,
);

/**
 * Lets a first-party plugin that pins columns tell Table its pinned runs, so
 * column windowing keeps them mounted without reading the plugin's config.
 */
export function registerPinnedColumnRuns(
  plugin: object,
  resolve: PinnedRunResolver,
): void {
  pinnedRunResolvers.set(plugin, resolve);
}

/** The widest pinned start and end runs that the plugins declare. */
export function resolvePinnedColumnRuns<T extends Record<string, unknown>>(
  plugins: ReadonlyArray<object>,
  columns: ReadonlyArray<TableColumn<T>>,
): PinnedColumnRuns {
  let startCount = 0;
  let endCount = 0;
  for (const plugin of plugins) {
    const runs = pinnedRunResolvers.get(plugin)?.(
      columns as ReadonlyArray<TableColumn<Record<string, unknown>>>,
    );
    if (runs != null) {
      startCount = Math.max(startCount, runs.startCount);
      endCount = Math.max(endCount, runs.endCount);
    }
  }
  return {startCount, endCount};
}
