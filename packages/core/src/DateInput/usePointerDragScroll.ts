// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file usePointerDragScroll.ts
 * @input A scroll container ref
 * @output Lets a mouse drag the container's contents the way a finger does,
 *   and reports while a drag holds it (`isDraggingRef`)
 * @position Internal behavior hook; consumed by Wheel.tsx
 *
 * ## Why this exists
 *
 * A wheel is a scroll container, which is what makes it feel right under a
 * finger: the platform supplies panning, momentum, rubber-banding and the
 * snap. A mouse gets none of that. Browsers do not drag-scroll an overflow
 * container — press and pull on one and nothing happens at all, which is
 * exactly what a wheel invites you to try.
 *
 * That leaves the mouse with the scroll wheel and a click on a visible row.
 * Both work, and neither is the gesture the control is shaped like. It
 * matters more than "mouse users are not the target": the touch surface is
 * reviewed, themed and screenshotted on desktop browsers, where a wheel that
 * ignores the pointer reads as broken rather than as touch-only.
 *
 * ## Mouse only, deliberately
 *
 * Touch and pen already pan natively, and this hook would be strictly worse
 * than what they get — no momentum, no rubber-banding, no compositor
 * threading. So it ignores every pointer type but `mouse` and leaves those
 * gestures untouched.
 *
 * ## Snap has to be suspended for the duration
 *
 * `scroll-snap-type: y mandatory` re-snaps after every scroll, including a
 * programmatic one, so a drag that assigns `scrollTop` is fighting it on
 * every frame. Measured: dragging 5px at a time with mandatory snap on, 7 of
 * 8 steps were yanked back to a snap position — the wheel sticks to a row and
 * then jumps a whole one. The drag therefore suspends snapping, and restores
 * it once the release has settled somewhere legal.
 *
 * ## A held drag is not rest
 *
 * Every `scrollTop` the drag assigns is a programmatic scroll, and Chromium
 * ends each one with a `scrollend` — 14 moves, 14 of them. A settle listening
 * for `scrollend` alone would commit the row under the band at every step,
 * with the button still down. `isDraggingRef` tells `useScrollSettle` the
 * drag is still held, the way a touch that has not ended does.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/DateInput/Wheel.tsx
 * - /packages/core/src/DateInput/DateInputTouch.test.tsx
 */

import {useEffect, useRef} from 'react';

/**
 * Movement below this stays a click. A mouse shifts a pixel or two under the
 * press of the button itself, and a wheel row is a click target.
 */
export const DRAG_SLOP = 4;

/** How long to wait for a release's settle before restoring snapping. */
const SETTLE_FALLBACK_MS = 260;

/** What {@link usePointerDragScroll} reports back about the drag. */
export type PointerDragScrollState = {
  /**
   * True while a mouse drag holds the container: from the press that moved
   * past {@link DRAG_SLOP} until its release. Pass it to `useScrollSettle`,
   * which treats a held drag as it treats a finger still down.
   */
  isDraggingRef: React.RefObject<boolean>;
};

/**
 * Let a mouse drag `ref`'s contents, on a container that already scrolls and
 * snaps for touch.
 *
 * @param ref - the scroll container
 * @param isEnabled - skip while the wheel is hidden; a hidden panel keeps its
 *   layout box, so its listeners would otherwise still be live
 */
