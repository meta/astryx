// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useDismissSearchOnTouchDrag.ts
 * @input Caller-owned search inputs, a focus target, and touch events from a
 *   separate results list
 * @output useDismissSearchOnTouchDrag — touch handlers for the results list
 * @position Core-internal, shared by the touch sheets; not a public export
 *
 * A direct vertical touch drag on the results moves focus off a focused
 * search input. The on-screen keyboard then leaves and the rows come into
 * view; the query stays. Focus goes to the caller's target (the sheet's
 * panel), never to the page body behind an open modal. Scroll events are not
 * observed: filtering can clamp scrollTop and fire scroll while someone is
 * typing. Small moves, taps and multi-touch gestures leave focus alone.
 */

import {useRef, type TouchEvent} from 'react';

const DRAG_THRESHOLD_PX = 8;

type SearchInput = HTMLInputElement | null | undefined;

export function useDismissSearchOnTouchDrag(
  getSearchInputs: () => ReadonlyArray<SearchInput>,
  getFocusTarget?: () => HTMLElement | null | undefined,
) {
  const startYRef = useRef<number | null>(null);
  const reset = () => {
    startYRef.current = null;
  };

  return {
    onTouchStart: (event: TouchEvent<HTMLElement>) => {
      startYRef.current =
        event.touches.length === 1 ? event.touches[0].clientY : null;
    },
    onTouchMove: (event: TouchEvent<HTMLElement>) => {
      if (event.touches.length !== 1) {
        reset();
        return;
      }
      const startY = startYRef.current;
      if (
        startY == null ||
        Math.abs(event.touches[0].clientY - startY) < DRAG_THRESHOLD_PX
      ) {
        return;
      }
      reset();
      const focusedSearch = getSearchInputs().find(
        input => input != null && input === document.activeElement,
      );
      if (focusedSearch == null) {
        return;
      }
      const target = getFocusTarget?.();
      if (target != null) {
        target.focus({preventScroll: true});
      } else {
        focusedSearch.blur();
      }
    },
    onTouchEnd: reset,
    onTouchCancel: reset,
  };
}
