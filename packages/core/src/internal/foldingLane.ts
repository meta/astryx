// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file foldingLane.ts
 * @input A Toolbar lane element, and the extra width content in it asks for
 * @output FoldingLaneContext, which a Toolbar start or end lane provides, and
 *   useFoldingLaneWant, which foldable content calls to learn whether it is a
 *   direct child of a lane and to ask that lane for the width that shows all
 *   of it
 * @position Internal to Core: Toolbar provides it; OverflowList and TabList
 *   report through it. Not exported from the package.
 */

import {createContext, use, useEffect, useId, type RefObject} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';

/** What a Toolbar lane gives the foldable content inside it. */
export interface FoldingLane {
  /**
   * The lane element, once mounted; only its direct children ask for width.
   * State, not a ref: a child's layout effect runs before its parent's ref
   * is set, so the child reads it again when it arrives.
   */
  laneElement: HTMLElement | null;
  /**
   * Records whether `id` is a direct child of the lane and, if it is, how
   * much wider than its minimum it would like to be.
   */
  report: (id: string, want: number, isLaneChild: boolean) => void;
  /** The ids that reported as direct children of the lane. */
  laneChildIds: ReadonlySet<string>;
}

/** @internal Provided by each Toolbar start and end lane. */
export const FoldingLaneContext = createContext<FoldingLane | null>(null);
FoldingLaneContext.displayName = 'FoldingLaneContext';

/**
 * Whether the element is a direct child of a Toolbar start or end lane, and,
 * while it is and `enabled` is true, asks that lane for `want` more pixels
 * than the content's minimum, so the lane grows toward the width that shows
 * all of it. Content inside a caller's wrapper is not a direct child: the
 * wrapper would not pass the width on, so it sizes as it does outside a lane.
 * The lane holds the answer, so the content re-renders when it changes.
 */
export function useFoldingLaneWant(
  elementRef: RefObject<HTMLElement | null>,
  want: number,
  enabled: boolean,
): boolean {
  const lane = use(FoldingLaneContext);
  const id = useId();
  const report = lane?.report;
  const laneElement = lane?.laneElement ?? null;
  // Measurement sets `want` from a layout effect, so the lane hears it in the
  // same frame, before paint.
  useIsomorphicLayoutEffect(() => {
    if (report == null || laneElement == null) {
      return;
    }
    const element = elementRef.current;
    const isLaneChild =
      enabled && element != null && element.parentElement === laneElement;
    report(id, isLaneChild ? Math.max(0, want) : 0, isLaneChild);
  }, [report, laneElement, id, want, enabled, elementRef]);
  useEffect(() => {
    if (report == null) {
      return;
    }
    return () => report(id, 0, false);
  }, [report, id]);
  return lane?.laneChildIds.has(id) ?? false;
}
