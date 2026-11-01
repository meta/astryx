// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerSurfacePress.ts
 * @input The content element of an open Tooltip or HoverCard surface.
 * @output A registry of those elements, so the shared "does this press belong
 *   to something else" walk (hasInteractiveAncestor) treats a press inside one
 *   as not the container's.
 * @position component:Tooltip FR11 and component:HoverCard FR11. The surfaces
 *   register their content element; every clickable container that asks
 *   hasInteractiveAncestor (useClickableContainer, TreeListItem, Table row
 *   plugins), or walks with isLayerSurface (Item, Token), leaves the press
 *   alone. The event
 *   keeps propagating, so document and window listeners still see it. Not
 *   exported from the package.
 */

const surfaces = new WeakSet<Element>();

/** Ref callback for a layer surface's content element. */
export function registerLayerSurface(element: Element | null): void {
  if (element != null) {
    surfaces.add(element);
  }
}

/** Whether this element is a registered layer surface. */
export function isLayerSurface(element: Element): boolean {
  return surfaces.has(element);
}
