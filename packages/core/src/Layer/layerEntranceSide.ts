// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerEntranceSide.ts
 * @input A shown layer and what it is anchored to
 * @output Exports `layerEntranceSide`, the side a layer landed on from two
 *   boxes, and `writeLayerEntranceSide`, which gives that side to the
 *   layer's entrance
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
/** The scale's origin, in percent of the layer's box. */
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
  /** Where the layer meets its anchor, in percent of the layer's box. */
  readonly originX: number;
  readonly originY: number;
}

const percentOf = (value: number, start: number, size: number) =>
  Math.round(Math.min(1, Math.max(0, (value - start) / size)) * 1e5) / 1e3;

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
  const apartX =
    (layer.left + layer.width / 2 - anchorX) /
    ((layer.width + anchor.width) / 2);
  const apartY =
    (layer.top + layer.height / 2 - anchorY) /
    ((layer.height + anchor.height) / 2);
  const originX = percentOf(anchorX, layer.left, layer.width);
  const originY = percentOf(anchorY, layer.top, layer.height);
  const coversAnchor =
    originX > 0 && originX < 100 && originY > 0 && originY < 100;
  if (coversAnchor) {
    return {x: 0, y: 0, originX, originY};
  }
  if (Math.abs(apartY) >= Math.abs(apartX)) {
    const below = apartY > 0;
    return {x: 0, y: below ? -1 : 1, originX, originY: below ? 0 : 100};
  }
  const right = apartX > 0;
  return {x: right ? -1 : 1, y: 0, originX: right ? 0 : 100, originY};
}

/**
 * Gives the layer's entrance the side the layer landed on after any flip.
 * The entrance then slides from that side, and scales about the point where
 * the layer meets its anchor. Run it in the task that shows and places the
 * layer. Its reads then lay the layer out once, before its first frame. A
 * layer without an anchor sets the properties to `initial`. Its entrance
 * then keeps its placement's side, and a layer inside it never inherits its
 * values.
 */
export function writeLayerEntranceSide(
  layer: HTMLElement,
  anchor: Element | null,
): void {
  const side =
    anchor == null
      ? null
      : layerEntranceSide(settledBox(layer), anchor.getBoundingClientRect());
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
    side == null ? 'initial' : `${side.originX}% ${side.originY}%`,
  );
}
