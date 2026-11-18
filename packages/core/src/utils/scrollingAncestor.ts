// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollingAncestor.ts
 * @input An element, and an optional ancestor where the walk stops.
 * @output The element's nearest ancestor that scrolls on the block axis, and
 *   `nearestScroller`, which falls back to the document's scroller.
 * @position Shared by the keyboard module's reveals, Outline's scroll spy
 *   and the List reorder's edge autoscroll.
 */

import {SCROLLABLE_OVERFLOW} from './scrollView';

/**
 * The nearest ancestor of `element` that scrolls on the block axis: its
 * `overflow-y` lets it scroll and its content is taller than its box. The walk
 * ends after `bound` when one is given, and at the document's root otherwise.
 * Null when no ancestor in that range scrolls.
 */
export function scrollingAncestor(
  element: Element,
  bound?: Element | null,
): HTMLElement | null {
  const view = element.ownerDocument.defaultView;
  if (view == null) {
    return null;
  }
  for (
    let node = element.parentElement;
    node != null;
    node = node.parentElement
  ) {
    if (
      SCROLLABLE_OVERFLOW.has(view.getComputedStyle(node).overflowY) &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    if (node === bound) {
      return null;
    }
  }
  return null;
}

/**
 * The element that scrolls `element` into view: its nearest ancestor that
 * scrolls on the block axis, or else the document's scroller.
 */
export function nearestScroller(element: Element): Element {
  const doc = element.ownerDocument;
  const scroller = scrollingAncestor(element);
  return scroller == null ||
    scroller === doc.body ||
    scroller === doc.documentElement
    ? (doc.scrollingElement ?? doc.documentElement)
    : scroller;
}
