// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useOwnScrollGesture.ts
 * @input A scroll container ref and which axis it owns
 * @output Stops touch gestures on that container from reaching an ancestor
 * @position Internal behavior hook; consumed by Wheel.tsx, PickerWheel.tsx,
 *   MonthScroller.tsx and MonthPager.tsx
 *
 * Lets a nested scroller keep the finger that lands on it.
 *
 * ## The conflict
 *
 * `BottomSheet` implements swipe-to-dismiss by watching touches on its
 * scrolling body: at the body's scroll top, a downward pull stops being a
 * scroll and becomes a sheet drag. The test is `body.scrollTop`, and the body
 * of a sheet sized to hug its content never scrolls, so it reads as "at the
 * top" forever — every downward-ish drag anywhere inside promotes to a drag.
 *
 * `touch-action` does NOT protect against this. It governs what the BROWSER
 * will pan natively; the sheet's listener is JavaScript, and its
 * `preventDefault()` cancels the native scroll whatever `touch-action` says.
 * Measured: with `touch-action: pan-x` on the month scroller, a swipe just 9°
 * off horizontal (120px across, 20px down — an ordinary thumb arc) had every
 * `touchmove` cancelled by the sheet, so the calendar did not move at all and
 * the sheet sprang back. The month simply would not change.
 *
 * ## Three ways to own a gesture
 *
 * - `'all'` — the wheels. They scroll on the sheet's own axis, so they take
 *   every touch, and the sheet is dismissed from its handle, header or scrim.
 *
 * - `'inline'` — the month scroller. It pages sideways, so the two CAN share
 *   by direction: lock the axis on the first significant move, claim the
 *   gesture only when it is horizontal, and let vertical ones through so
 *   swipe-to-dismiss still works on the calendar.
 *
 * - `'pager'` — the month pager, which pans in JavaScript. It splits as UIKit
 *   does in a sheet ({@link PAGER_DECISION_TRAVEL}), touch pointers included.
 *
 * ## Where the line falls, and the gestures that fall past it
 *
 * A thumb swiping sideways travels in an arc, not a line — a "horizontal"
 * swipe routinely drifts 10-30° down, and sometimes further. So an `'inline'`
 * scroller claims generously: vertical has to beat horizontal by
 * {@link VERTICAL_DOMINANCE} before the sheet gets the gesture, which puts the
 * split near 63° rather than at the diagonal.
 *
 * That is wider than the browser will pan. `touch-action: pan-x` pans only
 * while `|dx| > |dy|` and refuses the moment a gesture tips past 45°, so the
 * band between the two lines used to be the worst outcome available: measured
 * on an iPhone 15 profile, a 200px swipe at 45-60° neither paged a month nor
 * dismissed the sheet, because we had told the sheet to keep off a gesture the
 * compositor then declined to pan. Nothing moved at all.
 *
 * {@link OwnScrollGestureOptions.onSwipe} closes that band, and it does not
 * need to know where the browser's line is: if the element's scroll offset
 * never changed across a claimed gesture, the browser declined it, and a
 * swipe that cleared {@link SWIPE_DISTANCE} is reported so the caller can page
 * itself. Native pans keep their momentum and snapping and report nothing.
 *
 * It is generous about distance too: a 30px flick pages, where the sheet asks
 * for ~200px of pull before it dismisses.
 *
 * ## Why native listeners
 *
 * React delegates its events at the root container, which is an ANCESTOR of
 * the sheet body — so a React `onTouchStart` would run after the body's own
 * listener had already claimed the gesture. `stopPropagation` has to happen on
 * a listener attached to the element itself, during the real bubble phase,
 * before the event ever reaches the body.
 *
 * Nothing here calls `preventDefault`, so the listeners stay passive and the
 * scroller keeps native momentum, snapping and rubber-banding.
 *
 * SYNC: When modified, update DateInputTouch.test.tsx.
 */

import {useEffect, useRef} from 'react';

import {UIKIT_GESTURES} from '../motion/uikit/gestures';

/**
 * How much a gesture's vertical travel must exceed its horizontal travel
 * before an `'inline'` scroller gives it up. Above 1, so horizontal wins the
 * ambiguous middle; see the file header for why the split is deliberately
 * unfair, and how the gestures past the browser's own 45° line are handled.
 */
