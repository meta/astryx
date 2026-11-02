// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file createSwipe.ts
 * @input The declared actions per side and the behavior; SwipeActionsLayer
 *   (the panels and the gesture), the row root's style, and the runtime's
 *   root routing (swipeRoots.ts)
 * @output Exports createSwipe, which makes the Swipe value a row takes as
 *   `swipe`, carrying the runtime a row hands its root to
 * @position The public entry of swipe actions (`spec:AST-057` DEC-8, FR10):
 *   the module that brings the gesture core, the animator pieces, the panels
 *   and the rules for which rows the swipe serves, so a row ships them only
 *   when its caller uses swipe actions. Tested by createSwipe.test.ts and
 *   through Item.test.tsx.
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
 * Whether swipe actions serve a row (`spec:AST-057` DEC-3): where its role
 * permits interactive descendants (a panel's buttons are such descendants),
 * and not on a disabled row, a row that is the enlarged target of a control
 * inside it, or a root that is itself a link.
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
 * Makes a row's swipe actions: the verbs a sideways drag uncovers on each
 * side, declared as data, and what a swipe does. Pass the result as `swipe`
 * on `Item` or `ListItem`. A plain function, not a hook: callable at module
 * scope, outside a render, and on the server, and doing no DOM work when
 * imported or called. The swipe carries no built-in text: every name it
 * exposes is a caller's `label`.
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
    // The other entries have no touch path (`spec:AST-057` FR3).
    devWarn(
      'createSwipe',
      "`swipeBehavior: 'commit'` fires only the outermost entry of a side; " +
        'the other entries have no touch path. Give a committing side one ' +
        "entry, or use `swipeBehavior: 'reveal'`.",
    );
  }
  const hasEntries = leading.length > 0 || trailing.length > 0;
  return makeSwipe({
    leading,
    trailing,
    behavior,
    // A row hands its facts and its root: the swipe serves it or not, and
    // brings everything it serves it with. The same layer type and root
    // handlers for every value, so a new value from an inline call keeps the
    // gesture and an open row as they are (`spec:AST-057` FR11).
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
