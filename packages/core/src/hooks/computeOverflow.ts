// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file computeOverflow.ts
 * @input Plain measurements (item widths, gap, available width, indicator width, limits)
 * @output Pure overflow computation: how many items are visible and their row layout
 * @position Pure helper consumed by useOverflow; contains no DOM or React code so the
 *           fit/clamp math and the multi-row packing can be unit-tested in isolation.
 *
 * There is a single source of truth for `visibleCount`:
 *   visibleCount = clamp(fitCount, minVisibleItems, maxVisibleItems ?? itemCount)
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/useOverflow.ts (the only caller)
 */

export interface ComputeOverflowInput {
  /** Measured widths of each item, in original DOM order. */
  widths: number[];
  /** Gap between items, in pixels. */
  gap: number;
  /** Width available to lay items out, in pixels. */
  availableWidth: number;
  /** Measured width of the overflow indicator (0 if none). */
  indicatorWidth: number;
  /** Floor — always show at least this many items. */
  minVisibleItems: number;
  /** Ceiling — never show more than this many items. `undefined` = no cap. */
  maxVisibleItems?: number;
  /**
   * Bounded multi-row: wrap items across up to this many rows, then collapse
   * the rest into the overflow indicator. `undefined` (or `1`) = single line.
   */
  maxRows?: number;
  /** Which end items collapse from. */
  collapseFrom: 'start' | 'end';
}

export interface ComputeOverflowResult {
  /** Number of items that should be rendered in the visible container. */
  visibleCount: number;
  /** Number of rows the visible items occupy (always 1 for the single-line path). */
  rows: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(Math.min(value, max), min);
}

/**
 * Resolve the ceiling and floor into a single [floor, ceiling] pair.
 *
 * `maxVisibleItems` is clamped to `itemCount` (a cap larger than the list is a
 * no-op). When `maxVisibleItems < minVisibleItems`, the floor wins (D1) via the
 * final clamp — the hook is responsible for the dev-only warning.
 */
function resolveBounds(
  itemCount: number,
  minVisibleItems: number,
  maxVisibleItems: number | undefined,
): {floor: number; ceiling: number} {
  const floor = Math.max(0, Math.min(minVisibleItems, itemCount));
  const rawCeiling = maxVisibleItems == null ? itemCount : maxVisibleItems;
  const ceiling = Math.max(0, Math.min(rawCeiling, itemCount));
  return {floor, ceiling};
}

/**
 * Single-line greedy fit: how many items fit in one row of `availableWidth`,
 * reserving indicator space for every non-final admitted item. Mirrors the
 * original in-hook loop so single-line behavior is unchanged.
 */
function computeSingleLineFit(
  orderedWidths: number[],
  gap: number,
  availableWidth: number,
  indicatorWidth: number,
  floor: number,
  ceiling: number,
): number {
  let totalWidth = 0;
  let count = 0;

  for (let i = 0; i < orderedWidths.length; i++) {
    if (count >= ceiling) {
      break;
    }

    const itemWidth = orderedWidths[i];
    const gapWidth = i > 0 ? gap : 0;
    const candidateWidth = totalWidth + itemWidth + gapWidth;

    const isLastItem = i === orderedWidths.length - 1;
    const reservedWidth = isLastItem
      ? 0
      : indicatorWidth + (count > 0 || indicatorWidth > 0 ? gap : 0);

    if (candidateWidth + reservedWidth > availableWidth && count >= floor) {
      break;
    }

    totalWidth = candidateWidth;
    count++;
  }

  return count;
}

/**
 * Pack items into rows, wrapping when the next item would exceed
 * `availableWidth`. On the last allowed row, keep `indicatorReserve` px free so
 * the overflow indicator fits. Stops admitting once no further item can be
 * placed within `maxRows`.
 */
