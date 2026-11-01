// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerSurfacePress.ts
 * @input A click or mouseup that starts inside an open Tooltip or HoverCard
 *   surface.
 * @output A mark on that native event, which a clickable container reads to
 *   leave the press alone.
 * @position component:Tooltip FR11 and component:HoverCard FR11. The surfaces
 *   mark; useClickableContainer reads. The event still propagates, so document
 *   and window listeners (a Typeahead's outside-press handling, analytics)
 *   see it as before. Not exported from the package.
 */

import type {SyntheticEvent} from 'react';

const surfacePresses = new WeakSet<Event>();

/** Marks a press that started inside an open layer surface. */
export function markLayerSurfacePress(event: SyntheticEvent): void {
  surfacePresses.add(event.nativeEvent);
}

/** Whether a press started inside an open layer surface. */
export function isLayerSurfacePress(event: SyntheticEvent): boolean {
  return surfacePresses.has(event.nativeEvent);
}
