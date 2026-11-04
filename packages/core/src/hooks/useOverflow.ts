// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useOverflow.ts
 * @input Uses React useState, useCallback, useRef; react-dom flushSync;
 *   useIsomorphicLayoutEffect
 * @output Exports useOverflow hook for measuring and managing horizontal overflow
 * @position Core hook; used by OverflowList and consumers for overflow patterns.
 *   Hidden copies of the children are measured, so nothing flickers. The
 *   fit, clamp and row math lives in the pure `computeOverflow` helper.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts
 * - /packages/core/src/hooks/computeOverflow.ts (the pure computation)
 */

import {useState, useCallback, useRef} from 'react';
import {flushSync} from 'react-dom';
import {useIsomorphicLayoutEffect} from './useIsomorphicLayoutEffect';
import {observeResize} from '../utils/sharedResizeObserver';
import {computeOverflow} from './computeOverflow';
import {useDevWarning} from './useDevWarning';

export interface UseOverflowOptions {
  /**
   * Gap between items in pixels. Used in width calculations.
   * @default 0
   */
  gap?: number;

  /**
   * Minimum number of items to always show, even if they don't fit.
   * @default 0
   */
  minVisibleItems?: number;

  /**
   * Maximum number of items to ever show, even if they all fit. The ceiling
   * partner to `minVisibleItems`. `undefined` means no cap. When it is less
   * than `minVisibleItems`, the floor wins and a dev-only warning is emitted.
   * @default undefined
   */
  maxVisibleItems?: number;

  /**
   * Wrap items across up to this many rows before collapsing the rest into the
   * overflow indicator. `undefined` (or `1`) keeps the single-line behavior.
   * A number, not a boolean: unbounded wrapping is a plain flex-wrap layout,
   * not overflow collapse. Assumes uniform row height.
   * @default undefined
   */
  maxRows?: number;

  /**
   * Which end to collapse items from.
   * @default 'end'
   */
  collapseFrom?: 'start' | 'end';

  /**
   * Which element to observe for overflow calculations.
   * - `'observeSelf'`: uses the container's own width (default)
   * - `'observeParent'`: observes the container's parent element for
   *   resize and uses the parent's content width. This allows the
   *   visible container to remain content-sized while still detecting
   *   available space for grow-back. Siblings that don't fit alongside
   *   the items can wrap and be clipped by the parent's overflow.
   * @default 'observeSelf'
   */
  behavior?: 'observeParent' | 'observeSelf';
}

export interface UseOverflowReturn {
  /** Ref to attach to the visible container element */
  containerRef: React.RefCallback<HTMLElement>;
  /** Ref to attach to the hidden measurement container */
  measureRef: React.RefCallback<HTMLElement>;
  /** Number of items that fit in the visible container */
  visibleCount: number;
  /** Whether any items are overflowing */
  hasOverflow: boolean;
  /** Number of rows the visible items occupy (1 for the single-line path) */
  rows: number;
  /** Measured max item height in pixels; used to size the multi-row container */
  rowHeight: number;
}

// Measurements that the resize observer reported in the current frame.
const pendingMeasures = new Set<() => void>();

/**
 * Measures again for a resize the observer reported.
 *
 * The observer reports after layout and before paint. A state update made
 * there renders in a later task, after the frame paints, so one frame shows
 * the old visible set at the new width. A microtask still runs before paint:
 * it measures every list that this delivery reported, then applies all the
 * results in one synchronous render.
 */
function measureBeforePaint(measure: () => void): void {
  if (pendingMeasures.size === 0) {
    queueMicrotask(() => {
      const measures = [...pendingMeasures];
      pendingMeasures.clear();
      // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- the new visible set must render before the frame that reported the resize paints
      flushSync(() => {
        for (const run of measures) {
          run();
        }
      });
    });
  }
  pendingMeasures.add(measure);
}

/**
 * Observes `element` and measures again on each reported resize. The
 * registration measurement runs at once: it happens while React commits the
 * ref, which is before paint already.
 */
function observeForOverflow(element: Element, measure: () => void): () => void {
  let isRegistering = true;
  const unobserve = observeResize(element, () => {
    if (isRegistering) {
      measure();
    } else {
      measureBeforePaint(measure);
    }
  });
  isRegistering = false;
  return unobserve;
}

/**
 * Hook for managing horizontal overflow of a list of items.
 *
 * Renders all items into a hidden measurement container, then calculates
 * how many fit in the visible container's width. Uses ResizeObserver to
 * recalculate when the container resizes.
 *
 * The measurement container should contain all items followed by the
 * overflow indicator element (if any). The indicator is identified by
 * a `data-overflow-indicator` attribute.
 *
 * @example
 * ```
 * const { containerRef, measureRef, visibleCount, hasOverflow } = useOverflow(5, {
 *   gap: 8,
 * });
 * ```
 */
