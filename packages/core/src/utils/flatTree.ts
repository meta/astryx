// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file flatTree.ts
 * @input A DOM node
 * @output Exports parentAcrossShadow
 * @position The flat-tree parent the browser scrolls and dispatches
 *   through, shared by the gesture host's native-scroll probe and the
 *   selection lock (which the press feedback controller uses without the
 *   gesture system)
 */

/** The node's parent, crossing out of shadow roots. */
export function parentAcrossShadow(node: Node): Node | null {
  // The flat tree the browser scrolls and dispatches through: a slotted node
  // goes to its slot, a shadow root to its host.
  const slot = (node as Partial<Slottable>).assignedSlot;
  if (slot != null) {
    return slot;
  }
  if (node.parentNode != null) {
    return node.parentNode instanceof ShadowRoot
      ? node.parentNode.host
      : node.parentNode;
  }
  return null;
}
