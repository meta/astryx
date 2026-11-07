// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useOverflow.ts
 * @input Uses React useState, useCallback, useRef; react-dom flushSync;
 *   useIsomorphicLayoutEffect; queueMicrotask
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
import {computeOverflow, countRows} from './computeOverflow';
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

/**
 * Why a list measures:
 * - `'commit'`: a React commit mounted or changed it. Its result applies with
 *   the others.
 * - `'resize'`: the resize observer reported it. A result that can change an
 *   observed size returns its update, to apply after the frame paints.
 */
type MeasureReason = 'commit' | 'resize';

type Measure = (reason: MeasureReason) => (() => void) | undefined;

// The lists to measure in the next microtask, and why. A commit wins over a
// resize, because a commit applies every result.
const pendingMeasures = new Map<Measure, MeasureReason>();

/**
 * Measures every pending list in one microtask, then renders every result in
 * one pass.
 *
 * A commit and the resize observer both run after layout and before paint. A
 * microtask still runs before paint. All lists read their sizes before any
 * result renders, so the page lays out once for all of them, not once per
 * list. An update that a resize measurement returns renders in a later task,
 * after paint.
 */
function scheduleMeasure(measure: Measure, reason: MeasureReason): void {
  if (pendingMeasures.size === 0) {
    queueMicrotask(measurePending);
  }
  if (pendingMeasures.get(measure) !== 'commit') {
    pendingMeasures.set(measure, reason);
  }
}

function measurePending(): void {
  const measures = [...pendingMeasures];
  pendingMeasures.clear();
  const afterPaint: (() => void)[] = [];
  // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- the measured set must render before the frame paints
  flushSync(() => {
    for (const [run, reason] of measures) {
      const deferred = run(reason);
      if (deferred) {
        afterPaint.push(deferred);
      }
    }
  });
  for (const update of afterPaint) {
    update();
  }
}

/**
 * The observer calls back once while it registers. That call runs while
 * React commits the ref, so it counts as a commit.
 */
function observeForOverflow(element: Element, measure: Measure): () => void {
  let isRegistering = true;
  const unobserve = observeResize(element, () => {
    scheduleMeasure(measure, isRegistering ? 'commit' : 'resize');
  });
  isRegistering = false;
  return unobserve;
}

/** A visible set as the list renders it, sized from the measure copy. */
interface RenderedSet {
  widths: number[];
  heights: number[];
  /** The measured indicator, when the set collapses items. */
  indicator: {width: number; height: number} | null;
  indicatorFirst: boolean;
}

/**
 * The rows a set fills at `availableWidth`, up to `maxRows`, or `null` when
 * they are not known. The measured indicator holds every item, so the
 * rendered one can be narrower. When the rows with and without it differ,
 * the rows are not known.
 */
function rowsFilled(
  set: RenderedSet,
  gap: number,
  availableWidth: number,
  maxRows: number,
): number | null {
  const rowsWithout = Math.min(
    countRows(set.widths, gap, availableWidth),
    maxRows,
  );
  if (!set.indicator) {
    return rowsWithout;
  }
  const widths = set.indicatorFirst
    ? [set.indicator.width, ...set.widths]
    : [...set.widths, set.indicator.width];
  const rowsWith = Math.min(countRows(widths, gap, availableWidth), maxRows);
  return rowsWith === rowsWithout ? rowsWith : null;
}

/**
 * The list's height follows its tallest child and, in a multi-row list, the
 * rows it fills.
 */
function canChangeListHeight(
  now: RenderedSet,
  next: RenderedSet,
  gap: number,
  availableWidth: number,
  maxRows: number,
): boolean {
  const tallest = (set: RenderedSet) =>
    Math.max(0, ...set.heights, set.indicator?.height ?? 0);
  if (tallest(now) !== tallest(next)) {
    return true;
  }
  if (maxRows <= 1) {
    return false;
  }
  const rowsNow = rowsFilled(now, gap, availableWidth, maxRows);
  const rowsNext = rowsFilled(next, gap, availableWidth, maxRows);
  return rowsNow === null || rowsNext === null || rowsNow !== rowsNext;
}

/**
 * Whether the observed element's size follows the list's items: a list in a
 * flex item sized from its content, a shrink-to-fit box, or such an ancestor.
 * A fold then changes an observed size, so it cannot render inside the
 * observer step. Size containment drops the items' contribution to the
 * list's inline size, so a size that moves under it follows the items. The
 * probe reverts at once, before any observer or the frame can see it.
 */
function observedSizeFollowsItems(
  list: HTMLElement,
  observed: HTMLElement,
): boolean {
  const style = list.style as CSSStyleDeclaration | undefined;
  if (style == null || typeof style.setProperty !== 'function') {
    return false;
  }
  const hadStyleAttribute = list.hasAttribute('style');
  const value = style.getPropertyValue('contain');
  const priority = style.getPropertyPriority('contain');
  const width = observed.offsetWidth;
  const height = observed.offsetHeight;
  style.setProperty('contain', 'inline-size', 'important');
  const follows =
    observed.offsetWidth !== width || observed.offsetHeight !== height;
  if (value !== '') {
    style.setProperty('contain', value, priority);
  } else if (hadStyleAttribute) {
    style.removeProperty('contain');
  } else {
    style.removeProperty('contain');
    // Chromium writes the inline style back to the attribute lazily. Reading
    // the attribute first stops the removal from leaving `style=""`.
    void list.getAttribute('style');
    list.removeAttribute('style');
  }
  // Lay out again now. A later observer in this delivery reads the current
  // layout without updating it, so it would get the contained size.
  void observed.offsetWidth;
  return follows;
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
 * After a commit that mounts or changes the container, the results land one
 * microtask later, before the frame paints. Every list in that commit
 * measures first, then one render applies all results. A test that asserts
 * right after a synchronous render awaits that microtask first, for example
 * with `await act(async () => {})`.
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
  const {remeasure: _remeasure, ...result} = useOverflowInternal(
    itemCount,
    options,
    {tracksRows: true},
  );
  return result;
}

