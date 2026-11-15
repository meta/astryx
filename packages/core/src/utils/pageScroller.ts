// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pageScroller.ts
 * @input A scroll container element
 * @output scrollsPage, scrollportTop and scrollEventTarget: the rules for a
 *   container that is the page's own scroller
 * @position Core owner module. Core imports it by relative path; Lab reads
 *   it through `@astryxdesign/core/internal/page-scroller`. It is not part of
 *   the public `utils` entry.
 *
 * SYNC: When modified, update pageScroller.test.ts.
 */

/**
 * Whether the element scrolls the page. The page's scroll moves the root's
 * box with it, and its scroll events fire at the document. The document
 * element counts even when the scrolling element is the body, as in quirks
 * mode, because its box still moves with the page.
 */
export function scrollsPage(el: HTMLElement): boolean {
  const doc = el.ownerDocument;
  return el === doc.scrollingElement || el === doc.documentElement;
}

/**
 * Where the container's visible area starts, in client coordinates. For the
 * page's scroller that is the viewport's top. Its own box sits a full scroll
 * offset above it.
 */
export function scrollportTop(el: HTMLElement): number {
  return scrollsPage(el) ? 0 : el.getBoundingClientRect().top;
}

/** Where the container's scroll events fire: the document for the page's. */
export function scrollEventTarget(el: HTMLElement): HTMLElement | Document {
  return scrollsPage(el) ? el.ownerDocument : el;
}
