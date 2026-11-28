// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file utils/dragClaimWait.ts
 * @input A press's travel past the slop on a surface whose own drag may still
 *   claim the touch, from the press controller (utils/pressFeedback.ts)
 * @output registerDragClaimWait, which installs the wait into that controller
 * @position The controller's optional drag-claim profile. A pan reads the
 *   touch events that follow each pointer event, so the travel waits one frame
 *   for the claim. The swipe runtime registers it as its module loads
 *   (Swipe/useSwipeAction.ts), so a page with no swipe carries none of it.
 */

import {awaitsDragClaim} from '../privateAttributes/pressHoldsDrag.stylex';
import {installDragClaimWait} from './pressFeedback';

/** The latest travel held back, and the frame that runs it. */
let heldTravel: (() => void) | null = null;
let frame = 0;

function settle(): void {
  cancelAnimationFrame(frame);
  const travel = heldTravel;
  heldTravel = null;
  travel?.();
}

function hold(element: Element, travel: () => void): boolean {
  if (!awaitsDragClaim(element)) {
    return false;
  }
  if (heldTravel == null) {
    frame = requestAnimationFrame(settle);
  }
  heldTravel = travel;
  return true;
}

/** Installs the drag-claim wait into the shared press controller. */
export function registerDragClaimWait(): void {
  installDragClaimWait({hold, settle});
}
