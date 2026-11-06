// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/layerRoot.stylex.ts
 * @input A layer content root
 * @output layerRootProps, which marks an element as a layer root,
 *   closestLayerRoot, which finds the nearest marked root, and isLayerRoot,
 *   which reads the mark on one element
 * @position Owner module of the private layer-root attribute: the only
 *   file that writes its name. Layer's click boundary spreads the mark on
 *   every layer root; SelectableCard reads it for its compatibility path
 *   until the next minor; Layer's corrective portal resolver reads it to stop
 *   at the nearest layer root. No package entry exports it.
 */

const LAYER_ROOT = 'data-astryx-layer-root';

/** Spread on a layer content root. */
export const layerRootProps: Readonly<Record<`data-${string}`, string>> = {
  [LAYER_ROOT]: '',
};

/**
 * The nearest layer root at or above `target`, or null outside every layer.
 * Only marked roots count; an element that merely carries `popover` or is a
 * `<dialog>` does not.
 */
export function closestLayerRoot(target: Element): Element | null {
  return target.closest(`[${LAYER_ROOT}]`);
}

/** Whether `element` itself is a marked layer root. */
export function isLayerRoot(element: Element): boolean {
  return element.hasAttribute(LAYER_ROOT);
}
