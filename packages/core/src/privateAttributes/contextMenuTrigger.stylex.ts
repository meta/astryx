// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/contextMenuTrigger.stylex.ts
 * @input A ContextMenu trigger whose touch press feedback is attached
 * @output markContextMenuTrigger, which marks the trigger, and
 *   closestContextMenuTrigger, which finds the trigger at or above an element
 * @position Owner module of the private context-menu-trigger attribute: the
 *   only file that writes its name. ContextMenu's press feedback
 *   (ContextMenu/contextMenuPressFeedback.ts) marks its trigger and finds the
 *   trigger a press belongs to. No package entry exports it.
 */

const CONTEXT_MENU_TRIGGER = 'data-astryx-context-menu-trigger';

/** Marks `trigger` as a ContextMenu trigger. The returned call unmarks it. */
export function markContextMenuTrigger(trigger: Element): () => void {
  trigger.setAttribute(CONTEXT_MENU_TRIGGER, '');
  return () => {
    trigger.removeAttribute(CONTEXT_MENU_TRIGGER);
  };
}

/** The ContextMenu trigger at or above `element`, or null outside one. */
export function closestContextMenuTrigger(element: Element): Element | null {
  return element.closest(`[${CONTEXT_MENU_TRIGGER}]`);
}
