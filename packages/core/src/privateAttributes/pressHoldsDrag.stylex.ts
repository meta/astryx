// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file privateAttributes/pressHoldsDrag.stylex.ts
 * @input Whether a pressable's own drag moves under the finger, or may claim
 *   the touch and then move it
 * @output pressHoldsDragProps, which marks such a pressable; setPressDragHold,
 *   which marks or unmarks one from code; holdsPressThroughDrag and
 *   awaitsDragClaim, which read the mark
 * @position Owner module of the private press-holds-drag attribute: the only
 *   file that writes its name. Switch marks its row, and the swipe runtime
 *   marks a swipe row's root (Swipe/useSwipeAction.ts). The press controller
 *   (utils/pressFeedback.ts) keeps the press painted through that drag, and
 *   the drag-claim wait (utils/dragClaimWait.ts) reads the waiting mark. No
 *   package entry exports it.
 */

const PRESS_HOLDS_DRAG = 'data-astryx-press-holds-drag';

/** The mark's value while the drag that would hold the press has not claimed the touch. */
const AWAITING_CLAIM = 'claim';

/**
 * Spread on a pressable whose own drag the finger moves, such as a Switch's
 * thumb. The drag is not a scroll, so the press stays painted.
 */
export function pressHoldsDragProps(
  holdsDrag: boolean,
): Readonly<Record<string, string>> {
  return holdsDrag ? {[PRESS_HOLDS_DRAG]: ''} : {};
}

/**
 * Marks a pressable whose own drag starts only once it claims the touch, as a
 * swipe row's does. `claim`: a press that travels waits a frame for that
 * claim, since a pan reads the touch events that follow each pointer event.
 * `held`: the drag claimed the touch, so the press stays painted through it.
 * `none`: unmarked.
 */
export function setPressDragHold(
  surface: Element,
  hold: 'none' | 'claim' | 'held',
): void {
  if (hold === 'none') {
    surface.removeAttribute(PRESS_HOLDS_DRAG);
  } else {
    surface.setAttribute(
      PRESS_HOLDS_DRAG,
      hold === 'claim' ? AWAITING_CLAIM : '',
    );
  }
}

/** Whether the press on `element` stays painted through its drag. */
export function holdsPressThroughDrag(element: Element): boolean {
  const mark = element.getAttribute(PRESS_HOLDS_DRAG);
  return mark != null && mark !== AWAITING_CLAIM;
}

/** Whether a drag on `element` may still claim the touch and hold its press. */
export function awaitsDragClaim(element: Element): boolean {
  return element.getAttribute(PRESS_HOLDS_DRAG) === AWAITING_CLAIM;
}
