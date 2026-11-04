// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file privateAttributes/pressGroupItem.stylex.ts
 * @input Nothing: the private press-group-item attribute
 * @output pressGroupItemProps, which marks an action a group's tracker
 *   follows with the pointers it follows, and isTrackedByGroup, which reads
 *   the mark
 * @position Owner module of the private press-group-item attribute: the only
 *   file that writes its name. AlertDialog marks its actions, and the press
 *   controller (utils/pressFeedback.ts) leaves a press of those pointers to
 *   the group's tracker. No package entry exports it.
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
