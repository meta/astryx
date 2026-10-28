// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTableColumnResize.tsx
 * @input React, types, StyleX, theme tokens
 * @output Exports useTableColumnResize hook and UseTableColumnResizeConfig type
 * @position Column resize plugin; consumed by Table via plugins prop
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Table/Table.doc.mjs (resize documentation)
 * - /packages/core/src/Table/index.ts (exports)
 */

import {useRef, useMemo, useCallback, useEffect, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {colorVars} from '../../../theme/tokens.stylex';
import type {
  TablePlugin,
  HeaderCellRenderProps,
  HeaderRowRenderProps,
  TableColumn,
  ColumnWidth,
  ScrollWrapperRenderProps,
} from '../../types';
import {
  DEFAULT_FLEXIBLE_COLUMN_MIN_WIDTH,
  DEFAULT_MIN_COLUMN_WIDTH,
} from '../../columnUtils';
import {observeResize} from '../../../utils/sharedResizeObserver';

// =============================================================================
// Config Type
// =============================================================================

export interface UseTableColumnResizeConfig {
  /**
   * Column width overrides from resize operations.
   * Keys are column `key` strings. Values are pixel widths.
   * When a column key is present here, it overrides the column's
   * declared `width` (proportional or pixel).
   *
   * Controlled: consumer owns this state and persists as needed.
   */
  columnWidths?: Record<string, number>;

  /**
   * Called when a resize operation completes (pointerup / Enter key).
   * Consumer updates their `columnWidths` state here.
   */
  /**
   * Called when a resize operation completes (pointerup / Enter key).
   * Receives a map of ALL column keys that changed width — the resized column
   * plus any other columns that were committed to pixel widths to prevent
   * layout shift. Consumer should merge these into their columnWidths state.
   */
  onColumnResizeEnd?: (updates: Record<string, number>) => void;

  /**
   * Global minimum column width in pixels during resize.
   * Overrides per-column defaults when set.
   * @default undefined (uses column-specific minimum)
   */
  minWidth?: number;

  /**
   * Global maximum column width in pixels during resize.
   * @default Infinity (no max)
   */
  maxWidth?: number;

  /**
   * Column definitions — needed to derive per-column min widths
   * and detect proportional vs pixel columns for last-column behavior.
   *
   * When proportional columns are detected, the resize handle
   * automatically adjusts the neighboring column instead of the
   * proportional column itself. The last proportional column has
   * no resize handle (it flexes to fill remaining space).
   *
   * When not provided, all columns are treated as pixel columns
   * and the global minWidth fallback (50px) is used.
   */
  columns?: TableColumn<Record<string, unknown>>[];
}

// =============================================================================
// Constants
// =============================================================================

const FALLBACK_MIN_WIDTH = 50;
const KEYBOARD_STEP = 10;
const KEYBOARD_LARGE_STEP = 50;
/**
 * How long after the last scroll event the disclosure gate stays closed, where
 * `scrollend` is unavailable. Long enough to bridge the gaps between events in
 * a momentum scroll, short enough that a deliberate hover right after one is
 * not left waiting.
 */
const SCROLL_SETTLE_MS = 120;

// =============================================================================
// Width Helpers
// =============================================================================

/**
 * Derive the effective minimum width for a column based on its width config.
 * - Proportional columns: use their declared minWidth (default 120px)
 * - Pixel columns: use their declared value (you set 200px, min is 200px)
 * - No width: use the compact flexible-column floor (60px)
 * - Unknown: use the legacy 50px fallback
 *
 * A global override (from config.minWidth) takes precedence when set.
 */
function resolveColumnMinWidth(
  colWidth: ColumnWidth | undefined,
  globalOverride: number | undefined,
): number {
  if (globalOverride != null) {
    return globalOverride;
  }
  if (!colWidth) {
    return DEFAULT_FLEXIBLE_COLUMN_MIN_WIDTH;
  }
  if (colWidth.type === 'proportional') {
    return colWidth.minWidth ?? DEFAULT_MIN_COLUMN_WIDTH;
  }
  if (colWidth.type === 'pixel') {
    return colWidth.value;
  }
  return FALLBACK_MIN_WIDTH;
}

/**
 * Check whether a column is proportional (or has no explicit width,
 * which defaults to proportional(1) in BaseTable).
 */
function isProportionalColumn(colWidth: ColumnWidth | undefined): boolean {
  return !colWidth || colWidth.type === 'proportional';
}

// =============================================================================
// Central width computation
// =============================================================================

/**
 * Given a drag delta, compute pixel widths for ALL columns.
 * Only the target column (or neighbor in proportional mode) changes;
 * all others stay at their snapshot values. The last column gets the
 * remainder (tableWidth - sum of others).
 *
 * Every width is clamped to its column's min. This is the single source
 * of truth for column widths during drag — no other code path should
 * compute widths independently.
 */
function computeColumnWidths(drag: DragState, delta: number): number[] {
  const {snapshots, resizeIndex, neighborIndex, tableWidth} = drag;
  const widths = snapshots.map(s => s.initialWidth);
  const lastIndex = snapshots.length - 1;

  if (neighborIndex != null) {
    // Proportional-preserving: adjust the neighbor column inversely.
    const neighbor = snapshots[neighborIndex];
    const self = snapshots[resizeIndex];

    // Clamp: neighbor can't go below its min
    const maxDelta = neighbor.initialWidth - neighbor.minWidth;
    // Clamp: self can't go below its min
    const minDelta = self.minWidth - self.initialWidth;
    const clampedDelta = Math.max(minDelta, Math.min(delta, maxDelta));

    widths[neighborIndex] = neighbor.initialWidth - clampedDelta;
    widths[resizeIndex] = self.initialWidth + clampedDelta;
  } else {
    // Direct resize: clamp to min/max
    const self = snapshots[resizeIndex];
    const newWidth = Math.min(
      self.maxWidth,
      Math.max(self.minWidth, self.initialWidth + delta),
    );
    widths[resizeIndex] = newWidth;
  }

  // Last column = remainder (table can grow horizontally if needed)
  if (lastIndex >= 0 && tableWidth > 0) {
    const sumOthers = widths.reduce(
      (sum, w, i) => (i === lastIndex ? sum : sum + w),
      0,
    );
    widths[lastIndex] = Math.max(
      snapshots[lastIndex].minWidth,
      tableWidth - sumOthers,
    );
  }

  return widths;
}

// =============================================================================
// Styles
// =============================================================================

const handleStyles = stylex.create({
  base: {
    position: 'absolute',
    // Keep entirely inside the <th> — extending outside gets clipped by the
    // adjacent <th>'s overflow:hidden.
    insetInlineEnd: 0,
    top: 0,
    // Extend the handle the full height of the table, not just the header.
    // The <th> has overflow:visible (from headerCellRelative), so the handle
    // visually reaches through the body rows. Both variables are set by the
    // plugin's ResizeObserver — they fall back to header-height when it
    // hasn't fired yet.
    //
    // `top: 0` does not land on the table's top edge: the handle hangs from
    // its cell's content box, and the header's vertical centring shifts that
    // box down by an amount that depends on how tall its own content is.
    // Subtracting that drop keeps the handle from hanging past the last row
    // and forcing the scroll wrapper to scroll.
    height:
      'calc(var(--table-resize-height, 100%) - var(--table-resize-offset, 0px))',
    // Wide transparent hit area; the visible indicator uses ::after to span
    // the full handle height independently of the border box.
    width: '8px',
    cursor: {
      default: 'ew-resize',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    zIndex: 1,
    touchAction: 'none',
    userSelect: 'none',
    // Drive the indicator color via a CSS variable that ::after reads.
    // The parent handle is the hover/focus target — pseudo-elements
    // can't receive :hover directly.
    /*
     * The resting value is inherited rather than fixed: the header row sets
     * `--resize-hint` while it is hovered, which reveals every boundary at
     * once so the columns can advertise that they move. Reading it as the
     * default (instead of matching the row's hover from down here) keeps this
     * element's own :hover a plain same-element override — an ancestor
     * selector would outrank it and the handle under the pointer would never
     * reach accent.
     *
     * The pointer arm passes through the same `--resize-hint-gate` as the row
     * hint: horizontal scrolling drags columns under a still pointer, so a
     * boundary arriving beneath it mid-scroll is no more intentional than the
     * row-level reveal (FR10). Focus-visible is ungated — focus is always
     * deliberate.
     */
    '--indicator-color': {
      default: 'var(--resize-hint, transparent)',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': `var(--resize-hint-gate, ${colorVars['--color-accent']})`,
      ':focus-visible': colorVars['--color-accent'],
    },
    /*
     * Pointer capability gates the REVEAL, not the control (DEC-3). The
     * handle stays rendered and focusable wherever any input can drive it, so
     * a coarse-primary device with a keyboard keeps its tab stop, its
     * accessible name, and arrow-key resize (FR6, FR8, AR6).
     *
     * What coarse pointers lose is pointer interaction: dragging a hairline
     * boundary by finger is a non-goal (DEC-4), and an invisible 8px strip
     * that swallows touches on the header is worse than no target at all.
     * `pointer-events: none` removes it from touch without removing it from
     * the accessibility tree the way `display: none` did. The hover reveal is
     * already gated separately on the header row, so at rest there is nothing
     * drawn here to explain.
     */
    '@media (pointer: coarse)': {
      pointerEvents: 'none',
    },
  },
  /**
   * The 1px indicator line as a pseudo-element on the trailing edge.
   * Spans the full height of the handle (which extends the table height).
   * Reads --indicator-color from the parent, which toggles on
   * hover, focus-visible, and during drag.
   */
  indicator: {
    '::after': {
      content: '""',
      position: 'absolute',
      // Position on the column boundary (right edge of the handle)
      // so the visual line aligns with the column divider. The 8px
      // hit area extends to the left of it.
      insetInlineEnd: 0,
      top: 0,
      bottom: 0,
      width: 'var(--indicator-width, 1px)',
      backgroundColor: 'var(--indicator-color, transparent)',
      transition: 'background-color 150ms ease, width 150ms ease',
    },
  },
});

/**
 * Publishes the hint colour the handles read at rest. Hover has to be caught
 * on the row so that entering the header anywhere reveals every boundary, not
 * only the cell under the pointer. Pointer-only — there is no hover to lead
 * with on touch, and the handles ignore touch there regardless.
 *
 * `--resize-hint-gate` is the scroll gate (FR10): the scroll listener sets it
 * to `transparent` on the scroll wrapper while the region is moving, which
 * wins here because a set custom property beats the fallback arm of `var()`.
 * Hover keeps resolving underneath — the gate just hides its result until the
 * region settles, so nothing has to be recomputed when it clears.
 *
 * Focus is deliberately absent: focusing a boundary emphasizes that one
 * boundary and never raises this row-level hint (FR9, DEC-5).
 */
const headerRowStyles = stylex.create({
  base: {
    '--resize-hint': {
      default: 'transparent',
      '@media (hover: hover)': {
        default: 'transparent',
        ':hover:where(:not(:disabled,[aria-disabled="true"]))': `var(--resize-hint-gate, ${colorVars['--color-border']})`,
      },
    },
  },
});

const headerCellRelative = stylex.create({
  base: {
    position: 'relative',
    overflow: 'visible',
  },
});

// =============================================================================
// Drag State (ref-based, not React state — avoids re-renders during drag)
// =============================================================================

interface ColumnSnapshot {
  key: string;
  th: HTMLTableCellElement;
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
}

interface DragState {
  columnKey: string;
  startX: number;
  /** Index of the column being resized in the snapshots array */
  resizeIndex: number;
  /** When resizing a proportional column, we resize the next column instead */
  neighborIndex: number | null;
  /** Snapshot of ALL columns at drag start */
  snapshots: ColumnSnapshot[];
  /** Table width at drag start — last column fills remainder */
  tableWidth: number;
}

// =============================================================================
// Resize Handle Component
// =============================================================================

interface ResizeHandleProps {
  columnKey: string;
  columnHeader: ReactNode;
  currentWidth: number | undefined;
  minWidth: number;
  maxWidth: number;
  /** For proportional-preserving: the neighbor column to resize instead */
  neighborKey: string | null;
  configRef: React.RefObject<UseTableColumnResizeConfig>;
  dragStateRef: React.RefObject<DragState | null>;
  isDraggingRef: React.RefObject<boolean>;
  tableRef: React.RefObject<HTMLTableElement | null>;
}

function ResizeHandle({
  columnKey,
  columnHeader,
  currentWidth,
  minWidth,
  maxWidth,
  neighborKey,
  configRef,
  dragStateRef,
  isDraggingRef,
  tableRef,
}: ResizeHandleProps) {
  const setTableDragging = useCallback(
    (dragging: boolean) => {
      const table = tableRef.current;
      if (table) {
        // eslint-disable-next-line react-compiler/react-compiler -- imperative DOM: disable text selection during drag
        table.style.userSelect = dragging ? 'none' : '';
      }
    },
    [tableRef],
  );

  const getRTLMultiplier = useCallback((el: HTMLElement): number => {
    const dir = getComputedStyle(el).direction;
    return dir === 'rtl' ? -1 : 1;
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const handle = e.currentTarget;
      const th = handle.closest('th');
      if (!th) {
        return;
      }

      const table = th.closest('table');
      if (table) {
        tableRef.current = table;
      }

      const headerRow = th.parentElement;
      if (!headerRow) {
        return;
      }

      const cols = configRef.current.columns;
      const colsByKey = new Map(cols?.map(c => [c.key, c]));
      const allThs = Array.from(
        headerRow.querySelectorAll<HTMLTableCellElement>(':scope > th'),
      );
      const tableWidth = tableRef.current?.getBoundingClientRect().width ?? 0;

      // Snapshot only resizable columns — skip non-resizable synthetic
      // columns (e.g. selection checkbox) so they don't shift indices
      // or participate in width redistribution during drag.
      const currentWidths = configRef.current.columnWidths ?? {};
      const snapshots: ColumnSnapshot[] = [];
      for (const cell of allThs) {
        const key = cell.getAttribute('data-column-key');
        if (!key) {
          continue;
        }
        const col = colsByKey.get(key);
        if (col?.resizable === false) {
          continue;
        }
        const rendered = cell.getBoundingClientRect().width;
        const override = currentWidths[key];
        snapshots.push({
          key,
          th: cell,
          initialWidth: override ?? (rendered > 0 ? rendered : 0),
          minWidth: col
            ? resolveColumnMinWidth(col.width, configRef.current.minWidth)
            : minWidth,
          maxWidth: configRef.current.maxWidth ?? Infinity,
        });
      }

      // Find our column and neighbor in the snapshots by key
      const resizeIndex = snapshots.findIndex(s => s.key === columnKey);
      let neighborIdx: number | null = null;
      if (neighborKey) {
        const idx = snapshots.findIndex(s => s.key === neighborKey);
        if (idx >= 0) {
          neighborIdx = idx;
        }
      }

      const drag: DragState = {
        columnKey,
        startX: e.clientX,
        resizeIndex,
        neighborIndex: neighborIdx,
        snapshots,
        tableWidth,
      };
      dragStateRef.current = drag;
      isDraggingRef.current = true;
      handle.setAttribute('data-resizing', 'true');
      handle.style.setProperty('--indicator-color', 'var(--color-accent)');
      handle.style.setProperty('--indicator-width', '2px');

      // Apply initial snapshot widths to ALL columns (freezes layout)
      const initialWidths = computeColumnWidths(drag, 0);
      snapshots.forEach((s, i) => {
        const px = `${initialWidths[i]}px`;
        s.th.style.width = px;
        s.th.style.minWidth = px;
        s.th.style.maxWidth = px;
      });
      setTableDragging(true);

      // --- Window-level listeners ---

      function onMove(ev: PointerEvent) {
        const d = dragStateRef.current;
        if (!d || !isDraggingRef.current) {
          return;
        }

        const rawDelta =
          (ev.clientX - d.startX) *
          getRTLMultiplier(d.snapshots[d.resizeIndex].th);
        const widths = computeColumnWidths(d, rawDelta);

        d.snapshots.forEach((s, i) => {
          const px = `${widths[i]}px`;
          s.th.style.width = px;
          s.th.style.minWidth = px;
          s.th.style.maxWidth = px;
        });
      }

      function onUp(ev: PointerEvent) {
        cleanup();
        const d = dragStateRef.current;
        if (!d || !isDraggingRef.current) {
          return;
        }

        handle.removeAttribute('data-resizing');
        handle.style.removeProperty('--indicator-color');
        handle.style.removeProperty('--indicator-width');
        isDraggingRef.current = false;
        dragStateRef.current = null;
        setTableDragging(false);

        const rawDelta =
          (ev.clientX - d.startX) *
          getRTLMultiplier(d.snapshots[d.resizeIndex].th);
        const widths = computeColumnWidths(d, rawDelta);

        // Build updates map — all columns except the last
        const updates: Record<string, number> = {};
        const lastIndex = d.snapshots.length - 1;
        d.snapshots.forEach((s, i) => {
          if (i === lastIndex) {
            return;
          }
          updates[s.key] = widths[i];
        });

        // Don't clear inline styles — leave them in place so there's no flash
        // between clearing and React re-rendering with the new columnWidths.
        // The plugin's transformHeaderCell will set the same pixel values on
        // the next render, seamlessly replacing these inline styles.

        if (Object.keys(updates).length > 0) {
          configRef.current.onColumnResizeEnd?.(updates);
        }
      }

      function onCancel() {
        cleanup();
        const d = dragStateRef.current;
        if (!d || !isDraggingRef.current) {
          return;
        }

        handle.removeAttribute('data-resizing');
        handle.style.removeProperty('--indicator-color');
        handle.style.removeProperty('--indicator-width');
        isDraggingRef.current = false;
        dragStateRef.current = null;
        setTableDragging(false);

        // Restore to pre-drag state by clearing all inline styles
        d.snapshots.forEach(s => {
          s.th.style.width = '';
          s.th.style.minWidth = '';
          s.th.style.maxWidth = '';
        });
      }

      function cleanup() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    },
    [
      columnKey,
      neighborKey,
      minWidth,
      getRTLMultiplier,
      dragStateRef,
      isDraggingRef,
      tableRef,
      configRef,
      setTableDragging,
    ],
  );

  /**
   * Build a DragState snapshot from the current DOM, then use
   * computeColumnWidths to calculate the result — same code path
   * as pointer drag. This ensures keyboard and pointer resize
   * produce identical column width distributions (especially when
   * hitting min/max limits and the last column absorbs overflow).
   */
  const buildSnapshotAndResize = useCallback(
    (th: HTMLTableCellElement, delta: number) => {
      const headerRow = th.parentElement;
      if (!headerRow) {
        return;
      }

      const cols = configRef.current.columns;
      const colsByKey = new Map(cols?.map(c => [c.key, c]));
      const allThs = Array.from(
        headerRow.querySelectorAll<HTMLTableCellElement>(':scope > th'),
      );
      const tableWidth = tableRef.current?.getBoundingClientRect().width ?? 0;
      const currentWidths = configRef.current.columnWidths ?? {};

      const snapshots: ColumnSnapshot[] = [];
      for (const cell of allThs) {
        const key = cell.getAttribute('data-column-key');
        if (!key) {
          continue;
        }
        const col = colsByKey.get(key);
        if (col?.resizable === false) {
          continue;
        }
        const rendered = cell.getBoundingClientRect().width;
        const override = currentWidths[key];
        snapshots.push({
          key,
          th: cell,
          initialWidth: override ?? (rendered > 0 ? rendered : 0),
          minWidth: col
            ? resolveColumnMinWidth(col.width, configRef.current.minWidth)
            : minWidth,
          maxWidth: configRef.current.maxWidth ?? Infinity,
        });
      }

      const resizeIndex = snapshots.findIndex(s => s.key === columnKey);
      let neighborIdx: number | null = null;
      if (neighborKey) {
        const idx = snapshots.findIndex(s => s.key === neighborKey);
        if (idx >= 0) {
          neighborIdx = idx;
        }
      }

      const drag: DragState = {
        columnKey,
        startX: 0,
        resizeIndex,
        neighborIndex: neighborIdx,
        snapshots,
        tableWidth,
      };

      const widths = computeColumnWidths(drag, delta);

      // Apply computed widths to DOM
      snapshots.forEach((s, i) => {
        const px = `${widths[i]}px`;
        s.th.style.width = px;
        s.th.style.minWidth = px;
        s.th.style.maxWidth = px;
      });

      // Build updates — all columns except the last (which flexes)
      const updates: Record<string, number> = {};
      const lastIndex = snapshots.length - 1;
      snapshots.forEach((s, i) => {
        if (i === lastIndex) {
          return;
        }
        updates[s.key] = widths[i];
      });

      if (Object.keys(updates).length > 0) {
        configRef.current.onColumnResizeEnd?.(updates);
      }
    },
    [columnKey, neighborKey, minWidth, configRef, tableRef],
  );

  /**
   * Keyboard resize per WAI-ARIA Window Splitter pattern.
   * Arrow keys resize immediately on focus — no activation step.
   * Each keypress commits the new width directly via computeColumnWidths
   * (same code path as pointer drag).
   * Home/End jump to min/max width.
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const handle = e.currentTarget;
      const th = handle.closest('th');
      if (!th) {
        return;
      }

      const table = th.closest('table');
      if (table) {
        tableRef.current = table;
      }

      const step = e.shiftKey ? KEYBOARD_LARGE_STEP : KEYBOARD_STEP;
      const rtl = getRTLMultiplier(th);

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowLeft': {
          e.preventDefault();
          const direction = e.key === 'ArrowRight' ? 1 : -1;
          const delta = step * direction * rtl;
          buildSnapshotAndResize(th, delta);
          break;
        }
        case 'Home': {
          e.preventDefault();
          // Jump to minimum: delta that brings current width to min
          const curWidth = currentWidth ?? th.getBoundingClientRect().width;
          buildSnapshotAndResize(th, minWidth - curWidth);
          break;
        }
        case 'End': {
          e.preventDefault();
          if (maxWidth !== Infinity) {
            const curWidth = currentWidth ?? th.getBoundingClientRect().width;
            buildSnapshotAndResize(th, maxWidth - curWidth);
          }
          break;
        }
      }
    },
    [
      currentWidth,
      getRTLMultiplier,
      minWidth,
      maxWidth,
      buildSnapshotAndResize,
      tableRef,
    ],
  );

  const ariaLabel =
    typeof columnHeader === 'string'
      ? `Resize column ${columnHeader}`
      : `Resize column ${columnKey}`;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      // A focusable role="separator" requires a numeric aria-valuenow, so fall
      // back to the column's minWidth before the width has been measured.
      aria-valuenow={currentWidth ?? minWidth}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth === Infinity ? undefined : maxWidth}
      aria-label={ariaLabel}
      tabIndex={0}
      // Lets the height observer find its own handles without matching any
      // separator a consumer happens to render inside the table.
      data-resize-handle=""
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      {...stylex.props(handleStyles.base, handleStyles.indicator)}
    />
  );
}

// =============================================================================
// Hook
// =============================================================================

export function useTableColumnResize<T extends Record<string, unknown>>(
  config: UseTableColumnResizeConfig,
): TablePlugin<T> {
  const configRef = useRef(config);
  configRef.current = config;

  const dragStateRef = useRef<DragState | null>(null);
  const isDraggingRef = useRef(false);
  // The scroll container's merged ref, kept while the inner ref is the same,
  // so React does not detach and re-attach it (and every plugin's listeners
  // on it) on every render.
  const mergedScrollWrapperRef = useRef<{
    inner: ScrollWrapperRenderProps['htmlProps']['ref'] | null;
    merged: (node: HTMLDivElement | null) => void;
  } | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);

  const globalMinWidth = config.minWidth;
  const maxWidth = config.maxWidth ?? Infinity;
  const columnWidths = config.columnWidths;
  const columns = config.columns;

  // Central list of resizable columns — filters out non-resizable columns
  // (e.g. selection checkbox) once so that all index-based logic (neighbor
  // detection, last-column checks, drag snapshots) operates on a consistent
  // set. Without this, synthetic columns injected by other plugins shift
  // indices and break width computation.
  const resizableColumns = useMemo(
    () => columns?.filter(c => c.resizable !== false),
    [columns],
  );

  // Measure the table height via ResizeObserver and expose as
  // --table-resize-height on the <table> element, alongside the distance the
  // handles start below that top edge. Both are initialized entirely by the
  // resize plugin — the base table has no knowledge of either.
  const observedTableRef = useRef<HTMLTableElement | null>(null);
  const unobserveTableRef = useRef<(() => void) | null>(null);

  const measureRef = useCallback((el: HTMLDivElement | null) => {
    unobserveTableRef.current?.();
    unobserveTableRef.current = null;
    observedTableRef.current = null;
    if (!el) {
      return;
    }

    const table = el.querySelector('table');
    if (table) {
      tableRef.current = table;
    }

    if (table && typeof ResizeObserver !== 'undefined') {
      unobserveTableRef.current = observeResize(table, () => {
        const rect = table.getBoundingClientRect();
        table.style.setProperty('--table-resize-height', `${rect.height}px`);

        /*
         * Each handle hangs from its own cell's content box, so they do not
         * all start at the same y. Publish the largest drop: every handle then
         * ends at or just above the table's bottom edge, where ending a
         * fraction short is invisible but overhanging is not — it shows up as
         * a few px of stray scrolling in the wrapper.
         *
         * Reading the handles here cannot feed back into this observer: they
         * are absolutely positioned, so their height never moves the table.
         */
        let offset = 0;
        for (const handle of table.querySelectorAll<HTMLElement>(
          '[data-resize-handle]',
        )) {
          offset = Math.max(
            offset,
            handle.getBoundingClientRect().top - rect.top,
          );
        }
        table.style.setProperty('--table-resize-offset', `${offset}px`);
      });
      observedTableRef.current = table;
    }
  }, []);

  // Clean up observer on unmount
  useEffect(() => {
    return () => {
      unobserveTableRef.current?.();
      unobserveTableRef.current = null;
    };
  }, []);

  /*
   * Scroll gate (FR10). A pointer that ends up over a header because the
   * columns moved under it has not asked for anything, so disclosure holds
   * while the region scrolls and resumes once it settles.
   *
   * This runs entirely outside React: the listener writes `--resize-hint-gate`
   * straight onto the scroll wrapper, where it inherits down to the header row
   * and the handles, and clears it on settle. No state, no rerender, no
   * observer — PR1's one permitted listener, plus the `scrollend` signal that
   * tells it when to stop.
   *
   * `scrollend` is the correct settle signal but is not everywhere yet, so a
   * single shared timeout stands in where it is missing. Only one of the two
   * paths is ever armed.
   */
  const gateCleanupRef = useRef<(() => void) | null>(null);

  const attachScrollGate = useCallback((el: HTMLDivElement | null) => {
    gateCleanupRef.current?.();
    gateCleanupRef.current = null;
    if (!el) {
      return;
    }

    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    const supportsScrollEnd = 'onscrollend' in el;

    const clear = () => {
      el.style.removeProperty('--resize-hint-gate');
    };

    const onScroll = () => {
      // Idempotent: setting the same value on every scroll tick costs a style
      // recalc the scroll itself already pays for, and never a React render.
      el.style.setProperty('--resize-hint-gate', 'transparent');
      if (supportsScrollEnd) {
        return;
      }
      if (settleTimer != null) {
        clearTimeout(settleTimer);
      }
      settleTimer = setTimeout(clear, SCROLL_SETTLE_MS);
    };

    el.addEventListener('scroll', onScroll, {passive: true});
    if (supportsScrollEnd) {
      el.addEventListener('scrollend', clear, {passive: true});
    }

    gateCleanupRef.current = () => {
      el.removeEventListener('scroll', onScroll);
      if (supportsScrollEnd) {
        el.removeEventListener('scrollend', clear);
      }
      if (settleTimer != null) {
        clearTimeout(settleTimer);
      }
      clear();
    };
  }, []);

  useEffect(() => {
    return () => {
      gateCleanupRef.current?.();
      gateCleanupRef.current = null;
    };
  }, []);

  return useMemo(
    (): TablePlugin<T> => ({
      transformTableContext(children) {
        return (
          <div ref={measureRef} style={{display: 'contents'}}>
            {children}
          </div>
        );
      },
      transformHeaderRow(props: HeaderRowRenderProps): HeaderRowRenderProps {
        return {...props, xstyle: [...props.xstyle, headerRowStyles.base]};
      },
      transformScrollWrapper(
        props: ScrollWrapperRenderProps,
      ): ScrollWrapperRenderProps {
        // Compose with any ref a prior plugin (e.g. sticky columns,
        // virtualization) already set on the scroll container.
        const existingRef = props.htmlProps.ref ?? null;
        const cached = mergedScrollWrapperRef.current;
        const mergedRef =
          cached != null && cached.inner === existingRef
            ? cached.merged
            : (node: HTMLDivElement | null) => {
                attachScrollGate(node);
                if (typeof existingRef === 'function') {
                  existingRef(node);
                } else if (existingRef != null) {
                  existingRef.current = node;
                }
              };
        mergedScrollWrapperRef.current = {
          inner: existingRef,
          merged: mergedRef,
        };
        return {
          ...props,
          htmlProps: {...props.htmlProps, ref: mergedRef},
        };
      },
      transformHeaderCell(
        props: HeaderCellRenderProps,
        column: TableColumn<T>,
      ): HeaderCellRenderProps {
        // Skip columns that opt out of resizing
        if (column.resizable === false) {
          return props;
        }

        const overrideWidth = columnWidths?.[column.key];

        // Derive per-column min width from the column's own width config
        const effectiveMinWidth = resolveColumnMinWidth(
          column.width,
          globalMinWidth,
        );

        // Determine if this is a proportional column that should
        // delegate resize to its neighbor (the next column).
        // This prevents weird behavior when the table is 100% width
        // and the last column is proportional — it just flexes.
        // Uses resizableColumns so indices aren't shifted by non-resizable
        // synthetic columns (e.g. selection).
        let neighborKey: string | null = null;

        if (resizableColumns && isProportionalColumn(column.width)) {
          const colIndex = resizableColumns.findIndex(
            c => c.key === column.key,
          );
          if (colIndex >= 0 && colIndex < resizableColumns.length - 1) {
            const nextCol = resizableColumns[colIndex + 1];
            neighborKey = nextCol.key;
          }
        }

        // If this is the last resizable column and it's proportional, skip
        // the handle. There's no neighbor to resize and resizing a flex
        // column in a full-width table produces unpredictable results.
        if (resizableColumns) {
          const colIndex = resizableColumns.findIndex(
            c => c.key === column.key,
          );
          const isLastResizable = colIndex === resizableColumns.length - 1;
          if (isLastResizable && isProportionalColumn(column.width)) {
            return props;
          }
        }

        const widthStyle: React.CSSProperties | undefined =
          overrideWidth != null
            ? {
                width: `${overrideWidth}px`,
                minWidth: `${overrideWidth}px`,
                maxWidth: `${overrideWidth}px`,
              }
            : undefined;

        const existingStyle = props.htmlProps.style;
        const mergedStyle = widthStyle
          ? existingStyle
            ? {...existingStyle, ...widthStyle}
            : widthStyle
          : existingStyle;

        const handle = (
          <ResizeHandle
            key={`resize-${column.key}`}
            columnKey={column.key}
            columnHeader={column.header ?? column.key}
            currentWidth={overrideWidth}
            minWidth={effectiveMinWidth}
            maxWidth={maxWidth}
            neighborKey={neighborKey}
            configRef={configRef}
            dragStateRef={dragStateRef}
            isDraggingRef={isDraggingRef}
            tableRef={tableRef}
          />
        );

        return {
          ...props,
          htmlProps: {
            ...props.htmlProps,
            style: mergedStyle,
          },
          overlay: (
            <>
              {props.overlay}
              {handle}
            </>
          ),
          xstyle: [...props.xstyle, headerCellRelative.base],
        };
      },
    }),
    [
      columnWidths,
      globalMinWidth,
      maxWidth,
      resizableColumns,
      measureRef,
      attachScrollGate,
    ],
  );
}
