// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file foldable.stylex.ts
 * @input Uses StyleX
 * @output Exports `foldableMarker`, the marker of content that can give up
 *   width without losing anything
 * @position Internal to Core: OverflowList and TabList carry it, and
 *   Toolbar's start and end lanes read it
 *
 * SYNC: When modified, update:
 * - /packages/core/src/OverflowList/OverflowList.tsx
 * - /packages/core/src/TabList/TabList.tsx
 * - /packages/core/src/Toolbar/Toolbar.tsx
 */

import * as stylex from '@stylexjs/stylex';

/**
 * Marks content that folds when it has less room: an OverflowList (its items
 * move into the "+N" menu) or a TabList that handles overflow (its tabs
 * scroll). A Toolbar start or end lane that holds such content shrinks first.
 *
 * @internal Not public API: not exported from the package, not a prop, not a
 * theme target; its class name must not be relied on.
 */
export const foldableMarker: ReturnType<typeof stylex.defineMarker> =
  stylex.defineMarker();
