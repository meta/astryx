// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useOverflow.ts
 * @input Uses React useState, useCallback, useRef; useIsomorphicLayoutEffect
 * @output Exports useOverflow hook for measuring and managing horizontal overflow
 * @position Core hook; used by OverflowList and consumers for overflow patterns
 *
 * Measures children rendered in a hidden container to determine how many fit
 * in the available width, without flickering. Observes both the visible and
 * hidden measurement containers so changes to available width or measured child
 * sizes recalculate the result. Supports an optional item cap (`maxVisibleItems`)
 * and bounded multi-row wrapping (`maxRows`); the fit/clamp/row-packing math
 * lives in the pure `computeOverflow` helper.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts
 * - /packages/core/src/hooks/computeOverflow.ts (the pure computation)
 */

import {useState, useCallback, useRef} from 'react';
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
  /**
   * Number of rows the visible items occupy. Measured on the multi-row path
   * (`maxRows` above 1); the single-line path reports 1 without measuring.
   */
  rows: number;
  /**
   * Measured max item height in pixels; used to size the multi-row container.
   * Measured on the multi-row path (`maxRows` above 1); the single-line path
   * reports 0 without measuring, so a change of item height there never
   * re-renders the host.
   */
  rowHeight: number;
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
  // Only the multi-row path renders from `rows` and `rowHeight` (the row
  // count caps the container's height). On the single-line path neither is
  // tracked: a state set nobody reads would still re-render the host, once
  // per measurement that moves it.
  const tracksRows = maxRows != null && maxRows > 1;

  const [visibleCount, setVisibleCount] = useState(itemCount);
  const [rows, setRows] = useState(1);
  const [rowHeight, setRowHeight] = useState(0);
  const containerElRef = useRef<HTMLElement | null>(null);
  const measureElRef = useRef<HTMLElement | null>(null);
  const observedElRef = useRef<HTMLElement | null>(null);
  const observedMeasureElRef = useRef<HTMLElement | null>(null);
  const unobserveContainerRef = useRef<(() => void) | null>(null);
  const unobserveMeasureRef = useRef<(() => void) | null>(null);

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
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- overflow count is derived from measured DOM widths
      setVisibleCount(0);
      if (tracksRows) {
        // eslint-disable-next-line @eslint-react/set-state-in-effect -- derived from measured DOM
        setRows(0);
      }
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

    // eslint-disable-next-line @eslint-react/set-state-in-effect -- overflow count is derived from measured DOM widths
    setVisibleCount(nextVisible);
    if (!tracksRows) {
      return;
    }
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- derived from measured DOM
    setRows(prev => (prev === nextRows ? prev : nextRows));
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- derived from measured DOM
    setRowHeight(prev =>
      prev === measuredRowHeight ? prev : measuredRowHeight,
    );
  }, [
    itemCount,
    gap,
    minVisibleItems,
    maxVisibleItems,
    maxRows,
    tracksRows,
    collapseFrom,
    observeParent,
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
        unobserveContainerRef.current = observeResize(target, () => {
          calculate();
        });
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

      unobserveMeasureRef.current = observeResize(el, () => {
        calculate();
      });
      observedMeasureElRef.current = el;
    },
    [calculate],
  );

  // Recalculate when itemCount changes
  useIsomorphicLayoutEffect(() => {
    calculate();
  }, [calculate]);

  const hasOverflow = visibleCount < itemCount;

  return {
    containerRef,
    measureRef,
    visibleCount,
    hasOverflow,
    // A host whose `maxRows` dropped to the single-line path keeps the state
    // its multi-row measurements wrote; the path's own values are reported.
    rows: tracksRows ? rows : 1,
    rowHeight: tracksRows ? rowHeight : 0,
  };
}
