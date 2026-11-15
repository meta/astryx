// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file holdEntranceInput.ts
 * @input A layer root whose CSS entrance has just started
 * @output holdEntranceInput: under a coarse primary pointer, a finger's or a
 *   pen's input held away from the layer until its entrance ends
 * @position The entrance hold for layers that enter through CSS (Dialog,
 *   Drawer, MobileNav, DropdownMenu), on the Layer module's input hold
 *   (inputHold.ts)
 *
 * SYNC: When modified, update holdEntranceInput.test.ts and its callers
 * (Dialog.tsx, Drawer/useDrawerDialogPresence.ts, MobileNav/MobileNav.tsx,
 * DropdownMenu/DropdownMenu.tsx).
 */

import {isCoarsePointer} from '../utils/coarsePointer';
import {holdInput} from './inputHold';

/** Options for {@link holdEntranceInput}. */
export interface EntranceHoldOptions {
  /**
   * Holds input anywhere while true. While false, only what lands on the layer
   * is held, and the page stays live.
   * @default true
   */
  isModal?: boolean;
  /**
   * The element whose animations are the entrance, when it is not the layer
   * itself (a drawer inside its dialog).
   * @default the layer
   */
  entrance?: Element | null;
  /** The longest the hold lasts, ms. An entrance that runs longer ends it. */
  capMs?: number;
}

/**
 * Holds a finger's and a pen's input away from `layer` until its entrance
 * ends, or at most `capMs`. Returns the release, or `null` when nothing is
 * held: no entrance runs, or the primary pointer is fine.
 */
export function holdEntranceInput(
  layer: Element,
  {isModal = true, entrance: animated = layer, capMs}: EntranceHoldOptions = {},
): (() => void) | null {
  if (animated == null || typeof animated.getAnimations !== 'function') {
    return null;
  }
  // getAnimations() flushes styles, so it lists an entrance the open has just
  // started. A theme's duration, a shorter reduced-motion entrance and a
  // canceled entrance all end the hold when they end.
  const entrance = animated.getAnimations().filter(isEntrance);
  if (entrance.length === 0) {
    return null;
  }
  // A touch presentation only, read as the layer opens. A finger on a device
  // whose primary pointer is fine, such as a touchscreen laptop, is not held.
  if (!isCoarsePointer(layer.ownerDocument.defaultView)) {
    return null;
  }
  const ended = Promise.all(
    entrance.map(async animation => animation.finished),
  );
  return holdInput(layer, {
    until: capMs == null ? ended : Promise.race([ended, after(capMs)]),
    scope: isModal ? 'viewport' : 'surface',
  });
}

async function after(ms: number): Promise<void> {
  await new Promise(resolve => {
    setTimeout(resolve, ms);
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
