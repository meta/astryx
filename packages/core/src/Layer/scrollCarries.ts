// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollCarries.ts
 * @input A scroll event's target and a node
 * @output Whether that scroll moves the node on screen
 * @position Utility; used by useLayer to read an anchor's move on a scroll
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Layer/useLayer.tsx (imports from here)
 */

/**
 * The node that holds `node`: its parent, or the host of the shadow root it
 * is the top of.
 */
function holderOf(node: Node): Node | null {
  if (node.parentNode != null) {
    return node.parentNode;
  }
  return node.nodeType === node.DOCUMENT_FRAGMENT_NODE
    ? ((node as ShadowRoot).host ?? null)
    : null;
}

/**
 * Whether a scroll on `target` carries `node`. That is true when `target` is
 * the node's document or an element that holds the node. The walk also crosses
 * out of a shadow root that holds the node.
 */
export function scrollCarries(target: EventTarget | null, node: Node): boolean {
  for (
    let current = holderOf(node);
    current != null;
    current = holderOf(current)
  ) {
    if (current === target) {
      return true;
    }
  }
  return false;
}