export const VERTICAL_DOMINANCE = 2;

/** Movement below this is noise, not a direction. */
const AXIS_LOCK_SLOP = 6;

/**
 * Horizontal travel a claimed-but-unpanned gesture needs before it counts as
 * a swipe. Roughly the shortest flick the browser itself will page on.
 */
export const SWIPE_DISTANCE = 32;

/**
 * The travel, on either axis, at which a `'pager'` drag is decided. UIKit
 * begins both the sheet's pan and the grid's at the pan's hysteresis.
 *
 * @source measured: UIKit lab, iOS 26.2 simulator, `.date` `.inline` in a
 *   medium-detent sheet, 100 pt drags from the grid at 45°, 47.5°, 50°,
 *   52.5° and 55°, slow and fast, three each, logged per touch sample
 *   (motion/MEASUREMENTS.md M-DP01), Oct 25 2026: every drag was decided on
 *   the first sample where |dx| or |dy| reached 10 pt; the grid took it when
 *   |dx| had (first samples (10.0, 11.0), (10.7, 12.7)) and the sheet when
 *   only |dy| had ((9.7, 11.3), (8.0, 10.3))
 */
const PAGER_DECISION_TRAVEL = UIKIT_GESTURES.pan.hysteresis.value;

export type OwnedAxis = 'all' | 'inline' | 'pager';

export type OwnScrollGestureOptions = {
  /** Skip while the scroller is hidden; a hidden panel keeps its layout box,
   * so its listeners would otherwise still be live. */
  isEnabled?: boolean;
  /**
   * Called when a claimed gesture ended without the browser having scrolled
   * the element at all — the diagonal swipes `touch-action: pan-x` refuses.
   *
   * `direction` is the sign to move the scroll offset by, so it composes
   * directly: `scrollBy({left: direction * pageWidth})`. It is physical, and
   * therefore correct in both directions of writing.
   *
   * Only fires for `'inline'`. A gesture the browser panned reports nothing,
   * so momentum and snapping are never second-guessed.
   */
  onSwipe?: (direction: 1 | -1) => void;
  /**
   * Also keep the pointer a touch lands with, for an `'all'` scroller that pans
   * through the gesture system rather than natively. A sheet arms its pull-down
   * on its body's `pointerdown`, and counts on a native pan to cancel a touch
   * pointer. A pan of the gesture system never cancels it. Without this, the
   * sheet follows the first 8 px of a downward drag before the scroller's own
   * pan takes over. The gesture host and the shared modality tracker listen in
   * the capture phase, before this.
   */
  isPointerKept?: boolean;
};

/**
 * Claim touch gestures that start on `ref`'s element, so an ancestor cannot
 * reinterpret them as its own drag.
 *
 * @param ref - the scroll container
 * @param axis - `'all'` to take every touch, `'inline'` to take only the
 *   horizontal ones and leave vertical drags to the sheet, `'pager'` to split
 *   as UIKit does in a sheet
 * @param options - see {@link OwnScrollGestureOptions}
 */
