// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/menuExit.stylex.ts
 * @input A closing menu's surface element.
 * @output placeMenuExitCopy places the layer runtime's exit copy of a closing
 *   menu, marked as a menu's.
 * @position Owner module of the private menu-exit attribute: the only file
 *   that writes its name. DropdownMenu's touch close plays on the copy it
 *   places. No package entry exports it.
 */

import {placeLayerExitCopy} from '../Layer/layerExitCopy';

const MENU_EXIT = 'data-astryx-menu-exit';

/**
 * Places the layer runtime's exit copy of a closing menu, marked as a menu's.
 * Returns null where there is no top layer to show it in: the close is then
 * immediate.
 */
export function placeMenuExitCopy(element: HTMLElement): HTMLElement | null {
  return placeLayerExitCopy(element, MENU_EXIT);
}
