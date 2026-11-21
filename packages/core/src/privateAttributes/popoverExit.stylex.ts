// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/popoverExit.stylex.ts
 * @input A closing popover's layer element
 * @output placePopoverExitCopy, which places the layer runtime's exit copy of
 *   a closing popover, marked as a popover's, and findPopoverExitCopy, which
 *   finds that copy
 * @position Owner module of the private popover-exit attribute: the only
 *   file that writes its name. Popover's touch close plays on the copy it
 *   places. No package entry exports it.
 */

import {placeLayerExitCopy} from '../Layer/layerExitCopy';

const POPOVER_EXIT = 'data-astryx-popover-exit';

/**
 * Places the layer runtime's exit copy of a closing popover, marked as a
 * popover's. Returns null where there is no top layer to show it in: the
 * close is then immediate.
 */
export function placePopoverExitCopy(element: HTMLElement): HTMLElement | null {
  return placeLayerExitCopy(element, POPOVER_EXIT);
}

/** The exit copy of a closing popover under `root`, if one is on screen. */
export function findPopoverExitCopy(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[${POPOVER_EXIT}]`);
}
