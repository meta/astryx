// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useGroupPressTracking.ts
 * @input A group's root ref and whether the group tracks presses: under the
 *   touch presentation only
 * @output useGroupPressTracking: the press tracking of a group of buttons;
 *   GROUP_PRESS_POINTERS, the pointers it follows
 * @position Internal hook, not exported from the hooks entry. It drives
 *   useActionGroupTracking and the shared touch hit area (useTouchHitArea)
 *   for a group's members. ButtonGroup consumes it, and its root applies
 *   touchHitAreaStyles.layerBelowChildren. AlertDialog's tracking follows
 *   GROUP_PRESS_POINTERS too.
 *
 * SYNC: When modified, update ButtonGroupTracking.test.tsx.
 */

import type {RefCallback, RefObject} from 'react';
import type {GestureTouch} from '../gestures/types';
import {isPressGroupItem} from '../privateAttributes/pressGroupItem.stylex';
import {groupGrowth} from '../utils/hitArea';
import {useTouchHitArea, type TouchHitAreaOptions} from '../utils/touchHitArea';
import {
  DISABLED_SELECTOR,
  measureActions,
  type ActionGroupTarget,
} from './actionGroupTracker';
import {
  measureNeighbours,
  resolveNearestAction,
  useActionGroupTracking,
} from './useActionGroupTracking';

/** What a member Button renders. The tracker keeps the marked ones. */
const MEMBER_ELEMENTS = 'button, a[href]';

/**
 * Whether `box` has an area. A hidden member's box is empty, at the
 * viewport's corner, so it neither tracks a press nor grows a target.
 */
function hasArea(box: Omit<ActionGroupTarget, 'element'>): boolean {
  return box.right > box.left && box.bottom > box.top;
}

/** Whether the group tracks `member`, read without its box. */
function isTrackedMember(member: Element): boolean {
  return isPressGroupItem(member) && !member.matches(DISABLED_SELECTOR);
}

/**
 * The tracked, enabled members with a box, each box read once. The tracker
 * measures its actions with the same function.
 */
function trackedTargets(group: HTMLElement): ActionGroupTarget[] {
  return measureActions([group], MEMBER_ELEMENTS, isTrackedMember).filter(
    hasArea,
  );
}

/**
 * The group's hit area. Each side grows as far as the members on that edge
 * would. The tracker reads the members when a press begins, so a press reads
 * nothing else on the page.
 */
const GROUP_HIT_AREA: TouchHitAreaOptions = {
  growth: (box, toLayout, group) =>
    groupGrowth(box, trackedTargets(group).map(toLayout)),
  checkAtPress: false,
};

/**
 * Whether the group takes `touch`'s press. It takes one on an enabled tracked
 * member. A press on a disabled member keeps its click, so its tooltip can
 * open. It takes a finger's press on its own box or hit layer only where a
 * member's grown target holds it. Any other press keeps its own click, so a
 * tap beside the members of a wide group reaches the page. A member the group
 * does not track, such as a menu trigger, keeps its own press. A group with
 * no box takes none.
 */
function takesPress(group: HTMLElement | null, touch: GestureTouch): boolean {
  const {target} = touch;
  // A node check, not `instanceof`: the group may render in another window.
  if (group == null || (target as Node | null)?.nodeType !== 1) {
    return false;
  }
  const box = group.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) {
    return false;
  }
  if (target !== group) {
    const member = (target as Element).closest(MEMBER_ELEMENTS);
    return member != null && group.contains(member) && isTrackedMember(member);
  }
  return (
    touch.pointerType === 'touch' &&
    resolveNearestAction(
      touch.startX,
      touch.startY,
      trackedTargets(group),
      // The tracked members are read once above, so the neighbour test reads
      // only the others.
      measureNeighbours(group, {
        itemSelector: MEMBER_ELEMENTS,
        isItem: isTrackedMember,
      }),
    ) != null
  );
}

export interface GroupPressTracking {
  /**
   * Merge into the group's root: it keeps the hit layer's insets live. While
   * the group tracks presses, the root applies
   * `touchHitAreaStyles.layerBelowChildren` and is positioned, as the layer's
   * containing block.
   */
  readonly hitAreaRef: RefCallback<HTMLElement>;
}

/** The pointers a group's press slides for: a finger and a pen. */
export const GROUP_PRESS_POINTERS = ['touch', 'pen'] as const;

/**
 * Track a held finger or pen across the marked members of the group behind
 * `ref`, while `isEnabled`. The member under it highlights at once, and the
 * lift runs it through its own click. A finger picks the nearest member whose
 * grown target holds it.
 */
export function useGroupPressTracking(
  ref: RefObject<HTMLElement | null>,
  isEnabled: boolean,
): GroupPressTracking {
  useActionGroupTracking(ref, {
    itemSelector: MEMBER_ELEMENTS,
    // A disabled member is the tracker's neighbour. A hidden member has no box,
    // so it is no item.
    isItem: member =>
      isTrackedMember(member) && hasArea(member.getBoundingClientRect()),
    pointerTypes: GROUP_PRESS_POINTERS,
    highlightOnsetMs: 0,
    highlightExpansion: 0,
    resolveTarget: resolveNearestAction,
    shouldTrack: touch => takesPress(ref.current, touch),
    isEnabled,
  });
  // A finger's target grows toward 44 px through the hit layer, not the
  // members. A finger just past a small member lands on the layer, and the
  // tracker picks that member. The shared watch grows a target only under a
  // coarse primary pointer.
  const hitAreaRef = useTouchHitArea(isEnabled, GROUP_HIT_AREA);
  return {hitAreaRef};
}
