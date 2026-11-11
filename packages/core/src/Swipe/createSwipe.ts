// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file createSwipe.ts
 * @input The declared actions per side and the behavior; SwipeActionsLayer
 *   (the panels and the gesture), the row root's style, and the runtime's
 *   root routing (swipeRoots.ts)
 * @output Exports createSwipe, which makes the Swipe value a row takes as
 *   `swipe`, carrying the runtime a row hands its root to
 * @position The public entry of swipe actions. The module brings the gesture
 *   core, the animator pieces, the panels and the rules for which rows the
 *   swipe serves. So a row ships them only when its caller uses swipe actions.
 *   Tested by createSwipe.test.ts and through Item.test.tsx.
 */

import {createElement} from 'react';
import {devWarn} from '../utils/devWarning';
import SwipeActionsLayer from './SwipeActionsLayer';
import {swipeHostStyles} from './swipeHost.stylex';
import {
  makeSwipe,
  type CreateSwipeOptions,
  type Swipe,
  type SwipeRowFacts,
} from './swipeHost';
import {swipeRootProps} from './swipeRoots';

/**
 * Roles whose content model permits interactive descendants, so a swipe
 * panel's buttons may live inside the row. A row with no role at all
 * qualifies too; `option`, the `menuitem*` roles and the rest do not.
 */
const SWIPE_ROLES = new Set(['listitem']);

/**
 * Whether swipe actions serve a row. They do where its role permits interactive
 * descendants, since a panel's buttons are such descendants. They do not serve
 * a disabled row, a row that is a nested control's enlarged target, or a root
 * that is itself a link.
 */
function serves({role, isDisabled, isDelegate, isLinkRoot}: SwipeRowFacts) {
  return (
    !isDisabled &&
    !isDelegate &&
    !isLinkRoot &&
    (role == null || SWIPE_ROLES.has(role))
  );
}

/**
 * Makes a row's swipe actions: the verbs a sideways drag uncovers on each side,
 * declared as data, and what a swipe does. Pass the result as `swipe` on `Item`
 * or `ListItem`. A plain function, not a hook: callable at module scope,
 * outside a render, and on the server. It does no DOM work when imported or
 * called. The swipe carries no built-in text: every name it exposes is a
 * caller's `label`.
 *
 * @example
 * ```
 * <ListItem
 *   label="Inbox"
 *   swipe={createSwipe({
 *     trailing: [
 *       {label: 'Archive', onActivate: archive},
 *       {label: 'Delete', onActivate: remove, variant: 'destructive', hasRemoval: true},
 *     ],
 *   })}
 * />
 * ```
 */
export function createSwipe(options: CreateSwipeOptions): Swipe {
  const leading = Object.freeze([...(options.leading ?? [])]);
  const trailing = Object.freeze([...(options.trailing ?? [])]);
  const behavior = options.swipeBehavior ?? 'reveal';
  if (behavior === 'commit' && (leading.length > 1 || trailing.length > 1)) {
    // A committing side never rests open, so a full swipe confirms from no
    // open row.
    devWarn(
      'createSwipe',
      "`swipeBehavior: 'commit'` fires no entry on a side with two or more " +
        "entries. Give a committing side one entry, or use `swipeBehavior: 'reveal'`.",
    );
  }
  const hasEntries = leading.length > 0 || trailing.length > 0;
  return makeSwipe({
    leading,
    trailing,
    behavior,
    serves: facts => hasEntries && serves(facts),
    // A row hands its facts and its root: the swipe serves it or not, and
    // brings everything it serves it with. Every value uses the same layer type
    // and root handlers. So a new value from an inline call keeps the gesture
    // and an open row as they are.
    attach: facts =>
      hasEntries && serves(facts)
        ? {
            rootStyle: swipeHostStyles.root,
            rootProps: swipeRootProps,
            layer: createElement(SwipeActionsLayer, {
              leading,
              trailing,
              behavior,
            }),
          }
        : null,
  });
}
