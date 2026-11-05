// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file columnUtils.ts
 * @input TableColumn types from types.ts
 * @output Pure utility functions for column width, layout resolution, and auto-generation
 * @position Utility layer; consumed by BaseTable.tsx
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Table/Table.doc.mjs (utility descriptions)
 * - /packages/core/src/Table/index.ts (exports if functions change)
 */

import type {CSSProperties, ReactNode} from 'react';
import type {TableColumn, ProportionalWidth, PixelWidth} from './types';
import {firstCharacter} from '../utils/characters';

/** Default minimum width (in px) for explicit proportional columns. */
export const DEFAULT_MIN_COLUMN_WIDTH = 120;

/**
 * Compact readability floor (in px) for flexible columns with no width.
 *
 * This is intentionally smaller than the explicit proportional() default:
 * width-less columns remain compact and equal while avoiding near-zero collapse.
 */
export const DEFAULT_FLEXIBLE_COLUMN_MIN_WIDTH = 60;

function resolveFlexibleColumnMinWidth(
  width: ProportionalWidth | undefined,
): number {
  return (
    width?.minWidth ??
    (width == null
      ? DEFAULT_FLEXIBLE_COLUMN_MIN_WIDTH
      : DEFAULT_MIN_COLUMN_WIDTH)
  );
}

// =============================================================================
// Resolved Column Widths
// =============================================================================

/**
 * Pre-computed width information for a single column.
 * Produced by `resolveColumnWidths()`, consumed by header cell rendering.
 */
export interface ResolvedColumnWidth {
  /** Inline style to apply on the `<th>` for this column. */
  style: CSSProperties;
}

/**
 * Result of `resolveColumnWidths()` — contains per-column width styles
 * and the aggregate table min-width. Computed once and shared between
 * the table min-width calculation and header cell rendering.
 */
export interface ResolvedColumnWidths {
  /** Per-column width styles, indexed by column key. */
  columns: Map<string, ResolvedColumnWidth>;
  /** Minimum table width (px) to prevent proportional columns from shrinking below their minWidth. */
  tableMinWidth: number;
}

/**
 * Resolve column widths for the entire table in a single pass.
 *
 * Computes:
 * - Per-column inline styles (`width`, `minWidth`) for `<th>` elements
 * - Aggregate `tableMinWidth` for the `<table>` element
 *
 * This consolidates width logic that was previously duplicated between
 * the `tableMinWidth` IIFE and the header cell rendering loop.
 *
 * @param columns - Resolved column definitions (after auto-generation)
 * @returns Pre-computed widths for each column and the table minimum width
 */
/**
 * Space accounting shared by layout and by plugins that need rendered widths.
 * Flexible columns (width-less or proportional) split `maxProportionalSpace`
 * by proportion; it is the smallest space in which every flexible column
 * still meets its own floor.
 */
interface ColumnSpacePlan {
  totalProportion: number;
  pixelTotal: number;
  maxProportionalSpace: number;
}

function planColumnSpace<T extends Record<string, unknown>>(
  columns: ReadonlyArray<TableColumn<T>>,
): ColumnSpacePlan {
  let totalProportion = 0;
  let pixelTotal = 0;
  const flexibleCols: {proportion: number; minWidth: number}[] = [];

  for (const col of columns) {
    const w = col.width;
    if (w?.type === 'pixel') {
      pixelTotal += w.value;
    } else {
      const proportion = w?.value ?? 1;
      totalProportion += proportion;
      flexibleCols.push({
        proportion,
        minWidth: resolveFlexibleColumnMinWidth(w),
      });
    }
  }

  let maxProportionalSpace = 0;
  if (totalProportion > 0) {
    for (const col of flexibleCols) {
      const required = (col.minWidth * totalProportion) / col.proportion;
      if (required > maxProportionalSpace) {
        maxProportionalSpace = required;
      }
    }
  }
  return {totalProportion, pixelTotal, maxProportionalSpace};
}

/**
 * Inline width (px) of each column while the table sits at its minimum width,
 * which is the width a horizontally overflowing table renders at. Pixel
 * columns keep their value; a flexible column takes its proportional share of
 * the space that satisfies every flexible floor, so a width-less column beside
 * a `proportional()` column can render wider than its own 60px floor.
 */
