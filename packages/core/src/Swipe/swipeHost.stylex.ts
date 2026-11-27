// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file swipeHost.stylex.ts
 * @input Uses StyleX
 * @output Exports swipeHostStyles: the style a swipeable row's root takes
 * @position Shared by createSwipe.ts, which hands it to the row with the swipe
 *   actions. Also by Item.tsx's released `swipeActions` path, which applies it
 *   from the row's first render, as before
 *
 * The root translates by the travel the gesture writes on it every frame (see
 * useSwipeAction). `pan-y` lets the browser keep scrolling the list while the
 * row owns horizontal movement. `pinch-zoom` leaves a two-finger pinch that
 * starts on the row to the browser, so the page stays zoomable (WCAG 1.4.4).
 */

import * as stylex from '@stylexjs/stylex';

/** The travel the swipe writes on the row root, physical px (useSwipeAction.ts). */
const SWIPE_TRAVEL = 'var(--_item-swipe-travel, 0px)';

export const swipeHostStyles = stylex.create({
  root: {
    touchAction: 'pan-y pinch-zoom',
    transform: `translate3d(${SWIPE_TRAVEL}, 0, 0)`,
  },
});