export function usePointerDragScroll(
  ref: React.RefObject<HTMLElement | null>,
  isEnabled: boolean = true,
): PointerDragScrollState {
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const element = ref.current;
    if (element == null || !isEnabled) {
      return;
    }

    let pointerId: number | null = null;
    let originY = 0;
    let originScrollTop = 0;
    isDraggingRef.current = false;
    // Survives from the drag's end to the click it produces, which is the
    // whole reason it is not just `isDraggingRef`.
    let wasDragged = false;
    let restoreTimer: number | undefined;

    const restoreSnap = () => {
      window.clearTimeout(restoreTimer);
      element.removeEventListener('scrollend', restoreSnap);
      // Back to the stylesheet's value rather than a hardcoded one, so this
      // cannot drift from Wheel's own `scrollSnapType`.
      element.style.removeProperty('scroll-snap-type');
    };

    const suspendSnap = () => {
      window.clearTimeout(restoreTimer);
      element.removeEventListener('scrollend', restoreSnap);
      element.style.scrollSnapType = 'none';
    };

    const onPointerDown = (event: PointerEvent) => {
      // Touch and pen pan natively, and better. Secondary buttons are for the
      // context menu.
      if (event.pointerType !== 'mouse' || event.button !== 0) {
        return;
      }
      // Keep the press away from BottomSheet, which starts its own
      // drag-to-dismiss from a `pointerdown` on its body and CAPTURES the
      // pointer for it. Two things go wrong if it gets there first: the drag
      // below is fighting the sheet for the same gesture, and — measured on
      // the calendar too, so this is not new — every later pointer event
      // retargets to the sheet body, which means a click that wobbles more
      // than a pixel or two never reaches the row under it and selects
      // nothing at all.
      //
      // A native listener during the real bubble phase is what it takes:
      // the sheet's handler is a React prop, delegated at the root container,
      // which is an ANCESTOR of this element. Same reasoning as
      // useOwnScrollGesture, and the same trade — mouse drag-to-dismiss now
      // starts from the grab handle, the header or the scrim rather than
      // from inside a wheel, which is where a picker sheet puts it anyway.
      event.stopPropagation();
      pointerId = event.pointerId;
      originY = event.clientY;
      originScrollTop = element.scrollTop;
      isDraggingRef.current = false;
      // Not captured yet: a press that never moves has to stay a click on the
      // row under it, and capturing here would retarget that click.
    };

    const onPointerMove = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) {
        return;
      }
      const delta = event.clientY - originY;
      if (!isDraggingRef.current) {
        if (Math.abs(delta) < DRAG_SLOP) {
          return;
        }
        isDraggingRef.current = true;
        element.setPointerCapture(event.pointerId);
        suspendSnap();
        // Dragging across rows would otherwise select their text, leaving the
        // wheel looking highlighted after the gesture.
        element.style.userSelect = 'none';
      }
      // Content follows the hand: pull up and the list moves up, which means
      // scrolling further down it.
      element.scrollTop = originScrollTop - delta;
    };

    const onPointerEnd = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) {
        return;
      }
      pointerId = null;
      if (!isDraggingRef.current) {
        return;
      }
      isDraggingRef.current = false;
      wasDragged = true;
      element.style.removeProperty('user-select');
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }

      // The release lands mid-row. Glide to the nearest one and only then let
      // snapping back on — restoring it here instead would jump the distance
      // rather than travel it, and a jump is what this hook exists to avoid.
      const rowHeight = firstRowHeight(element);
      if (rowHeight > 0) {
        const nearest = Math.round(element.scrollTop / rowHeight) * rowHeight;
        element.scrollTo({top: nearest, behavior: 'smooth'});
      }
      // `scrollend` is the honest signal; the timer covers browsers that do
      // not fire it, and the case where the glide had nowhere to go.
      // Not `{once: true}`: a listener that never fires is never removed by
      // it, so a component unmounted mid-glide would leave one attached.
      // `restoreSnap` removes it itself, whichever of the two gets there
      // first, and the cleanup below calls `restoreSnap` on unmount.
      //
      // eslint-disable-next-line @eslint-react/web-api-no-leaked-event-listener -- removed by restoreSnap, which the cleanup calls
      element.addEventListener('scrollend', restoreSnap);
      restoreTimer = window.setTimeout(restoreSnap, SETTLE_FALLBACK_MS);
    };

    // A drag ends over whichever row the mouse happens to be on, and that row
    // would take the click as a selection. Swallow it — but only the one, and
    // only after a real drag, so an ordinary click still selects.
    const onClickCapture = (event: MouseEvent) => {
      if (!wasDragged) {
        return;
      }
      wasDragged = false;
      event.stopPropagation();
      event.preventDefault();
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerEnd);
    element.addEventListener('pointercancel', onPointerEnd);
    element.addEventListener('click', onClickCapture, {capture: true});
    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerEnd);
      element.removeEventListener('pointercancel', onPointerEnd);
      element.removeEventListener('click', onClickCapture, {capture: true});
      isDraggingRef.current = false;
      restoreSnap();
    };
  }, [ref, isEnabled]);

  return {isDraggingRef};
}

/**
 * The pitch of the rows, read off the first one. Taken from layout rather
 * than the token so a themed `--date-input-touch-wheel-item-size` is honoured
 * without this hook having to know the variable exists.
 */
function firstRowHeight(element: HTMLElement): number {
  const row = element.querySelector('[role="option"]');
  return row instanceof HTMLElement ? row.offsetHeight : 0;
}
