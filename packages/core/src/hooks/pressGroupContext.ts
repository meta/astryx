// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file pressGroupContext.ts
 * @input The layer-scoped context factory (Layer/layerScopedContext) and
 *   the press-group marker (privateAttributes/pressGroupItem.stylex)
 * @output PressGroupContext: the pointer types a group's own tracker follows
 *   on its actions, or null outside one. HitAreaGroupContext: whether the
 *   action is a member of a group that sets its touch band's room.
 *   pressGroupItemProps: the marker Button writes
 * @position Internal; not exported from the hooks entry. Groups that track
 *   presses provide it, and Button reads it. A layer resets it, so a Button
 *   in a member's layer is not tracked.
 */

import {createLayerScopedContext} from '../Layer/layerScopedContext';

// Button reads the marker here, not from its private StyleX module: a
// swizzled Button imports each StyleX module by its public path.
export {pressGroupItemProps} from '../privateAttributes/pressGroupItem.stylex';

/**
 * The pointer types a group's tracker follows on its actions, such as
 * `['touch', 'pen']`, or null outside a tracking group. Those actions take no
 * `:active` paint, so one press never lights two.
 */
export const PressGroupContext =
  createLayerScopedContext<ReadonlyArray<string> | null>(
    'PressGroupContext',
    1,
    null,
  );
PressGroupContext.displayName = 'PressGroupContext';

/**
 * Whether the action is a member of a group that sets the room of its touch
 * band: half the group's gap toward its neighbours, and the full room at the
 * group's ends (`touchHitAreaStyles.member`).
 */
export const HitAreaGroupContext = createLayerScopedContext<boolean>(
  'HitAreaGroupContext',
  1,
  false,
);
HitAreaGroupContext.displayName = 'HitAreaGroupContext';
