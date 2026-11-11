// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerEntranceSide.ts
 * @input A shown layer and what it is anchored to
 * @output Exports `layerEntranceSide`, the side a layer landed on from two
 *   boxes. `readLayerEntranceSide` reads both boxes in one pass, and
 *   `writeLayerEntranceSide` gives that side to the layer's entrance.
 * @position Layer runtime: runs in the task that shows a layer, before its
 *   first frame. The entrance in layerAnimations.stylex.ts reads the custom
 *   properties it writes.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Layer/layerAnimations.stylex.ts
 */

import {settledBox} from './settledBox';

/** A horizontal step toward the anchor: -1 left, 0, or 1 right. */
export const LAYER_ENTER_X_PROPERTY = '--_astryx-layer-enter-x';
/** A vertical step toward the anchor: -1 up, 0, or 1 down. */
export const LAYER_ENTER_Y_PROPERTY = '--_astryx-layer-enter-y';
/** The scale's origin, in px from the layer's top-left corner. */
export const LAYER_ENTER_ORIGIN_PROPERTY = '--_astryx-layer-enter-origin';

interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface LayerEntranceSide {
  /** Where the entrance starts: a step toward the anchor on each axis. */
  readonly x: -1 | 0 | 1;
  readonly y: -1 | 0 | 1;
  /** Where the layer meets its anchor, in px from the layer's top-left. */
  readonly originX: number;
  readonly originY: number;
}

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));

/**
 * The side that `layer` sits on against `anchor`, with the step toward the
 * anchor. The origin is where the two meet: on the layer's edge that faces
 * the anchor, on the anchor's center line. It stays on that edge. The side
 * is the axis on which the two centers are furthest apart, in half their
 * joint size. A layer that overlaps its anchor by a few pixels (a submenu
 * against its row) thus still has a side. A layer over its anchor's center
 * (a list over its selected item) has no side. It does not move, and it
 * scales about that center. `null` for a box without size.
 */
export function layerEntranceSide(
  layer: Box,
  anchor: Box,
): LayerEntranceSide | null {
  if (layer.width <= 0 || layer.height <= 0) {
    return null;
  }
  const anchorX = anchor.left + anchor.width / 2;
  const anchorY = anchor.top + anchor.height / 2;
  const originX = clamp(anchorX - layer.left, layer.width);
  const originY = clamp(anchorY - layer.top, layer.height);
  const coversAnchor =
    originX > 0 &&
    originX < layer.width &&
    originY > 0 &&
    originY < layer.height;
  if (coversAnchor) {
    return {x: 0, y: 0, originX, originY};
  }
  const apartX =
    (layer.left + layer.width / 2 - anchorX) /
    ((layer.width + anchor.width) / 2);
  const apartY =
    (layer.top + layer.height / 2 - anchorY) /
    ((layer.height + anchor.height) / 2);
  if (Math.abs(apartY) >= Math.abs(apartX)) {
    const below = apartY > 0;
    return {
      x: 0,
      y: below ? -1 : 1,
      originX,
      originY: below ? 0 : layer.height,
    };
  }
  const right = apartX > 0;
  return {
    x: right ? -1 : 1,
    y: 0,
    originX: right ? 0 : layer.width,
    originY,
  };
}

/**
 * Reads the side that `layer` landed on, in one measurement pass. The
 * anchor's box is read first. `settledBox` can write the layer's transforms
 * and restore them, and no read may follow such a write.
 */
export function readLayerEntranceSide(
  layer: HTMLElement,
  anchor: Element,
): LayerEntranceSide | null {
  const anchorBox = anchor.getBoundingClientRect();
  return layerEntranceSide(settledBox(layer), anchorBox);
}

const px = (value: number) => `${Math.round(value * 1000) / 1000}px`;

/**
 * Gives the layer's entrance the side the layer landed on after any flip.
 * The entrance then slides from that side, and scales about the point where
 * the layer meets its anchor. It only writes, so it can follow a pass that
 * read the boxes. `null` sets the properties to `initial`. The entrance then
 * keeps its placement's side, and a layer inside never inherits the values.
 */
export function writeLayerEntranceSide(
  layer: HTMLElement,
  side: LayerEntranceSide | null,
): void {
  layer.style.setProperty(
    LAYER_ENTER_X_PROPERTY,
    side == null ? 'initial' : String(side.x),
  );
  layer.style.setProperty(
    LAYER_ENTER_Y_PROPERTY,
    side == null ? 'initial' : String(side.y),
  );
  layer.style.setProperty(
    LAYER_ENTER_ORIGIN_PROPERTY,
    side == null ? 'initial' : `${px(side.originX)} ${px(side.originY)}`,
  );
}