export function resolveColumnFloorWidths<T extends Record<string, unknown>>(
  columns: ReadonlyArray<TableColumn<T>>,
): Map<string, number> {
  const {totalProportion, maxProportionalSpace} = planColumnSpace(columns);
  const widths = new Map<string, number>();
  for (const col of columns) {
    const w = col.width;
    if (w?.type === 'pixel') {
      widths.set(col.key, w.value);
    } else {
      const proportion = w?.value ?? 1;
      widths.set(
        col.key,
        totalProportion > 0
          ? (maxProportionalSpace * proportion) / totalProportion
          : 0,
      );
    }
  }
  return widths;
}

// A min-width CSS `max()` accepts: a dimension with a known length unit, a
// percentage, or a math/var() expression. Intrinsic-size and global keywords
// (auto, max-content, min-content, fit-content, inherit, ...) and unitless
// non-zero numbers are not lengths and would invalidate the whole declaration.
const MAX_COMPATIBLE_LENGTH =
  /^[+-]?(?:\d+\.?\d*|\.\d+)(?:px|r?em|r?lh|r?ex|r?ch|r?cap|r?ic|vw|vh|vi|vb|vmin|vmax|[sld]v(?:w|h|i|b|min|max)|cq(?:w|h|i|b|min|max)|cm|mm|q|in|pt|pc|%)$/i;
const MAX_COMPATIBLE_FUNCTION = /^(?:calc|min|max|clamp|var)\(/i;
const ZERO_LENGTH = /^[+-]?(?:0+\.?0*|\.0+)(?:[a-z]+|%)?$/i;
const PX_LENGTH = /^(\d+(?:\.\d+)?)px$/i;

/**
 * Inline min-width for a data-driven table: the larger of the column-floor
 * minimum and a min-width the consumer (or a plugin) set.
 *
 * - Numbers, zero, and px lengths compare directly and yield a px value.
 * - Other lengths, percentages, and calc()/var() expressions defer to CSS
 *   `max()` so the browser resolves the larger one.
 * - Keywords (auto, max-content, inherit, ...) cannot appear inside `max()`;
 *   the column floors win, which keeps every column at its readable minimum.
 */
export function resolveTableMinWidth(
  consumer: CSSProperties['minWidth'],
  floorPx: number,
): string {
  const floor = `${floorPx}px`;
  if (consumer == null) {
    return floor;
  }
  if (typeof consumer === 'number') {
    return `${Math.max(consumer, floorPx)}px`;
  }
  const value = consumer.trim();
  if (value === '' || ZERO_LENGTH.test(value)) {
    return floor;
  }
  const px = PX_LENGTH.exec(value);
  if (px) {
    return `${Math.max(Number(px[1]), floorPx)}px`;
  }
  if (
    MAX_COMPATIBLE_LENGTH.test(value) ||
    MAX_COMPATIBLE_FUNCTION.test(value)
  ) {
    return `max(${value}, ${floor})`;
  }
  return floor;
}

export function resolveColumnWidths<T extends Record<string, unknown>>(
  columns: TableColumn<T>[],
): ResolvedColumnWidths {
  const {totalProportion, pixelTotal, maxProportionalSpace} =
    planColumnSpace(columns);
  const tableMinWidth = pixelTotal + maxProportionalSpace;

  // --- Pass 3: Build per-column styles ---
  const result = new Map<string, ResolvedColumnWidth>();

  for (const col of columns) {
    const w = col.width;
    const style: CSSProperties = {};

    if (w?.type === 'pixel') {
      // Fixed pixel width — set both width and minWidth to prevent shrinking
      style.width = `${w.value}px`;
      style.minWidth = `${w.value}px`;
    } else {
      // Proportional width — compute percentage from total proportional units.
      const proportion = w?.value ?? 1;
      if (totalProportion > 0) {
        style.width = `${(proportion / totalProportion) * 100}%`;
      }
      // Width-less columns stay flexible, but keep a compact readability floor.
      style.minWidth = `${resolveFlexibleColumnMinWidth(w)}px`;
    }

    result.set(col.key, {style});
  }

  return {columns: result, tableMinWidth};
}

/**
 * Create a proportional column width (fr-like).
 * Columns share available space proportionally.
 * Applies `DEFAULT_MIN_COLUMN_WIDTH` when no explicit minWidth is provided.
 *
 * @example
 * ```
 * proportional(2) // twice as wide as proportional(1)
 * proportional(1, { minWidth: 200 }) // explicit min
 * ```
 */
export function proportional(
  value: number = 1,
  options?: {minWidth?: number},
): ProportionalWidth {
  return {
    type: 'proportional',
    value,
    minWidth: options?.minWidth ?? DEFAULT_MIN_COLUMN_WIDTH,
  };
}

/**
 * Create a fixed pixel column width.
 *
 * @example
 * ```
 * pixel(200) // exactly 200px wide
 * ```
 */
export function pixel(value: number): PixelWidth {
  return {type: 'pixel', value};
}

/**
 * Capitalize the first letter of a string.
 * Used for auto-generating header text from data keys.
 */
export function capitalize(str: string): string {
  if (str.length === 0) {
    return str;
  }
  const first = firstCharacter(str);
  return first.toUpperCase() + str.slice(first.length);
}

/**
 * Default cell renderer — converts the value at `item[key]` to a string.
 */
export function defaultCellRenderer<T extends Record<string, unknown>>(
  item: T,
  key: string,
): ReactNode {
  const value = item[key];
  if (value == null) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return '';
}

/**
 * Estimate the display width of a value in characters.
 * Only measures string and number values — objects, arrays, and other
 * complex types return 0 (fall back to equal proportioning for that cell).
 */
function estimateContentLength(value: unknown): number {
  if (value == null) {
    return 0;
  }
  if (typeof value === 'string') {
    return value.length;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).length;
  }
  return 0;
}

