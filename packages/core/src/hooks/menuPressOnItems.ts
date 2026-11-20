// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menuPressOnItems.ts
 * @input useMenuPress's menu `onPointerDown` and the menu's item selector
 * @output pressOnItemsOnly: the same handler, run only for a press that lands
 *   on an item and is not a modified mouse press on a link
 * @position Internal to core's menus with caller content or link items
 *   (NavHeadingMenu, TopNavMenu, SideNavHeading's and TopNavHeading's menus,
 *   BreadcrumbItem's menu)
 */

// A press on caller content beside the items stays the browser's, so that
// content's click runs as before. A Ctrl, Cmd or Shift mouse press on a link
// item also stays the browser's, so it opens the link in a new tab or window.
// A middle press never reaches the model.

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
