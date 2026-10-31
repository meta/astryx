// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollbarGutter.ts
 * @input The element whose width a scroll lock holds, plus live layout
 *   measurements
 * @output Exports holdScrollbarGutter and the ScrollbarGutterHold it returns
 * @position Internal hook utility; used by useScrollLock and MobileNav so that
 *   locking background scroll does not resize the layout viewport.
 *
 * Locking scroll hides the document's scrollbar. Where that scrollbar is a
 * classic (space-taking) one — Windows/Linux desktop, and macOS set to
 * "Always" show scroll bars — hiding it widens the layout viewport by the
 * scrollbar's width and the whole page jumps sideways behind the overlay.
 *
 * The fix is `scrollbar-gutter: stable`, which holds the gutter open once the
 * scrollbar goes away. Being a real layout change it holds `position: fixed`
 * chrome (sticky headers, toast viewports) as well as in-flow content, which
 * padding fundamentally cannot: fixed elements resolve against the viewport,
 * not against the padded element.
 *
 * Padding is kept only as a fallback for engines without `scrollbar-gutter`
 * (Safari shipped it in 18.2), and it is applied by measuring whether the
 * element actually moved rather than by assuming it did.
 *
 * Every measurement is read before the lock writes a style, so taking the
 * hold costs at most the layout the overlay's own commit left pending, never
 * a second one. The gutter itself is written with the lock's styles (at
 * `settle`), and only the padding fallback reads layout after them.
 */

const NOOP: ScrollbarGutterHold = {
  settle() {},
  release() {},
};

export interface ScrollbarGutterHold {
  /**
   * Call once the lock's own styles are applied: holds the gutter open with
   * them, or, on an engine without `scrollbar-gutter`, measures whether the
   * element grew anyway and only then pads the difference away.
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
 * Call it *before* applying the lock's styles (it only reads), then {@link
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

  // 0 means "no layout to measure" (jsdom, and any non-visual environment),
  // not "the scrollbar is as wide as the window". And without a space-taking
  // scrollbar (an overlay one) there is nothing to hold: holding the gutter
  // open on a page that never had one would carve out 15px that was never
  // reserved, the same shift in the other direction.
  if (viewportWidth === 0 || window.innerWidth <= viewportWidth) {
    return NOOP;
  }

  if (supportsScrollbarGutter()) {
    const previousGutter = root.style.scrollbarGutter;
    // The gutter holds the width by construction: nothing to measure once
    // the lock's styles apply, so taking the lock forces no second layout.
    let heldGutter = false;
    return {
      settle() {
        if (!heldGutter) {
          root.style.scrollbarGutter = 'stable';
          heldGutter = true;
        }
      },
      release() {
        if (heldGutter) {
          root.style.scrollbarGutter = previousGutter;
          heldGutter = false;
        }
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
