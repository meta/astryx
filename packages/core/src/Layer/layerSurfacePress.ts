// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerSurfacePress.ts
 * @input The content element of an open Tooltip or HoverCard surface.
 * @output A registry of those elements, read only by the public
 *   hasInteractiveAncestor, whose documentation promises that a press inside
 *   one answers true.
 * @position Kept until the next minor for that public answer; Core's own
 *   containers rely on layer roots stopping such presses instead. Not
 *   exported from the package.
 */

const surfaces = new WeakSet<Element>();

/**
 * Ref callback for a layer surface's content element. The layer root around
 * it is registered too: a caller's `style`, `xstyle` or `className` (padding,
 * for instance) lands there, so a press on that edge is still the surface's.
 */
export function registerLayerSurface(element: Element | null): void {
  if (element == null) {
    return;
  }
  surfaces.add(element);
  const root = element.parentElement;
  if (root?.hasAttribute('popover')) {
    surfaces.add(root);
  }
}

/** Whether this element is a registered layer surface. */
export function isLayerSurface(element: Element): boolean {
  return surfaces.has(element);
}
