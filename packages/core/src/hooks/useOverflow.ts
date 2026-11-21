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
import {useCommittedRef} from './useCommittedRef';
import {observeResize} from '../utils/sharedResizeObserver';
import {computeOverflow, countRows} from './computeOverflow';
import {
  layoutSize,
  screenScale,
  type ScreenScaleTolerance,
} from '../utils/hitArea';
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
 * A single-row list's inline bounds, from the measure copy. `collapsed` is
 * the list folded as far as it can fold (the minimum items and the
 * indicator), rounded up to a whole pixel. `rendered` is every item
 * unfolded, exact. `chrome` is the list's own inline padding and border. All
 * are 0 until the list measures.
 */
export interface OverflowInlineBounds {
  collapsed: number;
  rendered: number;
  /** The list's own inline padding and border. */
  chrome: number;
  /**
   * Whether the list's parent lays it out in a flex row, where its width
   * would otherwise follow its shown (folded) content.
   */
  inFlexRow: boolean;
}

const NO_INLINE_BOUNDS: OverflowInlineBounds = {
  collapsed: 0,
  rendered: 0,
  chrome: 0,
  inFlexRow: false,
};

/** Whether `parent` lays its children out in a flex row. */
function isFlexRow(parent: Element | null): boolean {
  if (parent == null) {
    return false;
  }
  const style = getComputedStyle(parent);
  return (
    (style.display === 'flex' || style.display === 'inline-flex') &&
    style.flexDirection.startsWith('row')
  );
}

/**
 * An element's sub-pixel border-box width in layout pixels; its rounded width
 * without layout. Under a scale, the width comes from the computed style: a
 * scaled rect is rounded on screen, and divided by the scale it can be a
 * layout unit short, which shrinks an item below its text. The computed
 * width keeps six significant digits, so half of its last digit is added
 * back: the sum of the widths is then never short of the items.
 */
function exactWidth(element: HTMLElement, scale: number): number {
  if (scale !== 1) {
    const layout = layoutSize(element)?.width ?? 0;
    if (layout > 0) {
      return layout + 0.5 * 10 ** (Math.floor(Math.log10(layout)) - 5);
    }
  }
  const width = element.getBoundingClientRect().width;
  return width > 0 ? width / scale : element.offsetWidth;
}

/**
 * The list counts any scale beyond the computed width's rounding (six
 * significant digits), however close to 1: the last frames of a layer
 * scaling in still shorten its measured items.
 */
const INLINE_SCALE_TOLERANCE: ScreenScaleTolerance = {pixels: 0, ratio: 6e-6};

