// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as stylex from '@stylexjs/stylex';

/**
 * Scoped marker for Switch ancestor selectors.
 * Prevents focus-within and hover styles from leaking from parent containers.
 */
export const switchScope: ReturnType<typeof stylex.defineMarker> =
  stylex.defineMarker();

/**
 * Marks the switch's own focusable input, the track's preceding sibling, so
 * the track's focus ring follows that input's `:focus-visible` alone. Unlike
 * `switchScope`, it stays on while disabled (a focusable-disabled switch
 * still shows the ring).
 */
export const switchFocusInput: ReturnType<typeof stylex.defineMarker> =
  stylex.defineMarker();
