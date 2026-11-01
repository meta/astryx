// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useDismissSearchOnTouchDrag.ts
 * @input Caller-owned search inputs and touch events from a separate results list
 * @output Private touch handlers shared by the Lab mobile search sheets
 * @position One owner for results-drag keyboard dismissal; not a public export
 *
 * A direct vertical touch drag dismisses only a focused caller-owned search.
 * Scroll events are deliberately not observed: filtering can clamp scrollTop
 * and fire scroll while someone is typing. Small moves, taps and multi-touch
 * gestures leave focus alone. The hook acquires no external resource.
 */

import {useRef, type TouchEvent} from 'react';

const DRAG_THRESHOLD_PX = 8;

type SearchInput = HTMLInputElement | null | undefined;

export function useDismissSearchOnTouchDrag(
  getSearchInputs: () => readonly SearchInput[],
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
      focusedSearch?.blur();
    },
    onTouchEnd: reset,
    onTouchCancel: reset,
  };
}
