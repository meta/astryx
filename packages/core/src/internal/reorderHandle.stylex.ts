// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reorderHandle.stylex.ts
 * @input Uses StyleX
 * @output Exports `reorderHandleGeometry`, the one definition of a List
 *   reorder handle's geometry: its grip's box, how far its targets reach past
 *   the grip, and how far a hanging handle sits from its row's content
 * @position Internal entry for Astryx's own reorderable collections. Core
 *   List's handle (List/ListReorderHandle.tsx) reads it, and so does the room
 *   Lab's ListInput and TransferList keep for the handle
 *
 * `defineConsts`, not plain exported strings: StyleX inlines a cross-file
 * value only through `defineVars`/`defineConsts` from a `.stylex.ts` file.
 * Nothing here is a theme variable: the handle's geometry is not treatment.
 * A theme's icon slot size changes only the icon, never this geometry.
 *
 * SYNC: When modified, update utils/hitArea.ts MIN_TOUCH_TARGET.
 */

import * as stylex from '@stylexjs/stylex';

// The grip's box: the default icon size.
const GRIP = '1rem';
// A fine pointer's target is an invisible square of at least 24 px round the
// grip (WCAG 2.5.8). It reaches at least 4 px past the grip, so the focus
// ring clears the grip.
const TARGET_REACH = `max(4px, (24px - ${GRIP}) / 2)`;
// A finger's target is 44 px across the grip.
const TOUCH_REACH = `calc((44px - ${GRIP}) / 2)`;
// A hanging handle sits so that its target stops at the row's content.
const HANG = `calc(${GRIP} + ${TARGET_REACH})`;

export const reorderHandleGeometry = stylex.defineConsts({
  /** The grip's box. */
  grip: GRIP,
  /** How far a fine pointer's target reaches past the grip, on each side. */
  targetReach: TARGET_REACH,
  /** How far a finger's target reaches past the grip, on each side. */
  touchReach: TOUCH_REACH,
  /** How far a hanging handle's grip reaches outside its row's content. */
  hang: HANG,
  /** How far a hanging handle's target reaches outside its row's content. */
  hangRoom: `calc(${HANG} + ${TARGET_REACH})`,
});
