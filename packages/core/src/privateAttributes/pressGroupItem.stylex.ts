// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file privateAttributes/pressGroupItem.stylex.ts
 * @input Nothing: the private press-group-item attribute
 * @output pressGroupItemProps, which marks an action a group's tracker
 *   follows, and isTrackedByGroup, which reads the mark
 * @position Owner module of the private press-group-item attribute: the only
 *   file that writes its name. AlertDialog marks its actions, and the press
 *   controller (utils/pressFeedback.ts) leaves their press to the group's
 *   tracker. No package entry exports it.
 */

const PRESS_GROUP_ITEM = 'data-astryx-press-group-item';

/** Spread on each action that a group's tracker follows. */
export const pressGroupItemProps: Readonly<Record<string, string>> = {
  [PRESS_GROUP_ITEM]: '',
};

/** Whether a group's tracker paints the press on `element` or an ancestor. */
export function isTrackedByGroup(element: Element): boolean {
  return element.closest(`[${PRESS_GROUP_ITEM}]`) != null;
}
