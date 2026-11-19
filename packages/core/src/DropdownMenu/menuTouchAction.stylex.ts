// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menuTouchAction.stylex.ts
 * @input Nothing; styles only
 * @output Exports menuTouchActionStyles: a menu's touch-action, by whether it
 *   scrolls
 * @position Shared by every menu that tracks a held pointer through
 *   useMenuPress (DropdownMenu and the nav, breadcrumb and tab menus)
 *
 * Scroll ownership by the browser's own signal. A menu whose rows fit keeps
 * every one-finger move, so a slide over its rows stays a slide. One that
 * scrolls lets the browser pan it vertically and cancel the press when it
 * does. Both leave a two-finger pinch to the browser, so the page stays
 * zoomable over an open menu; `pinch-zoom` admits no one-finger pan.
 */

import * as stylex from '@stylexjs/stylex';

export const menuTouchActionStyles = stylex.create({
  fits: {
    touchAction: 'pinch-zoom',
  },
  scrolls: {
    touchAction: 'pan-y pinch-zoom',
    overscrollBehavior: 'contain',
  },
});
