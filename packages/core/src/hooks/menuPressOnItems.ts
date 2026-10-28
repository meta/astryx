// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menuPressOnItems.ts
 * @input useMenuPress's menu `onPointerDown` and the menu's item selector
 * @output Exports pressOnItemsOnly: the same handler, run only for a press
 *   that lands on an item and is not a modified mouse press on a link
 * @position Internal to core's menus with caller content or link items
 *   (NavHeadingMenu, TopNavMenu, SideNavHeading's and TopNavHeading's menus,
 *   BreadcrumbItem's menu)
 *
 * A menu that holds caller content beside its items (a button, a link list)
 * tracks only presses that land on an item. A press on anything else stays
 * the browser's own, so that content's click runs as it always has
 * (`architecture:interaction-modality` INV4). A mouse press with Ctrl, Cmd or
 * Shift on a link item is the browser's too, so it opens the link in a new
 * tab or window as it always has; a middle press never reaches the model.
 */

import type {PointerEvent as ReactPointerEvent} from 'react';

export function pressOnItemsOnly<E extends HTMLElement>(
  onPointerDown: (event: ReactPointerEvent<E>) => void,
  itemSelector: string,
): (event: ReactPointerEvent<E>) => void {
  return event => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest(itemSelector) == null) {
      return;
    }
    const isModifiedLinkPress =
      event.pointerType === 'mouse' &&
      (event.ctrlKey || event.metaKey || event.shiftKey) &&
      target.closest('a[href]') != null;
    if (event.button !== 0 || isModifiedLinkPress) {
      return;
    }
    onPointerDown(event);
  };
}
