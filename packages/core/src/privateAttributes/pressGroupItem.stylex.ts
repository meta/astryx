// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file privateAttributes/pressGroupItem.stylex.ts
 * @input Nothing: the private press-group-item attribute
 * @output pressGroupItemProps, which marks an action a group's tracker
 *   follows with the pointers it follows, and the readers isPressGroupItem
 *   and isTrackedByGroup
 * @position Owner module of the private press-group-item attribute: the only
 *   file that writes its name. AlertDialog's actions and a Button inside a
 *   tracking group carry the mark. The press controller
 *   (utils/pressFeedback.ts) leaves a press of those pointers to the group's
 *   tracker. Only the internal/touch entry exposes the writer, to Lab; no
 *   public entry exports it.
 */

const PRESS_GROUP_ITEM = 'data-astryx-press-group-item';

/**
 * Spread on each action that a group's tracker follows. It names the pointer
 * types the tracker follows, such as `['touch', 'pen']`.
 */
export function pressGroupItemProps(
  pointerTypes: ReadonlyArray<string>,
): Readonly<Record<string, string>> {
  return {[PRESS_GROUP_ITEM]: pointerTypes.join(' ')};
}

/** Whether `element` is an action that a group's tracker follows. */
export function isPressGroupItem(element: Element): boolean {
  return element.hasAttribute(PRESS_GROUP_ITEM);
}

/**
 * Whether a group's tracker paints the press on `element` or an ancestor: a
 * press of `pointerType`, or any press when it is null.
 */
export function isTrackedByGroup(
  element: Element,
  pointerType: string | null = null,
): boolean {
  const marked = element.closest(`[${PRESS_GROUP_ITEM}]`);
  if (marked == null) {
    return false;
  }
  return (
    pointerType == null ||
    (marked.getAttribute(PRESS_GROUP_ITEM) ?? '')
      .split(' ')
      .includes(pointerType)
  );
}