export function useOverflow(
  itemCount: number,
  options: UseOverflowOptions = {},
): UseOverflowReturn {
  const {
    gap = 0,
    minVisibleItems = 0,
    maxVisibleItems,
    maxRows,
    collapseFrom = 'end',
    behavior = 'observeSelf',
  } = options;

  useDevWarning(
    'useOverflow',
    `maxVisibleItems (${maxVisibleItems}) is less than ` +
      `minVisibleItems (${minVisibleItems}); the floor wins and ` +
      `minVisibleItems items will be shown.`,
    maxVisibleItems != null && maxVisibleItems < minVisibleItems,
  );

  const observeParent = behavior === 'observeParent';

  const [visibleCount, setVisibleCount] = useState(itemCount);
  const [rows, setRows] = useState(1);
  const [rowHeight, setRowHeight] = useState(0);
  // The values last written to state. A measurement that matches them writes
  // nothing, so a resize that changes nothing renders nothing.
  const appliedRef = useRef({visibleCount: itemCount, rows: 1, rowHeight: 0});
  const containerElRef = useRef<HTMLElement | null>(null);
  const measureElRef = useRef<HTMLElement | null>(null);
  const observedElRef = useRef<HTMLElement | null>(null);
  const observedMeasureElRef = useRef<HTMLElement | null>(null);
  const unobserveContainerRef = useRef<(() => void) | null>(null);
  const unobserveMeasureRef = useRef<(() => void) | null>(null);

  const apply = useCallback(
    (nextVisible: number, nextRows: number, nextRowHeight: number) => {
      const applied = appliedRef.current;
      if (applied.visibleCount !== nextVisible) {
        applied.visibleCount = nextVisible;
        setVisibleCount(nextVisible);
      }
      if (applied.rows !== nextRows) {
        applied.rows = nextRows;
        setRows(nextRows);
      }
      if (applied.rowHeight !== nextRowHeight) {
        applied.rowHeight = nextRowHeight;
        setRowHeight(nextRowHeight);
      }
    },
    [],
  );

  const calculate = useCallback(() => {
    const container = containerElRef.current;
    const measure = measureElRef.current;
    if (!container || !measure) {
      return;
    }

    let availableWidth: number;

    if (observeParent && container.parentElement) {
      const parent = container.parentElement;
      const parentStyle = getComputedStyle(parent);
      availableWidth =
        parent.clientWidth -
        parseFloat(parentStyle.paddingLeft) -
        parseFloat(parentStyle.paddingRight);
    } else {
      availableWidth = container.offsetWidth;
    }

    const allChildren = Array.from(measure.children) as HTMLElement[];

    // The measurement container holds itemCount items, plus optionally
    // an overflow indicator as the last child.
    const hasIndicator = allChildren.length > itemCount;
    const children = hasIndicator
      ? allChildren.slice(0, itemCount)
      : allChildren;
    const indicatorWidth = hasIndicator
      ? allChildren[allChildren.length - 1].offsetWidth
      : 0;

    if (children.length === 0) {
      apply(0, 0, appliedRef.current.rowHeight);
      return;
    }

    const widths = children.map(child => child.offsetWidth);
    const measuredRowHeight = children.reduce(
      (max, child) => Math.max(max, child.offsetHeight || 0),
      0,
    );

    const {visibleCount: nextVisible, rows: nextRows} = computeOverflow({
      widths,
      gap,
      availableWidth,
      indicatorWidth,
      minVisibleItems,
      maxVisibleItems,
      maxRows,
      collapseFrom,
    });

    apply(nextVisible, nextRows, measuredRowHeight);
  }, [
    itemCount,
    gap,
    minVisibleItems,
    maxVisibleItems,
    maxRows,
    collapseFrom,
    observeParent,
    apply,
  ]);

  const containerRef = useCallback(
    (el: HTMLElement | null) => {
      containerElRef.current = el;

      // Clean up previous observation
      unobserveContainerRef.current?.();
      unobserveContainerRef.current = null;
      observedElRef.current = null;

      if (el) {
        const target =
          observeParent && el.parentElement ? el.parentElement : el;
        unobserveContainerRef.current = observeForOverflow(target, calculate);
        observedElRef.current = target;
      }
    },
    [calculate, observeParent],
  );

  const measureRef = useCallback(
    (el: HTMLElement | null) => {
      unobserveMeasureRef.current?.();
      unobserveMeasureRef.current = null;
      observedMeasureElRef.current = null;

      measureElRef.current = el;
      if (!el) {
        return;
      }

      unobserveMeasureRef.current = observeForOverflow(el, calculate);
      observedMeasureElRef.current = el;
    },
    [calculate],
  );

  // Syncs the visible count with the rendered layout. It measures again after
  // the items change.
  useIsomorphicLayoutEffect(() => {
    calculate();
  }, [calculate]);

  const hasOverflow = visibleCount < itemCount;

  return {
    containerRef,
    measureRef,
    visibleCount,
    hasOverflow,
    rows,
    rowHeight,
  };
}
