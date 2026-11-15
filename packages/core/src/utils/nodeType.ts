// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file nodeType.ts
 * @input A value that may be a DOM node from any window
 * @output isNode, isElement, isHTMLElement, isDocument and isShadowRoot:
 *   type guards that hold for a node from any window
 * @position Shared DOM checks for code that handles nodes and events from
 *   another window's document, such as a same-origin iframe's or a popup's
 *
 * Each check reads the node type or namespace, not `instanceof`. A node from
 * another window belongs to that window's realm, where `instanceof` against
 * this window's classes is false. An element moved into another window's
 * document keeps the realm it was made in.
 */

/** Whether `value` is a DOM node, from this window or another one. */
export function isNode(value: unknown): value is Node {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as {nodeType?: unknown}).nodeType === 'number'
  );
}

/** Whether `value` is an element, from this window or another one. */
export function isElement(value: unknown): value is Element {
  return isNode(value) && value.nodeType === 1;
}

/** Whether `value` is a document, from this window or another one. */
export function isDocument(value: unknown): value is Document {
  return isNode(value) && value.nodeType === 9;
}

/** Whether `value` is a shadow root, from this window or another one. */
export function isShadowRoot(value: unknown): value is ShadowRoot {
  return isNode(value) && value.nodeType === 11 && 'host' in value;
}

/**
 * Whether `value` is an HTML element, from this window or another one. The
 * namespace decides, so an element moved between windows' documents passes.
 */
export function isHTMLElement(value: unknown): value is HTMLElement {
  return (
    isElement(value) && value.namespaceURI === 'http://www.w3.org/1999/xhtml'
  );
}
