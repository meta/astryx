// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menuLinkClicks.ts
 * @input A link item inside an open menu that tracks presses with useMenuPress
 * @output expectNativeLinkClicks: asserts that a Ctrl-, Cmd- or Shift-click
 *   and a middle click on the link reach the page once, not prevented, and
 *   that the menu dispatches no activation of its own for them
 * @position Test helper for the menus that adopt useMenuPress over caller or
 *   link items (NavHeadingMenu, TopNavMenu, SideNavHeading, TopNavHeading,
 *   BreadcrumbItem)
 */

import {fireEvent} from '@testing-library/react';
import {expect} from 'vitest';

interface Seen {
  type: string;
  detail: number;
  defaultPrevented: boolean;
}

export function expectNativeLinkClicks(link: HTMLElement): void {
  const seen: Seen[] = [];
  const record = (event: Event) => {
    seen.push({
      type: event.type,
      detail: (event as MouseEvent).detail,
      defaultPrevented: event.defaultPrevented,
    });
    // The test page never navigates.
    event.preventDefault();
  };
  // Bubble phase on the document: what reaches the page after every
  // component handler ran.
  const view = link.ownerDocument;
  view.addEventListener('click', record);
  view.addEventListener('auxclick', record);
  try {
    let pointerId = 100;
    for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey'] as const) {
      seen.length = 0;
      const init = {pointerType: 'mouse', pointerId: ++pointerId, button: 0};
      fireEvent.pointerDown(link, {...init, [modifier]: true});
      fireEvent.pointerUp(link, {...init, [modifier]: true});
      fireEvent.click(link, {detail: 1, button: 0, [modifier]: true});
      expect(seen, modifier).toEqual([
        {type: 'click', detail: 1, defaultPrevented: false},
      ]);
    }
    seen.length = 0;
    const middle = {pointerType: 'mouse', pointerId: ++pointerId, button: 1};
    fireEvent.pointerDown(link, middle);
    fireEvent.pointerUp(link, middle);
    fireEvent(
      link,
      new MouseEvent('auxclick', {
        bubbles: true,
        cancelable: true,
        detail: 1,
        button: 1,
      }),
    );
    expect(seen, 'middle').toEqual([
      {type: 'auxclick', detail: 1, defaultPrevented: false},
    ]);
  } finally {
    view.removeEventListener('click', record);
    view.removeEventListener('auxclick', record);
  }
}
