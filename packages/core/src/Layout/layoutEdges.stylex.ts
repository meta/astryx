// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layoutEdges.stylex.ts
 * @input StyleX markers
 * @output Exports layoutHeaderMarker and layoutFooterMarker
 * @position Internal markers LayoutHeader and LayoutFooter carry on their own
 *   element, so Layout's middle row can tell whether a divider-less header
 *   precedes it or a divider-less footer follows it with sibling relations
 *   alone, instead of a `:has()` on the layout followed by `*`, which makes
 *   engines restyle the whole layout on any change inside it
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Layout/Layout.tsx
 * - /packages/core/src/Layout/LayoutHeader.tsx
 * - /packages/core/src/Layout/LayoutFooter.tsx
 * - /packages/core/src/Layout/LayoutContent.tsx
 */

import * as stylex from '@stylexjs/stylex';

export const layoutHeaderMarker: ReturnType<typeof stylex.defineMarker> =
  stylex.defineMarker();
export const layoutFooterMarker: ReturnType<typeof stylex.defineMarker> =
  stylex.defineMarker();
