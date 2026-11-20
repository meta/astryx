// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tabBar.stylex.ts
 * @input StyleX marker system
 * @output tabBarItemMarker — a scoped marker on each TabBar item button
 * @position Shared StyleX marker consumed by TabBar.tsx
 *
 * The item buttons span the whole capsule between their neighbours, so a press
 * anywhere goes to the nearest item, as on iOS. The focus ring belongs on the
 * 76 × 54 item inside. The ring keys off
 * `stylex.when.ancestor(':focus-visible', tabBarItemMarker)`.
 */

import * as stylex from '@stylexjs/stylex';

export const tabBarItemMarker: ReturnType<typeof stylex.defineMarker> =
  stylex.defineMarker();
