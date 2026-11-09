// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file LayerTouch.ts
 * @input useLayerKeyboardClearance.ts (the software keyboard's part of the
 *   viewport caps)
 * @output The layer runtime's touch layer: useLayerKeyboardClearance and
 *   keyboardLiftStyle
 * @position The one module the layer runtime imports touch-only code through,
 *   and its only import site is useLayer.tsx. It is imported statically, as
 *   every touch module is.
 *
 * SYNC: When modified, keep every touch-only import of useLayer.tsx here.
 */

export {
  keyboardLiftStyle,
  useLayerKeyboardClearance,
} from './useLayerKeyboardClearance';