function packRows(
  orderedWidths: number[],
  gap: number,
  availableWidth: number,
  indicatorReserve: number,
  maxRows: number,
): {placed: number; rows: number} {
  let placed = 0;
  let row = 1;
  let rowWidth = 0;

  for (let i = 0; i < orderedWidths.length; i++) {
    const w = orderedWidths[i];
    const isFirstInRow = rowWidth === 0;
    const candidate = isFirstInRow ? w : rowWidth + gap + w;

    const onLastRow = row === maxRows;
    const reserve =
      onLastRow && indicatorReserve > 0 ? indicatorReserve + gap : 0;

    if (candidate + reserve <= availableWidth) {
      rowWidth = candidate;
      placed++;
      continue;
    }

    if (isFirstInRow) {
      // A single item wider than the row occupies this row alone (it will be
      // clipped visually). But if it can't coexist with the reserved indicator
      // on the last row, stop here.
      if (onLastRow && reserve > 0) {
        break;
      }
      rowWidth = candidate;
      placed++;
      continue;
    }

    if (row >= maxRows) {
      break;
    }
    row++;
    rowWidth = 0;
    i--; // re-attempt this item as the first on the new row
  }

  return {placed, rows: row};
}

/** Count how many rows a set of items occupies when wrapped at availableWidth. */
export function countRows(
  orderedWidths: number[],
  gap: number,
  availableWidth: number,
): number {
  if (orderedWidths.length === 0) {
    return 0;
  }
  let rows = 1;
  let rowWidth = 0;
  for (let i = 0; i < orderedWidths.length; i++) {
    const w = orderedWidths[i];
    const isFirstInRow = rowWidth === 0;
    const candidate = isFirstInRow ? w : rowWidth + gap + w;
    if (candidate <= availableWidth || isFirstInRow) {
      rowWidth = candidate;
    } else {
      rows++;
      rowWidth = w;
    }
  }
  return rows;
}

/**
 * Multi-row packing (Strategy A): simulate wrapping items into rows of
 * `availableWidth`, admitting items until a new item would require a row beyond
 * `maxRows`, reserving indicator space on the final row when items overflow.
 * Returns the admitted count and how many rows those items occupy. Assumes
 * uniform row height.
 */
function computeMultiRowFit(
  orderedWidths: number[],
  gap: number,
  availableWidth: number,
  indicatorWidth: number,
  maxRows: number,
): {count: number; rows: number} {
  const n = orderedWidths.length;
  if (n === 0) {
    return {count: 0, rows: 0};
  }

  // If everything fits within maxRows without reserving indicator space, there
  // is no overflow and no indicator is needed.
  const packAll = packRows(orderedWidths, gap, availableWidth, 0, maxRows);
  if (packAll.placed === n) {
    return {count: n, rows: packAll.rows};
  }

  // Overflow → reserve indicator space on the final row and re-pack.
  const packWithIndicator = packRows(
    orderedWidths,
    gap,
    availableWidth,
    indicatorWidth,
    maxRows,
  );

  const count = packWithIndicator.placed;
  const rows = countRows(orderedWidths.slice(0, count), gap, availableWidth);

  return {count, rows: Math.max(count > 0 ? 1 : 0, rows)};
}

/**
 * Pure overflow computation. Given plain measurements and the configured
 * limits, return how many items should be visible and how many rows they
 * occupy. No DOM, no React — safe to unit-test directly.
 */
export function computeOverflow(
  input: ComputeOverflowInput,
): ComputeOverflowResult {
  const {
    widths,
    gap,
    availableWidth,
    indicatorWidth,
    minVisibleItems,
    maxVisibleItems,
    maxRows,
    collapseFrom,
  } = input;

  const itemCount = widths.length;
  if (itemCount === 0) {
    return {visibleCount: 0, rows: 0};
  }

  const {floor, ceiling} = resolveBounds(
    itemCount,
    minVisibleItems,
    maxVisibleItems,
  );

  const orderedWidths = collapseFrom === 'end' ? widths : [...widths].reverse();

  const multiRow = maxRows != null && maxRows > 1;

  if (!multiRow) {
    const fitCount = computeSingleLineFit(
      orderedWidths,
      gap,
      availableWidth,
      indicatorWidth,
      floor,
      ceiling,
    );
    const visibleCount = clamp(fitCount, floor, ceiling);
    return {visibleCount, rows: visibleCount > 0 ? 1 : 0};
  }

  const {count, rows} = computeMultiRowFit(
    orderedWidths,
    gap,
    availableWidth,
    indicatorWidth,
    maxRows,
  );
  const visibleCount = clamp(count, floor, ceiling);
  const resolvedRows =
    visibleCount === count
      ? rows
      : countRows(orderedWidths.slice(0, visibleCount), gap, availableWidth);
  return {visibleCount, rows: visibleCount > 0 ? Math.max(1, resolvedRows) : 0};
}
