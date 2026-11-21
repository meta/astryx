// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reorder.ts
 * @input A reorderable object made by createReorderable
 * @output `reorderableOptions`: the options a reorderable object was made
 *   with. `adaptReorderable`: an object that runs the owner's engine with
 *   other options. A Lab collection uses it to adapt the owner's moves, such
 *   as a staged selector that aims them at its draft. The owner's `start`
 *   still finds its list. Neither loads the reorder engine: it comes with the
 *   owner's object.
 *   It also gives List's reorder session for rows that are not ListItems,
 *   for Lab's ListInput: `useListReorderScope` and `ListReorderScope`. The
 *   handle each row ends with is the session's `Handle`: it comes with the
 *   owner's object, so this entry loads no reorder code
 * @position `@astryxdesign/core/internal/reorder`: an internal entry reserved
 *   for Core and Lab. It is undocumented, outside the public API and its
 *   compatibility promise, and versioned in lockstep with Core.
 */

import {
  REORDER_ENGINE,
  type ListReorderOptions,
  type ReorderableInternals,
} from '../List/listReorderContext';
import type {
  Reorderable,
  ReorderableOptions,
} from '../reorderable/createReorderable';

/** The options `reorderable` was made with by `createReorderable`. */
export function reorderableOptions<TKey extends string | number, TTo>(
  reorderable: Reorderable<TKey, TTo>,
): ReorderableOptions<TKey, TTo> {
  return (reorderable as unknown as ReorderableInternals)
    .options as unknown as ReorderableOptions<TKey, TTo>;
}

/**
 * An object that reorders with `reorderable`'s engine but `options`' moves
 * and `isReorderable`: a Lab collection's adapter of the owner's object. The
 * owner's `start(key)` still finds the collection's list,
 * and its own `start` is the owner's.
 */
export function adaptReorderable<TKey extends string | number, TTo>(
  reorderable: Reorderable<TKey, TTo>,
  options: ReorderableOptions<TKey, TTo>,
): Reorderable<TKey, TTo> {
  const source = reorderable as unknown as ReorderableInternals;
  const adapted: ReorderableInternals = {
    options: {
      ...(options as unknown as ListReorderOptions),
      startedBy: source.options.startedBy ?? source.options,
    },
    [REORDER_ENGINE]: source[REORDER_ENGINE],
    start: key => source.start(key),
    attach: (container, attachOptions) =>
      source.attach(container, attachOptions),
  };
  return adapted as unknown as Reorderable<TKey, TTo>;
}

export {ListReorderScope, useListReorderScope} from '../List/ListReorderScope';
export type {
  ListReorderContextValue,
  ListReorderHandleProps,
} from '../List/listReorderContext';
