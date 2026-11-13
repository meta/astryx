// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollOffsets.ts
 * @input The DOM
 * @output Exports `readScrollOffsets` and `scrollToOffsets`: the scroll
 *   offsets of an element and of everything scrolled inside it, and putting
 *   them back
 * @position Motion foundation, internal to core. transientCopy.ts keeps a
 *   copy's offsets with it, and AppShell keeps a hidden region's offsets
 *   across the Activity pause, which drops them with `display: none`.
 */

/** Scrolled elements and their offsets: element, top, left. */
export type ScrollOffsets = ReadonlyArray<readonly [Element, number, number]>;

/** The offsets of `root` and of every element inside it that is scrolled. */
export function readScrollOffsets(root: Element): ScrollOffsets {
  const offsets: [Element, number, number][] = [];
  for (const node of [root, ...root.querySelectorAll('*')]) {
    if (node.scrollTop !== 0 || node.scrollLeft !== 0) {
      offsets.push([node, node.scrollTop, node.scrollLeft]);
    }
  }
  return offsets;
}

/**
 * Puts each element at its offset. It scrolls at once, whatever its
 * `scroll-behavior`. A box keeps no scroll position until it is laid out.
 */
export function scrollToOffsets(offsets: ScrollOffsets): void {
  for (const [node, top, left] of offsets) {
    if (typeof node.scrollTo === 'function') {
      node.scrollTo({top, left, behavior: 'instant'});
    } else {
      node.scrollTop = top;
      node.scrollLeft = left;
    }
  }
}
