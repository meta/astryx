// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useScrollSettle.ts
 * @input A scroll container ref, a settle callback, and optionally whether a
 *   mouse drag holds it (usePointerDragScroll's `isDraggingRef`) and the
 *   caller's steer (useScrollSteer)
 * @output Calls back once, after scrolling (including momentum) stops;
 *   useScrollSteer, which tracks the caller's own scroll toward a row
 * @position Internal behavior hook; consumed by Wheel.tsx and MonthScroller.tsx
 *
 * A snap scroller commits its value when it comes to rest, so it needs a
 * "scrolling stopped" signal. `scrollend` is that signal, but it is recent
 * enough that mobile Safari below 26 does not have it — and it is exactly the
 * browser this component targets. So: listen for `scrollend` where it exists,
 * and fall back to a quiet-period timer everywhere else. The same
 * belt-and-braces pattern is in core's `useScrollSpy`.
 *
 * ## The two things the timer must not mistake for rest
 *
 * A quiet period is a guess, and on iOS it guesses wrong twice unless it is
 * told otherwise. Both mistakes were behind the same bug: opening the
 * month/year wheels, flicking to an earlier month, and watching the month
 * climb on its own afterwards — on real iOS and the simulator, never in
 * Chrome.
 *
 * 1. **A finger resting mid-drag is not rest.** Hold a wheel still for a
 *    moment without lifting and the scroll events stop, so the timer fires
 *    and the value commits to whatever is under the band. Chrome hides this
 *    because it has `scrollend`, which does not fire until the touch is
 *    released. A mouse drag (usePointerDragScroll) is held the same way, and
 *    there Chrome gives no cover at all: each `scrollTop` the drag assigns
 *    ends in its own `scrollend`, so the settle waits for the drag's
 *    `pointerup` as it waits for `touchend`.
 *
 * 2. **Momentum is not rest either.** iOS momentum runs on the UI thread and
 *    keeps going for a second or more after the finger is gone, and its scroll
 *    events arrive irregularly — the gaps in the slow tail routinely exceed
 *    any sane quiet period. Chrome's compositor-driven momentum fires evenly,
 *    so the same timer never trips there.
 *
 * A premature settle is not just a wrong value; it feeds back. The commit
 * moves the value, the value moves the scroller back onto the committed row,
 * that programmatic scroll does not stop the momentum still running
 * underneath, and the fresh scroll events start the next premature settle —
 * each one landing a row further along, which is why the month climbed.
 *
 * So: the settle waits for the touch or the mouse drag to end, and then for a quiet period
 * measured from the LAST scroll event, which is what makes it outlast
 * momentum however long it runs. {@link useScrollSettle} also reports whether
 * the scroller is at rest, so a caller can refuse to reposition one that is
 * still moving.
 *
 * A person's input on the scroller ends the caller's steer (useScrollSteer).
 *
 * SYNC: When modified, update DateInputTouch.test.tsx.
 */

import {useEffect, useMemo, useRef} from 'react';

/**
 * How long the scroller must be quiet before a settle is assumed. Long enough
 * to outlast the browser's own snap animation (~150-300ms after the finger
 * lifts), or a wheel would commit to whichever option it was passing rather
 * than the one it settles on.
 */
export const SCROLL_QUIET_MS = 220;

/**
 * The caller's own scroll toward a row it names (a `scrollTo` it makes), so
 * its settle can finish that scroll rather than round it back. The steer ends
 * when the scroll arrives, by the caller's measure, when a person's input
 * reaches the scroller, or when the settle detaches ({@link useScrollSettle}).
 */
export interface ScrollSteer {
  /** Records the row the caller's own scroll heads for. */
  start: (row: number) => void;
  /** The row of the caller's scroll still under way, or null. */
  current: () => number | null;
  /** Ends the steer. */
  end: () => void;
}

/**
 * One steer for one scroller: pass it to {@link useScrollSettle}, start it
 * before each `scrollTo` the caller makes, and read it in the settle.
 *
 * @example
 * ```
 * const steer = useScrollSteer();
 * useScrollSettle(ref, element => finishOrRound(element, steer.current()), true, undefined, steer);
 * ```
 */
export function useScrollSteer(): ScrollSteer {
  const rowRef = useRef<number | null>(null);
  return useMemo(
    () => ({
      start: row => {
        rowRef.current = row;
      },
      current: () => rowRef.current,
      end: () => {
        rowRef.current = null;
      },
    }),
    [],
  );
}

/** What {@link useScrollSettle} reports back about the scroller's state. */
export type ScrollSettleState = {
  /**
   * False from the first touch until the scroller has genuinely stopped —
   * momentum included. Read it before repositioning the scroller: doing that
   * mid-flight fights the platform and, on iOS, restarts the cycle described
   * in the file header.
   */
  isAtRestRef: React.RefObject<boolean>;
};

/**
 * Run `onSettle` when `ref`'s element stops scrolling.
 *
 * @param ref - the scroll container
 * @param onSettle - called with the settled element; may change every render
 * @param isEnabled - skip attaching while false (e.g. a hidden panel)
 * @param isHeldRef - true while a mouse drag holds the scroller
 *   (usePointerDragScroll's `isDraggingRef`): not rest, however quiet
 * @param steer - the caller's own scroll (useScrollSteer). A finger, a wheel
 *   or trackpad, a press or a key on the scroller ends it: from there the
 *   scroll is the person's. Detaching ends it too.
 */
export function useScrollSettle(
  ref: React.RefObject<HTMLElement | null>,
  onSettle: (element: HTMLElement) => void,
  isEnabled: boolean = true,
  isHeldRef?: React.RefObject<boolean>,
  steer?: ScrollSteer,
): ScrollSettleState {
  // The callback closes over render-fresh values (the option list, the current
  // value); keeping it in a ref means the listeners attach once instead of
  // re-attaching mid-scroll, which would drop an in-flight settle.
  const onSettleRef = useRef(onSettle);
  onSettleRef.current = onSettle;

  const isAtRestRef = useRef(true);

  // Syncs scroll, touch, pointer and key listeners with `isEnabled`. They find
  // when scrolling stops, and end the caller's steer on a person's input.
  useEffect(() => {
    const element = ref.current;
    if (element == null || !isEnabled) {
      isAtRestRef.current = true;
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let hasSettled = false;
    let isTouching = false;
    // Whether a mouse drag held this gesture, so its release re-arms the
    // settle; a plain click does not.
    let wasHeld = false;

    const settle = () => {
      // A finger still on the glass, or a mouse button still holding a drag,
      // is not rest, however quiet the scroller has gone. The release re-arms
      // this.
      if (isHeldRef?.current) {
        wasHeld = true;
      }
      if (hasSettled || isTouching || isHeldRef?.current) {
        return;
      }
      hasSettled = true;
      isAtRestRef.current = true;
      clearTimeout(timer);
      onSettleRef.current(element);
    };

    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(settle, SCROLL_QUIET_MS);
    };

    const onScroll = () => {
      // A fresh scroll re-opens the window: whatever we settle on now is
      // stale, and the settle that matters is the one after this gesture.
      // Momentum keeps arriving here, so the quiet period is measured from
      // the last of it however long it runs.
      hasSettled = false;
      isAtRestRef.current = false;
      if (isHeldRef?.current) {
        wasHeld = true;
      }
      arm();
    };

    const onTouchStart = () => {
      isTouching = true;
      hasSettled = false;
      isAtRestRef.current = false;
      clearTimeout(timer);
    };

    const onTouchEnd = () => {
      isTouching = false;
      // Momentum may carry on from here and will re-arm this on its own; the
      // timer covers the case where the finger lifted without a fling, which
      // produces no further scroll events at all.
      arm();
    };

    const endSteer = () => {
      steer?.end();
    };

    const onPointerEnd = () => {
      // The drag's release: its glide to the nearest row re-arms this on its
      // own, and the timer covers a release already on a row, which scrolls
      // no further.
      if (wasHeld) {
        wasHeld = false;
        arm();
      }
    };

    element.addEventListener('scroll', onScroll, {passive: true});
    element.addEventListener('scrollend', settle);
    element.addEventListener('touchstart', onTouchStart, {passive: true});
    element.addEventListener('touchend', onTouchEnd, {passive: true});
    element.addEventListener('touchcancel', onTouchEnd, {passive: true});
    element.addEventListener('pointerup', onPointerEnd);
    element.addEventListener('pointercancel', onPointerEnd);
    element.addEventListener('touchstart', endSteer, {passive: true});
    element.addEventListener('wheel', endSteer, {passive: true});
    element.addEventListener('pointerdown', endSteer, {passive: true});
    element.addEventListener('keydown', endSteer, {passive: true});

    return () => {
      clearTimeout(timer);
      // A steer whose scroll never came to rest ends here too. Shown again,
      // the scroller is parked afresh, not pulled back to an old row.
      steer?.end();
      element.removeEventListener('scroll', onScroll);
      element.removeEventListener('scrollend', settle);
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchend', onTouchEnd);
      element.removeEventListener('touchcancel', onTouchEnd);
      element.removeEventListener('pointerup', onPointerEnd);
      element.removeEventListener('pointercancel', onPointerEnd);
      element.removeEventListener('touchstart', endSteer);
      element.removeEventListener('wheel', endSteer);
      element.removeEventListener('pointerdown', endSteer);
      element.removeEventListener('keydown', endSteer);
    };
  }, [ref, isEnabled, isHeldRef, steer]);

  return {isAtRestRef};
}
