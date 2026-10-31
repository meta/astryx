// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file holdEntranceInput.ts
 * @input A layer root whose entrance (a CSS animation or transition) has just
 *   started
 * @output holdEntranceInput: under a coarse primary pointer, a finger's or a
 *   pen's input held away from the layer until its entrance has played; a
 *   mouse's left alone
 * @position The entrance hold of the layers that enter through CSS (Dialog,
 *   Drawer), on the Layer module's one input hold (inputHold.ts)
 *
 * spec:AST-094 FR35: under a finger, a tap or a drag that lands while a
 * touch presentation is still entering reaches nothing, and the presentation
 * finishes entering and stays open. The hold keeps keys and assistive
 * technology live and the content in the accessibility tree, and a pinch
 * still zooms the page. Around a non-modal layer only what lands on the
 * layer is held (the `'surface'` scope), and the page stays live.
 *
 * A layer is held only under a coarse primary pointer, the condition of a
 * touch presentation (FR13), as MobileNav's own hold is: under a fine primary
 * pointer nothing is held and nothing listens, so a mouse keeps today's
 * behavior, a press made where it already rests included (FR35, DEC-16,
 * FR24). Under a coarse one the hold decides by each event's pointer, so a
 * mouse or a trackpad on a touch screen keeps its clicks once it moves. A
 * finger on a device whose primary pointer is fine (a touchscreen laptop) is
 * not held: an implementation gap on FR35's adoption.
 *
 * The entrance is read from the layer's own animations as it opens:
 * `getAnimations()` flushes styles, so a CSS animation or an `@starting-style`
 * transition the open has just started is in the list. A theme's duration,
 * Reduce Motion's shorter entrance and a canceled entrance (a close mid-way)
 * all end the hold when they end, and an animation without an end (a spinner
 * inside) is no entrance.
 *
 * SYNC: When modified, update holdEntranceInput.test.ts and its callers
 * (Dialog.tsx, Drawer/useDrawerDialogPresence.ts).
 */

import {TOUCH_QUERY} from '../utils/touchQueries';
import {holdInput} from './inputHold';

/**
 * Holds a finger's and a pen's input away from `layer` until the entrance it
 * is playing ends: input anywhere, or with `isModal: false` only what lands
 * on the layer. Returns the release, or `null` when nothing is held: no
 * entrance running, or a fine primary pointer.
 */
export function holdEntranceInput(
  layer: Element,
  {isModal = true}: {isModal?: boolean} = {},
): (() => void) | null {
  if (typeof layer.getAnimations !== 'function') {
    return null;
  }
  const entrance = layer.getAnimations().filter(isEntrance);
  if (entrance.length === 0) {
    return null;
  }
  // A touch presentation only: read as the layer opens.
  if (
    layer.ownerDocument.defaultView?.matchMedia?.(TOUCH_QUERY).matches !== true
  ) {
    return null;
  }
  return holdInput(layer, {
    until: Promise.all(entrance.map(async animation => animation.finished)),
    scope: isModal ? 'viewport' : 'surface',
  });
}

/** A running animation that ends on its own: an entrance, not a spin. */
function isEntrance(animation: Animation): boolean {
  if (animation.playState !== 'running') {
    return false;
  }
  const end = animation.effect?.getComputedTiming().endTime;
  return typeof end === 'number' && Number.isFinite(end);
}
