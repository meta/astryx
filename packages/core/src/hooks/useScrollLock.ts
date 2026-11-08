// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useScrollLock.ts
 * @input React useEffect, rootScrollStyles, gestures/pageHold with the pan
 *   decision, and the scrollbar gutter hold
 * @output useScrollLock, which locks page scroll behind a modal
 * @position Core hook; used by Dialog, BottomSheet, Drawer, Lightbox and
 *   MobileNav
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
 * The page keeps its scroll offset, so nothing jumps on lock or unlock. iOS
 * Safari scrolls an `overflow: hidden` page under a finger. So where the
 * primary pointer is coarse (phones and tablets), the lock cancels a
 * one-finger pan that would reach the page.
 * Pans that a scroller in the overlay takes, and two-finger zoom, go through.
 * The gutter of a classic scrollbar stays open, so the page does not shift
 * sideways.
 *
 * @example
 * ```
 * useScrollLock(isOpen);
 * ```
 */
export function useScrollLock(isLocked: boolean): void {
  // Syncs the document's scroll lock with `isLocked`. A count of holders keeps
  // the page locked until the last one releases.
  useEffect(() => {
    if (!isLocked) {
      return;
    }

    if (lockCount === 0) {
      // The hold measures before the lock writes a style, so the lock forces no
      // layout of its own. `settle` writes the gutter with the styles below.
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