/** The bounds of a single-row set, from sub-pixel widths. */
function inlineBoundsOf(
  widths: ReadonlyArray<number>,
  indicatorWidth: number,
  gap: number,
  minVisibleItems: number,
  collapseFrom: 'start' | 'end',
  maxVisibleItems: number | undefined,
  chrome: number,
  inFlexRow: boolean,
): OverflowInlineBounds {
  const span = (set: ReadonlyArray<number>) =>
    set.reduce((sum, width) => sum + width, 0) +
    gap * Math.max(0, set.length - 1);
  const kept = Math.min(minVisibleItems, widths.length);
  const keptWidths =
    collapseFrom === 'end'
      ? widths.slice(0, kept)
      : widths.slice(widths.length - kept);
  const folds = kept < widths.length;
  const collapsed = folds
    ? span(keptWidths) + (keptWidths.length > 0 ? gap : 0) + indicatorWidth
    : span(widths);
  // The most the list shows: the items the cap allows (the floor wins over a
  // smaller cap), and the indicator when the cap leaves items out.
  const allowed = Math.max(
    kept,
    Math.min(maxVisibleItems ?? widths.length, widths.length),
  );
  const allowedWidths =
    collapseFrom === 'end'
      ? widths.slice(0, allowed)
      : widths.slice(widths.length - allowed);
  const capped = allowed < widths.length && indicatorWidth > 0;
  const rendered =
    span(allowedWidths) +
    (capped ? (allowedWidths.length > 0 ? gap : 0) + indicatorWidth : 0);
  // Round the folded width up so the trigger never clips. Keep the unfolded
  // width exact: the list's width at it must not widen a list with room.
  return {
    collapsed: Math.ceil(collapsed),
    rendered,
    chrome,
    inFlexRow,
  };
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
 * The size of each element that a list observes, as that list last measured
 * from it. Each list keeps its own record, because lists that share an
 * observed parent do not all measure in the same commit:
 * - `'border'`: the element's border box, for the list's own box and its
 *   measure copy.
 * - `'content'`: the width of the parent's content box, for a list that
 *   observes its parent. Only that width enters the measurement.
 */
type MeasuredSize =
  | {box: 'border'; width: number; height: number}
  | {box: 'content'; width: number};

type MeasuredSizes = WeakMap<Element, MeasuredSize>;

/**
 * Records the border box of an element that a list observes, as the list
 * measures. The list reads its layout at the same time, so the layout is
 * current and the read costs no extra layout.
 */
function recordBorderBox(sizes: MeasuredSizes, element: Element | null): void {
  if (element == null || typeof element.getBoundingClientRect !== 'function') {
    return;
  }
  const {width, height} = element.getBoundingClientRect();
  sizes.set(element, {box: 'border', width, height});
}

/**
 * Whether a resize report gives the size the element had when its list last
 * measured. Then the list's measurement is still current. The browser sends
 * such a report for each element it starts to observe, after the list's first
 * measurement has rendered.
 */
function isMeasuredSize(
  sizes: MeasuredSizes,
  entry: ResizeObserverEntry,
): boolean {
  const recorded = sizes.get(entry.target);
  if (recorded == null) {
    return false;
  }
  const isSame = (a: number, b: number) => Math.abs(a - b) < 0.01;
  if (recorded.box === 'content') {
    const content = entry.contentBoxSize?.[0];
    return content != null && isSame(content.inlineSize, recorded.width);
  }
  const box = entry.borderBoxSize?.[0];
  if (box == null) {
    return false;
  }
  // The report gives logical sizes; the record gives physical ones.
  return (
    (isSame(box.inlineSize, recorded.width) &&
      isSame(box.blockSize, recorded.height)) ||
    (isSame(box.inlineSize, recorded.height) &&
      isSame(box.blockSize, recorded.width))
  );
}

/**
 * The observer calls back once while it registers. That call runs while
 * React commits the ref, so it counts as a commit. A later report of the
 * size the list measured changes nothing, so it measures nothing.
 */
function observeForOverflow(
  element: Element,
  measure: Measure,
  sizes: MeasuredSizes,
): () => void {
  let isRegistering = true;
  const unobserve = observeResize(element, entry => {
    if (!isRegistering && isMeasuredSize(sizes, entry)) {
      return;
    }
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
  const {
    remeasure: _remeasure,
    inlineBounds: _inlineBounds,
    ...result
  } = useOverflowInternal(itemCount, options, {tracksRows: true});
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
 * resizes nothing. With `gapToken`, the CSS value of the host's gap, the hook
 * ignores `gap` and reads the gap the browser renders on the measurement copy;
 * a new token measures again.
 */
export function useOverflowInternal(
  itemCount: number,
  options: UseOverflowOptions,
  {
    tracksRows,
    tracksInlineBounds = false,
    onMeasure,
    gapToken,
  }: {
    tracksRows: boolean;
    tracksInlineBounds?: boolean;
    onMeasure?: () => void;
    gapToken?: string;
  },
): UseOverflowReturn & {
  inlineBounds: OverflowInlineBounds;
  remeasure: () => void;
} {
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
  const [measuredSizes] = useState<MeasuredSizes>(() => new WeakMap());
  const [rows, setRows] = useState(1);
  const [rowHeight, setRowHeight] = useState(0);
  const [inlineBounds, setInlineBounds] =
    useState<OverflowInlineBounds>(NO_INLINE_BOUNDS);
  const appliedBoundsRef = useRef<OverflowInlineBounds>(NO_INLINE_BOUNDS);
  // The values last written to state. A measurement that matches them writes
  // nothing, so a resize that changes nothing renders nothing.
  const appliedRef = useRef({visibleCount: itemCount, rows: 1, rowHeight: 0});
  const containerElRef = useRef<HTMLElement | null>(null);
  const measureElRef = useRef<HTMLElement | null>(null);
  const observedElRef = useRef<HTMLElement | null>(null);
  const observedMeasureElRef = useRef<HTMLElement | null>(null);
  const unobserveContainerRef = useRef<(() => void) | null>(null);
  const unobserveParentRef = useRef<(() => void) | null>(null);
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
        measuredSizes.set(parent, {box: 'content', width: availableWidth});
      } else {
        availableWidth = container.offsetWidth;
        recordBorderBox(measuredSizes, container);
        if (tracksInlineBounds && container.parentElement != null) {
          recordBorderBox(measuredSizes, container.parentElement);
        }
      }
      recordBorderBox(measuredSizes, measure);
      // A spacing token follows the theme's scale and the root font size, so
      // its pixel value is known only after layout.
      const gapPx =
        gapToken != null
          ? Number.parseFloat(getComputedStyle(measure).columnGap) || 0
          : gap;

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

      let widths = children.map(child => child.offsetWidth);
      let fitIndicatorWidth = indicatorWidth;
      let chrome = 0;
      if (tracksInlineBounds) {
        const style = getComputedStyle(container);
        const px = (value: string) => parseFloat(value) || 0;
        chrome =
          px(style.paddingLeft) +
          px(style.paddingRight) +
          px(style.borderLeftWidth) +
          px(style.borderRightWidth);
      }
      // The visible list shares the measure copy's scale and, unlike the
      // zero-height copy, has a box to read it from.
      const scale = tracksInlineBounds
        ? screenScale(
            container,
            container.getBoundingClientRect(),
            INLINE_SCALE_TOLERANCE,
          ).x
        : 1;
      const exact = (element: HTMLElement) => exactWidth(element, scale);
      if (tracksInlineBounds && !observeParent) {
        // The list publishes its unfolded width as its own width. It fits
        // sub-pixel items in its sub-pixel content box, so a box at that
        // width holds every item.
        widths = children.map(exact);
        fitIndicatorWidth = hasIndicator
          ? exact(allChildren[allChildren.length - 1])
          : 0;
        // Layout snaps a published width to a fraction of a pixel; the
        // allowance keeps a box at that width holding every item.
        availableWidth = exact(container) - chrome + 0.05;
      }
      if (tracksInlineBounds) {
        const bounds = inlineBoundsOf(
          children.map(exact),
          hasIndicator ? exact(allChildren[allChildren.length - 1]) : 0,
          gapPx,
          minVisibleItems,
          collapseFrom,
          maxVisibleItems,
          chrome,
          !observeParent && isFlexRow(container.parentElement),
        );
        const applied = appliedBoundsRef.current;
        if (
          applied.collapsed !== bounds.collapsed ||
          applied.rendered !== bounds.rendered ||
          applied.chrome !== bounds.chrome ||
          applied.inFlexRow !== bounds.inFlexRow
        ) {
          appliedBoundsRef.current = bounds;
          setInlineBounds(bounds);
        }
      }
      const measuredRowHeight = children.reduce(
        (max, child) => Math.max(max, child.offsetHeight || 0),
        0,
      );

      const {visibleCount: nextVisible, rows: nextRows} = computeOverflow({
        widths,
        gap: gapPx,
        availableWidth,
        indicatorWidth: fitIndicatorWidth,
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
            gapPx,
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
      gapToken,
      minVisibleItems,
      maxVisibleItems,
      maxRows,
      collapseFrom,
      observeParent,
      apply,
      measuredSizes,
      tracksInlineBounds,
    ],
  );

  // The latest measurement, under one identity. A list stays pending once,
  // and a pending measurement never runs with an earlier render's options.
  const calculateRef = useCommittedRef(calculate);
  const onMeasureRef = useCommittedRef(onMeasure);
  const measureLatest: Measure = useCallback(
    reason => {
      const deferred = calculateRef.current(reason);
      onMeasureRef.current?.();
      return deferred;
    },
    [calculateRef, onMeasureRef],
  );

  const containerRef = useCallback(
    (el: HTMLElement | null) => {
      containerElRef.current = el;

      // Clean up previous observation
      unobserveContainerRef.current?.();
      unobserveContainerRef.current = null;
      observedElRef.current = null;
      unobserveParentRef.current?.();
      unobserveParentRef.current = null;

      if (el) {
        const target =
          observeParent && el.parentElement ? el.parentElement : el;
        unobserveContainerRef.current = observeForOverflow(
          target,
          measureLatest,
          measuredSizes,
        );
        observedElRef.current = target;
        // A parent that resizes can change how it lays the list out (a flex
        // row at one width, a block at another), and the list's published
        // width depends on that, so the list measures again.
        if (!observeParent && tracksInlineBounds && el.parentElement != null) {
          unobserveParentRef.current = observeForOverflow(
            el.parentElement,
            measureLatest,
            measuredSizes,
          );
        }
      }
    },
    [measureLatest, measuredSizes, observeParent, tracksInlineBounds],
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

      unobserveMeasureRef.current = observeForOverflow(
        el,
        measureLatest,
        measuredSizes,
      );
      observedMeasureElRef.current = el;
    },
    [measureLatest, measuredSizes],
  );

  // Syncs the visible count with the rendered layout. It measures again after
  // the items change, with the other lists in this commit.
  // A new calculation (new options or a new item count) measures again.
  useIsomorphicLayoutEffect(() => {
    scheduleMeasure(measureLatest, 'commit');
  }, [calculate, measureLatest]);

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
    inlineBounds: tracksInlineBounds ? inlineBounds : NO_INLINE_BOUNDS,
    remeasure,
  };
}
