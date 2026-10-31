// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useScrollLock.ts
 * @input Uses React useEffect, the root scroll-style owner, the page hold
 *   (gestures/pageHold) with the scroll lock's pan decision, and the
 *   scrollbar gutter hold
 * @output Exports useScrollLock hook for locking page scroll behind a modal
 * @position Core hook; used by Dialog, BottomSheet, Drawer and Lightbox to
 *   prevent background scrolling
 *
 * Holds the page where it is. `overflow: hidden`, claimed through
 * rootScrollStyles on the element the viewport takes its overflow from (the
 * root, or `<body>` when its own overflow propagates), stops wheel, keyboard
 * and scrollbar scrolling, and `overscroll-behavior-y: none` (on the root and
 * `<body>`) keeps the browser's pull-to-refresh from reloading the page behind
 * the overlay. Under a finger, the lock also cancels the one-finger pans that
 * would still scroll the page (`holdPageScroll`, deciding with
 * `isPanAbsorbedBeforePage` along the browser's scroll chain, and leaving a
 * touch a gesture recognizer owns to it), because iOS Safari before 26.4
 * scrolls an `overflow: hidden` page under a finger. On a pinch-zoomed page a
 * one-finger drag pans the zoomed view instead, so it goes through. The page's scroll offset never changes, so there is nothing
 * to restore on unlock, and iOS Safari's toolbar keeps the state it had.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts
 * - /packages/core/src/hooks/scrollbarGutter.ts
 * - /packages/core/src/hooks/rootScrollStyles.ts
 * - /packages/core/src/gestures/pageHold.ts (holdPageScroll)
 * - /packages/core/src/hooks/useScrollLockImports.test.ts
 */

import {useEffect} from 'react';
import {claimRootScrollStyle, reportScrollLock} from './rootScrollStyles';
import {holdPageScroll} from '../gestures/pageHold';
import {isPageZoomedIn, isPanAbsorbedBeforePage} from './scrollLockTouchGuard';
import {holdScrollbarGutter, type ScrollbarGutterHold} from './scrollbarGutter';

interface ActiveLock {
  releaseRootStyle: () => void;
  releasePageHold: () => void;
  gutter: ScrollbarGutterHold;
}

let lockCount = 0;
let activeLock: ActiveLock | null = null;

/**
 * Locks page scroll while `isLocked` is true.
 *
 * The page stays where it is: it gets `overflow: hidden`, and on touch
 * screens a one-finger pan that would reach the page is cancelled, while pans
 * that a scroller inside the overlay can take, and two-finger zoom, go through.
 * The scroll offset never changes, so nothing jumps on lock or unlock.
 *
 * Hiding the root's scrollbar would widen the layout where that scrollbar
 * takes space (desktop), so its gutter is held open for the duration of the
 * lock and the page does not shift sideways.
 *
 * @example
 * ```
 * useScrollLock(isOpen);
 * ```
 */
export function useScrollLock(isLocked: boolean): void {
  useEffect(() => {
    if (!isLocked) {
      return;
    }

    if (lockCount === 0) {
      // Measured before the lock writes a style, so opening an overlay forces
      // no layout of its own; the gutter is written with the styles below
      // (settle), and nothing reads layout after them.
      const gutter = holdScrollbarGutter(document.documentElement);
      // `overscroll-behavior-y: none` also keeps the browser's own
      // pull-to-refresh (Chrome on Android) from reloading the page behind
      // the overlay.
      const releaseRootStyle = claimRootScrollStyle({
        overflow: 'hidden',
        overscrollBehaviorY: 'none',
      });
      // The hold asks the gesture host only if one exists, so the lock does
      // not bring the host into every overlay's import.
      const releasePageHold = holdPageScroll(
        document,
        // A drag on a pinch-zoomed page pans the zoomed view: it goes
        // through, so a zoomed-in reader can move around the overlay.
        (origin, dx, dy) =>
          !isPageZoomedIn(document) && !isPanAbsorbedBeforePage(origin, dx, dy),
      );
      gutter.settle();
      activeLock = {releaseRootStyle, releasePageHold, gutter};
    }

    lockCount += 1;
    reportScrollLock(1);

    return () => {
      lockCount -= 1;
      reportScrollLock(-1);

      if (lockCount !== 0 || activeLock == null) {
        return;
      }

      const lock = activeLock;
      activeLock = null;
      lock.releasePageHold();
      lock.releaseRootStyle();
      lock.gutter.release();
    };
  }, [isLocked]);
}
