// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/pressOwner.stylex.ts
 * @input StyleX
 * @output The marker of a control whose press paints on a child layer
 * @position A press recipe module: the owner carries this marker and
 *   `interactionOverlayStyles.pressedAlpha`; its layer carries
 *   `ownerLayerPressStyles.layer` (press.stylex.ts). No package entry
 *   exports it.
 */

import * as stylex from '@stylexjs/stylex';

/**
 * Put it on an enabled control only: a disabled control without it paints
 * no hover and no press on its layer.
 */
export const controlPressOwner = stylex.defineMarker();
