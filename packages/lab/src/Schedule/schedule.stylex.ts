// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as stylex from '@stylexjs/stylex';

/**
 * Marker the time-grid scroll viewport carries so a sibling can react to its
 * keyboard focus in CSS. The viewport's own outline paints underneath its
 * pinned header and gutter, so the focus ring is drawn by an overlay that reads
 * `stylex.when.siblingBefore(':focus-visible', timeGridViewportScope)`.
 */
export const timeGridViewportScope: ReturnType<typeof stylex.defineMarker> =
  stylex.defineMarker();
