// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file foldingLane.ts
 * @input A Toolbar lane element, and the extra width content in it asks for
 * @output FoldingLaneContext, which a Toolbar start or end lane provides, and
 *   useFoldingLaneWant, which foldable content calls to ask its lane for the
 *   width that shows all of it
 * @position Internal to Core: Toolbar provides it; OverflowList and TabList
 *   report through it. Not exported from the package.
 */

import {createContext, use, useEffect, useId, type RefObject} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';

/** What a Toolbar lane gives the foldable content inside it. */
export interface FoldingLane {
  /** The lane element; only its direct children ask for width. */
  laneRef: RefObject<HTMLElement | null>;
  /** Records how much wider than its minimum `id` would like to be. */
  report: (id: string, want: number) => void;
}

/** @internal Provided by each Toolbar start and end lane. */
export const FoldingLaneContext = createContext<FoldingLane | null>(null);
FoldingLaneContext.displayName = 'FoldingLaneContext';

/**
 * Asks the surrounding Toolbar lane for `want` more pixels than the content's
 * minimum, so the lane grows toward the width that shows all of it. Only a
 * direct child of the lane asks: content inside a caller's wrapper keeps its
 * minimum, because the wrapper would not pass the width on.
 */
export function useFoldingLaneWant(
  elementRef: RefObject<HTMLElement | null>,
  want: number,
): void {
  const lane = use(FoldingLaneContext);
  const id = useId();
  // Measurement sets `want` from a layout effect, so the lane hears it in the
  // same frame, before paint.
  useIsomorphicLayoutEffect(() => {
    if (lane == null) {
      return;
    }
    const element = elementRef.current;
    const isLaneChild =
      element != null && element.parentElement === lane.laneRef.current;
    lane.report(id, isLaneChild ? Math.max(0, want) : 0);
  }, [lane, id, want, elementRef]);
  useEffect(() => {
    if (lane == null) {
      return;
    }
    return () => lane.report(id, 0);
  }, [lane, id]);
}
