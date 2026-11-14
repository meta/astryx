// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file actionGroupNeighbours.ts
 * @input An action group's root, its actions' selector and filter, and a
 *   finger's point
 * @output `resolveNearestAction` and `measureNeighbours`: which action a
 *   finger picks, and the members it must not reach through
 * @position Shared by the action-group tracking and the group press
 *   tracking. It holds no gesture code, so a group that reads it statically
 *   does not pull in the deferred touch runtime
 */

import {INTERACTIVE_SELECTOR, resolveHitTarget} from '../utils/hitArea';
import {DISABLED_SELECTOR, type ActionGroupTarget} from './actionGroupTracker';
import type {ActionGroupTrackingOptions} from './useActionGroupTracking';

const NO_TARGETS: ReadonlyArray<ActionGroupTarget> = [];

/**
 * The action under a finger: the nearest enabled action whose target, grown
 * toward 44 px, holds the point. A neighbour counts for nearness but
 * resolves to none. So nothing highlights over a disabled action, and no
 * grown target reaches into another member.
 */
export function resolveNearestAction(
  x: number,
  y: number,
  targets: ReadonlyArray<ActionGroupTarget>,
  neighbours: ReadonlyArray<ActionGroupTarget>,
): HTMLElement | null {
  const index = resolveHitTarget(
    x,
    y,
    neighbours.length === 0 ? targets : [...targets, ...neighbours],
  );
  return index >= 0 && index < targets.length ? targets[index].element : null;
}

/**
 * The members inside `root` that a finger must not reach through, with their
 * boxes: the disabled actions and every member the group does not track.
 */
export function measureNeighbours(
  root: HTMLElement | null,
  {
    itemSelector,
    isItem,
  }: Pick<ActionGroupTrackingOptions, 'itemSelector' | 'isItem'>,
): ReadonlyArray<ActionGroupTarget> {
  if (root == null) {
    return NO_TARGETS;
  }
  const isTracked = (element: HTMLElement) =>
    element.matches(itemSelector) && isItem?.(element) !== false;
  const neighbours: ActionGroupTarget[] = [];
  for (const element of root.querySelectorAll<HTMLElement>(
    `${itemSelector}, ${INTERACTIVE_SELECTOR}`,
  )) {
    // A tracked action is a neighbour only when it is disabled. An untracked
    // member inside a tracked action is part of that action.
    const host = element.parentElement?.closest<HTMLElement>(itemSelector);
    const isNeighbour = isTracked(element)
      ? element.matches(DISABLED_SELECTOR)
      : host == null || !root.contains(host) || !isTracked(host);
    if (isNeighbour) {
      const {left, top, right, bottom} = element.getBoundingClientRect();
      neighbours.push({element, left, top, right, bottom});
    }
  }
  return neighbours;
}
