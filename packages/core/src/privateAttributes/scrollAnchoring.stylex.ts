// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/scrollAnchoring.stylex.ts
 * @input A scroll container whose position a component owns
 * @output setScrollAnchoringOff, which turns the browser's scroll anchoring
 *   off on an element and back on
 * @position Owner module of the private scroll-anchoring attribute: the only
 *   file that writes its name or its rule. Core's useChatStreamScroll calls
 *   it while it follows the end; Lab reaches the writer through
 *   `@astryxdesign/core/internal/scroll-anchoring`. No public entry exports
 *   it.
 */

const SCROLL_ANCHORING = 'data-astryx-scroll-anchoring';
/** On a scroll container: the browser's anchoring is off there. */
const OFF = 'off';
/** On the one `<style>` element that holds the rule. */
const RULE = 'rule';

/**
 * Add the one rule the attribute switches on, once per document. A rule on
 * an attribute, not the element's inline style, so the caller's own
 * `overflow-anchor` is never read, written or restored, and applies again
 * once the attribute is gone. `!important` so an inline `auto` cannot turn
 * anchoring back on under a component that positions the content itself.
 */
function ensureRule(doc: Document): void {
  if (doc.head.querySelector(`[${SCROLL_ANCHORING}="${RULE}"]`) != null) {
    return;
  }
  const style = doc.createElement('style');
  style.setAttribute(SCROLL_ANCHORING, RULE);
  style.textContent = `[${SCROLL_ANCHORING}="${OFF}"]{overflow-anchor:none !important}`;
  doc.head.appendChild(style);
}

/**
 * Turn the browser's scroll anchoring off on `element` (`on`), or hand it
 * back (`!on`). A component calls this while it alone moves the container's
 * position, so native anchoring does not move it a second time.
 */
export function setScrollAnchoringOff(element: Element, on: boolean): void {
  if (on) {
    ensureRule(element.ownerDocument);
    element.setAttribute(SCROLL_ANCHORING, OFF);
  } else {
    element.removeAttribute(SCROLL_ANCHORING);
  }
}