/**
 * Find the longest single word in a value (for min-width estimation).
 * A "word" is a contiguous non-whitespace sequence.
 * Only measures string and number values — complex types return 0.
 */
function longestWord(value: unknown): number {
  if (value == null) {
    return 0;
  }
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean'
  ) {
    return 0;
  }
  const str = String(value);
  let max = 0;
  let current = 0;
  for (let i = 0; i <= str.length; i++) {
    if (
      i === str.length ||
      str[i] === ' ' ||
      str[i] === '\t' ||
      str[i] === '\n'
    ) {
      if (current > max) {
        max = current;
      }
      current = 0;
    } else {
      current++;
    }
  }
  return max;
}

/** Scale factor: approximate px per character for min-width calculation. */
const PX_PER_CHAR = 8;

/**
 * Auto-generate column definitions from the keys of the first data item.
 * Derives content-proportional widths by analyzing the header and first
 * few rows of data. Min-width is based on the longer of: header text
 * or the longest single word in values.
 */
export function generateColumns<T extends Record<string, unknown>>(
  data: T[],
): TableColumn<T>[] {
  if (data.length === 0) {
    return [];
  }
  const firstItem = data[0];
  const keys = Object.keys(firstItem);

  // Sample first few rows for content analysis
  const sampleRows = data.slice(0, Math.min(5, data.length));

  // Measure each column
  const measurements = keys.map(key => {
    const headerLen = capitalize(key).length;

    let maxContentLen = headerLen;
    let maxWordLen = headerLen; // header is a single "word" for min-width purposes

    for (const row of sampleRows) {
      const contentLen = estimateContentLength(row[key]);
      if (contentLen > maxContentLen) {
        maxContentLen = contentLen;
      }

      const wordLen = longestWord(row[key]);
      if (wordLen > maxWordLen) {
        maxWordLen = wordLen;
      }
    }

    return {key, headerLen, maxContentLen, maxWordLen};
  });

  return measurements.map(m => {
    // Bucket content length into proportional tiers:
    // 1 = short (≤6 chars: IDs, ages, booleans, status)
    // 2 = medium (7–15 chars: names, dates, short strings)
    // 3 = long (>15 chars: emails, URLs, descriptions)
    const proportion = m.maxContentLen <= 6 ? 1 : m.maxContentLen <= 15 ? 2 : 3;

    // Min-width: enough to fit header or longest word without wrapping
    const minWidth = Math.max(
      Math.max(m.headerLen, m.maxWordLen) * PX_PER_CHAR,
      DEFAULT_FLEXIBLE_COLUMN_MIN_WIDTH,
    );

    return {
      key: m.key,
      header: capitalize(m.key),
      width: proportional(proportion, {minWidth}),
    };
  });
}
