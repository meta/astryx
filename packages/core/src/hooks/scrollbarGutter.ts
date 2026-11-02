// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollbarGutter.ts
 * @input The element a scroll lock pins, plus live layout measurements
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

const NOOP: ScrollbarGutterHold = {
  settle() {},
  release() {},
};

export interface ScrollbarGutterHold {
  /**
   * Call once the lock's own styles are applied: measures whether the element
   * grew anyway and, only then, pads the difference away.
   */
  settle(): void;
  /** Call on unlock: restores everything this hold changed. */
  release(): void;
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
 * const hold = holdScrollbarGutter(document.body);
 * body.style.position = 'fixed';
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

  // 0 means "no layout to measure" (jsdom, and any non-visual environment),
  // not "the scrollbar is as wide as the window".
  if (viewportWidth === 0) {
    return NOOP;
  }

  const previousGutter = root.style.scrollbarGutter;
  const previousPadding = element.style.paddingRight;
  const widthBefore = element.getBoundingClientRect().width;

  let heldGutter = false;
  let padded = false;
  let settled = false;

  // Only when a space-taking scrollbar is actually there. Holding the gutter
  // open on a page that never had one would carve out 15px that was never
  // reserved — the same shift, in the other direction.
  if (window.innerWidth > viewportWidth) {
    root.style.scrollbarGutter = 'stable';
    heldGutter = true;
  }

  return {
    settle() {
      if (settled) {
        return;
      }
      settled = true;

      // What the lock actually did to this element, rather than what we
      // assumed it would do. 0 on any engine where the gutter held — and on a
      // page that already sets `scrollbar-gutter: stable` itself, where the
      // scrollbar was never taking the space back.
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
      if (heldGutter) {
        root.style.scrollbarGutter = previousGutter;
        heldGutter = false;
      }
    },
  };
}
