// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file flatTree.ts
 * @input A DOM node
 * @output Exports parentAcrossShadow, containsAlongFlatTree, which walks it,
 *   deepActiveElement, shadowHostOf, a shadow root's host, and
 *   outermostShadowHostOf
 * @position The flat-tree parent the browser scrolls and dispatches
 *   through, shared by the gesture host's native-scroll probe, the
 *   selection lock (which the press feedback controller uses without the
 *   gesture system) and the Layer module's input hold
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

/**
 * Whether `node` is `ancestor` or below it along the flat tree: across an open
 * shadow root to its host, which `Node.contains` does not follow.
 */
export function containsAlongFlatTree(ancestor: Node, node: Node): boolean {
  for (let at: Node | null = node; at != null; at = parentAcrossShadow(at)) {
    if (at === ancestor) {
      return true;
    }
  }
  return false;
}

/** The focused element of `doc`, inside open shadow roots too. */
export function deepActiveElement(
  doc: Document | null | undefined,
): Element | null {
  let active = doc?.activeElement ?? null;
  while (active?.shadowRoot?.activeElement != null) {
    active = active.shadowRoot.activeElement;
  }
  return active;
}

/**
 * The host of a shadow root, open or closed and from any window, and null for
 * any other node.
 */
export function shadowHostOf(node: Node): Element | null {
  return node.nodeType === node.DOCUMENT_FRAGMENT_NODE && 'host' in node
    ? (node as ShadowRoot).host
    : null;
}

/**
 * The outermost shadow host above a shadow root, and null for any other node.
 * A press inside nested closed roots reaches the document as a press on it.
 */
export function outermostShadowHostOf(node: Node): Element | null {
  let host = shadowHostOf(node);
  for (let next = host; next != null; next = shadowHostOf(next.getRootNode())) {
    host = next;
  }
  return host;
}
