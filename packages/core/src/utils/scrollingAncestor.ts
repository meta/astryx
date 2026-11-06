// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollingAncestor.ts
 * @input An element, and an optional ancestor where the walk stops.
 * @output The element's nearest ancestor that scrolls on the block axis.
 * @position Shared by the keyboard module's reveals and Outline's scroll spy.
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
