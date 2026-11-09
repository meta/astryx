// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollbarGutter.ts
 * @input The element whose width a scroll lock holds, plus live layout
 *   measurements
 * @output holdScrollbarGutter and the ScrollbarGutterHold it returns
 * @position Internal hook utility; used by useScrollLock and MobileNav so that
 *   locking background scroll does not resize the layout viewport.
 */

// A scroll lock hides the document's scrollbar. A classic, space-taking
// scrollbar then gives its width back, and the page jumps sideways behind the
// overlay. `scrollbar-gutter: stable` keeps the gutter open. It is a layout
// change, so it also holds `position: fixed` chrome, which padding cannot:
// fixed elements resolve against the viewport. Padding is only a fallback for
// engines without `scrollbar-gutter`, and it applies only when a measurement
// shows that the element moved.

import {claimRootScrollStyle} from './rootScrollStyles';

const NOOP: ScrollbarGutterHold = {
  settle() {},
  release() {},
};

export interface ScrollbarGutterHold {
  /**
   * Call once the lock's own styles apply. It holds the gutter open, or,
   * without `scrollbar-gutter`, pads away only the width the element gained.
   */
  settle(): void;
  /** Call on unlock: restores everything this hold changed. */
  release(): void;
}

/** Whether the engine reserves a gutter for `scrollbar-gutter: stable`. */
function supportsScrollbarGutter(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('scrollbar-gutter', 'stable')
  );
}

/**
 * Keeps `element`'s content box the width it is right now, across a scroll
 * lock that is about to hide the document's scrollbar.
 *
 * Call it *before* applying the lock's styles, then {@link
 * ScrollbarGutterHold.settle} immediately after, and {@link
 * ScrollbarGutterHold.release} on unlock:
 *
 * ```
 * const hold = holdScrollbarGutter(document.documentElement);
 * document.documentElement.style.overflow = 'hidden';
 * hold.settle();
 * ```
 *
 * Overlay scrollbars (mobile, default macOS) take no layout space, so there is
 * nothing to hold and nothing is touched.
 */
export function holdScrollbarGutter(element: HTMLElement): ScrollbarGutterHold {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return NOOP;
  }

  const root = document.documentElement;
  const viewportWidth = root.clientWidth;

  // 0 means that there is no layout to measure, as in jsdom. An overlay
  // scrollbar takes no space, so there is nothing to hold. A gutter held open
  // on such a page would add space that was never there.
  if (viewportWidth === 0 || window.innerWidth <= viewportWidth) {
    return NOOP;
  }

  if (supportsScrollbarGutter()) {
    // The gutter holds the width by construction, so the lock forces no second
    // layout. Each hold is a stacked claim, so one release keeps the gutter
    // that another hold still needs.
    let releaseGutter: (() => void) | null = null;
    return {
      settle() {
        releaseGutter ??= claimRootScrollStyle({scrollbarGutter: 'stable'});
      },
      release() {
        releaseGutter?.();
        releaseGutter = null;
      },
    };
  }

  // An engine without `scrollbar-gutter`: measure the element now, again
  // once the lock's styles apply, and pad away what it grew. This is the one
  // path that reads layout after a write.
  const previousPadding = element.style.paddingRight;
  const widthBefore = element.getBoundingClientRect().width;
  let padded = false;
  let settled = false;

  return {
    settle() {
      if (settled) {
        return;
      }
      settled = true;

      // What the lock actually did to this element, rather than what we
      // assumed it would do.
      const grew = element.getBoundingClientRect().width - widthBefore;
      if (grew <= 0) {
        return;
      }

      const existing =
        Number.parseFloat(window.getComputedStyle(element).paddingRight) || 0;
      element.style.paddingRight = `${existing + grew}px`;
      padded = true;
    },

    release() {
      if (padded) {
        element.style.paddingRight = previousPadding;
        padded = false;
      }
    },
  };
}