/**
 * `useOverflow` for a host inside Core that states whether it renders from
 * `rows` and `rowHeight`. With `tracksRows` false, the hook does not track
 * them and reports `rows: 1` and `rowHeight: 0`. A state write that nobody
 * reads still re-renders the host. Internal: the public hook always tracks
 * them. `onMeasure` runs after each measurement, in the same render as its
 * result, so a host can mark what that measurement covered. `remeasure`
 * measures again with the lists of the current commit, for a change that
 * resizes nothing.
 */
export function useOverflowInternal(
  itemCount: number,
  options: UseOverflowOptions,
  {tracksRows, onMeasure}: {tracksRows: boolean; onMeasure?: () => void},
): UseOverflowReturn & {remeasure: () => void} {
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
      // A host that does not track rows renders from neither value, so they
      // are not written.
      if (!tracksRows) {
        return;
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
    [tracksRows],
  );

  const calculate: Measure = useCallback(
    reason => {
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

      // Folding to a new list height inside the resize step makes Chromium
      // report a loop error. That update renders after paint. The measure copy
      // sizes both sets, a plain-text indicator included.
      if (reason === 'resize') {
        const indicator = hasIndicator
          ? allChildren[allChildren.length - 1]
          : null;
        const renderedSet = (count: number): RenderedSet => {
          const shown =
            collapseFrom === 'end'
              ? children.slice(0, count)
              : children.slice(children.length - count);
          return {
            widths: shown.map(child => child.offsetWidth),
            heights: shown.map(child => child.offsetHeight || 0),
            indicator:
              indicator && count < itemCount
                ? {width: indicatorWidth, height: indicator.offsetHeight || 0}
                : null,
            indicatorFirst: collapseFrom === 'start',
          };
        };
        // Under observeParent the list fills its parent's width only while
        // items are collapsed. A fold that shows or hides the indicator
        // changes that width, which can change the observed parent's height
        // when a sibling wraps.
        const changesParentFill =
          observeParent &&
          appliedRef.current.visibleCount < itemCount !==
            nextVisible < itemCount;
        // A multi-row list's max height follows the measured row height.
        const changesRowHeight =
          (maxRows ?? 1) > 1 &&
          measuredRowHeight !== appliedRef.current.rowHeight;
        const observed =
          observeParent && container.parentElement
            ? container.parentElement
            : container;
        if (
          changesParentFill ||
          changesRowHeight ||
          (nextVisible !== appliedRef.current.visibleCount &&
            observedSizeFollowsItems(container, observed)) ||
          canChangeListHeight(
            renderedSet(appliedRef.current.visibleCount),
            renderedSet(nextVisible),
            gap,
            availableWidth,
            maxRows ?? 1,
          )
        ) {
          return () => apply(nextVisible, nextRows, measuredRowHeight);
        }
      }
      apply(nextVisible, nextRows, measuredRowHeight);
      return undefined;
    },
    [
      itemCount,
      gap,
      minVisibleItems,
      maxVisibleItems,
      maxRows,
      collapseFrom,
      observeParent,
      apply,
    ],
  );

  // The latest measurement, under one identity. A list stays pending once,
  // and a pending measurement never runs with an earlier render's options.
  const calculateRef = useRef(calculate);
  const onMeasureRef = useRef(onMeasure);
  const measureLatest: Measure = useCallback(reason => {
    const deferred = calculateRef.current(reason);
    onMeasureRef.current?.();
    return deferred;
  }, []);

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
        unobserveContainerRef.current = observeForOverflow(
          target,
          measureLatest,
        );
        observedElRef.current = target;
      }
    },
    [measureLatest, observeParent],
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

      unobserveMeasureRef.current = observeForOverflow(el, measureLatest);
      observedMeasureElRef.current = el;
    },
    [measureLatest],
  );

  // Syncs the visible count with the rendered layout. It measures again after
  // the items change, with the other lists in this commit.
  useIsomorphicLayoutEffect(() => {
    calculateRef.current = calculate;
    scheduleMeasure(measureLatest, 'commit');
  }, [calculate, measureLatest]);

  // The host passes a new `onMeasure` each render. The latest one runs.
  useIsomorphicLayoutEffect(() => {
    onMeasureRef.current = onMeasure;
  });

  const remeasure = useCallback(
    () => scheduleMeasure(measureLatest, 'commit'),
    [measureLatest],
  );

  const hasOverflow = visibleCount < itemCount;

  return {
    containerRef,
    measureRef,
    visibleCount,
    hasOverflow,
    // A host that stops tracking keeps state from earlier measurements, so
    // the return uses the fixed values.
    rows: tracksRows ? rows : 1,
    rowHeight: tracksRows ? rowHeight : 0,
    remeasure,
  };
}