export function useOwnScrollGesture(
  ref: React.RefObject<HTMLElement | null>,
  axis: OwnedAxis = 'all',
  options: OwnScrollGestureOptions = {},
): void {
  const {isEnabled = true, onSwipe, isPointerKept = false} = options;

  // Read through a ref so a caller need not memoize the callback: re-running
  // this effect would tear the listeners off mid-gesture.
  const onSwipeRef = useRef(onSwipe);
  onSwipeRef.current = onSwipe;

  // Syncs the element's touch listeners, and a pager's pointer listeners,
  // with `isEnabled`. They decide which gesture owns a drag on the element.
  useEffect(() => {
    const element = ref.current;
    if (element == null || !isEnabled) {
      return;
    }

    // null = not yet decided; true = ours for the rest of this gesture.
    let claimed: boolean | null = null;
    let originX = 0;
    let originY = 0;
    let lastX = 0;
    let offsetAtStart = 0;
    // Whether the browser actually panned the element during this gesture.
    // Sampled per move rather than compared once at the end, because a short
    // pan that snaps back finishes at the offset it started from.
    let didPan = false;
    // Only an 'inline' scroller reads its offset: the swipe fallback needs it,
    // and a pager's JavaScript pan should not force a layout on every move.
    const isTrackingPan = axis === 'inline';

    const begin = (x: number, y: number) => {
      originX = x;
      originY = y;
      lastX = x;
      offsetAtStart = isTrackingPan ? element.scrollLeft : 0;
      didPan = false;
      // 'all' decides at touchstart, before the sheet's own touchstart
      // listener records an armed edge. The others cannot decide yet: a touch
      // has no direction until it moves.
      claimed = axis === 'all' ? true : null;
    };

    /**
     * Whether a move to (x, y) is kept from the ancestor. It decides once:
     * `'inline'` on the first move past the slop, and `'pager'` on the first
     * move that travels its decision distance. A pager holds the moves before.
     */
    const isKept = (x: number, y: number): boolean => {
      if (claimed == null) {
        const dx = Math.abs(x - originX);
        const dy = Math.abs(y - originY);
        if (axis === 'pager') {
          if (Math.max(dx, dy) < PAGER_DECISION_TRAVEL) {
            return true;
          }
          claimed = dx >= PAGER_DECISION_TRAVEL;
        } else {
          if (Math.max(dx, dy) < AXIS_LOCK_SLOP) {
            return false;
          }
          claimed = dy <= dx * VERTICAL_DOMINANCE;
        }
      }
      return claimed;
    };

    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      begin(touch?.clientX ?? 0, touch?.clientY ?? 0);
      if (claimed) {
        event.stopPropagation();
      }
    };

    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch == null || !isKept(touch.clientX, touch.clientY)) {
        return;
      }
      lastX = touch.clientX;
      if (isTrackingPan) {
        didPan ||= Math.abs(element.scrollLeft - offsetAtStart) >= 1;
      }
      event.stopPropagation();
    };

    const onEnd = () => {
      // A gesture we claimed that the browser then refused to pan: the sheet
      // was told to keep off it, so unless it is acted on here it does
      // nothing at all. See the file header.
      if (
        claimed === true &&
        isTrackingPan &&
        !didPan &&
        Math.abs(lastX - originX) >= SWIPE_DISTANCE
      ) {
        onSwipeRef.current?.(lastX < originX ? 1 : -1);
      }
      // touchend/touchcancel deliberately propagate: they carry no
      // interpretation, and letting them through is what resets the sheet's
      // bookkeeping.
      claimed = null;
    };

    // A pager pans in JavaScript, which cancels no pointer, so the sheet would
    // also follow its touch pointer. The same decision keeps it.
    const isTouchPointer = (event: PointerEvent) =>
      event.pointerType === 'touch' && event.isPrimary;
    const onPointerDown = (event: PointerEvent) => {
      if (isTouchPointer(event)) {
        begin(event.clientX, event.clientY);
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (isTouchPointer(event) && isKept(event.clientX, event.clientY)) {
        event.stopPropagation();
      }
    };

    const keepPointer = (event: PointerEvent) => event.stopPropagation();
    const isKeepingPointer = axis === 'all' && isPointerKept;
    const isSplittingPointer = axis === 'pager';

    element.addEventListener('touchstart', onStart, {passive: true});
    element.addEventListener('touchmove', onMove, {passive: true});
    element.addEventListener('touchend', onEnd, {passive: true});
    element.addEventListener('touchcancel', onEnd, {passive: true});
    if (isKeepingPointer) {
      element.addEventListener('pointerdown', keepPointer);
    }
    if (isSplittingPointer) {
      element.addEventListener('pointerdown', onPointerDown, {passive: true});
      element.addEventListener('pointermove', onPointerMove, {passive: true});
    }
    return () => {
      element.removeEventListener('touchstart', onStart);
      element.removeEventListener('touchmove', onMove);
      element.removeEventListener('touchend', onEnd);
      element.removeEventListener('touchcancel', onEnd);
      if (isKeepingPointer) {
        element.removeEventListener('pointerdown', keepPointer);
      }
      if (isSplittingPointer) {
        element.removeEventListener('pointerdown', onPointerDown);
        element.removeEventListener('pointermove', onPointerMove);
      }
    };
  }, [ref, axis, isEnabled, isPointerKept]);
}
