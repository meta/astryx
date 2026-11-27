// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTableRowsVirtualization.ts
 * @input Positive finite CSS-pixel row pitch and first-frame viewport height
 * @output Stable opaque TableVirtualizationCapability that carries the row
 *   window, and the public config type
 * @position Geometry-only opt-in; Table owns data, admission and rendering.
 *   This import alone reaches the row window controller and its engine.
 */
import {useMemo} from 'react';
import {
  ROWS_CAPABILITY,
  ROWS_WINDOWING,
  type TableRowsWindowing,
} from '../../tableColumnWindowing';
import {useTableWindow} from './useTableWindow';

export {getTableVirtualizationConfig} from '../../tableColumnWindowing';

const TABLE_ROWS_WINDOWING: TableRowsWindowing = Object.freeze({
  useWindow: useTableWindow,
});

export interface UseTableRowsVirtualizationConfig {
  /**
   * Total body-row pitch, including padding and collapsed borders, in CSS
   * pixels. Rows never measure shorter. When every mounted row measures
   * taller, as with enlarged text, windowing uses the measured height.
   */
  rowHeight: number;
  /**
   * The viewport height in CSS pixels that the first window plans for, on
   * the server and before the viewport is measured. It does not size the
   * Table: the Table takes its height from its parent.
   */
  initialViewportHeight: number;
}

/** Geometry intent, not a data slice, renderer, scroll handle or plugin. */
export interface TableVirtualizationCapability {
  /**
   * A brand that is never present at runtime. It is required, so only the
   * hook makes a capability, and its name is the same in a swizzled copy.
   */
  readonly '@astryxdesign/core/table-virtualization/v1': never;
}

/**
 * Opt into fixed-height flat-row Table rendering without transferring data ownership.
 * Unsupported geometry, identity or content falls back to ordinary Table rendering.
 *
 * @example
 * ```
 * const virtualization = useTableRowsVirtualization({rowHeight: 48, initialViewportHeight: 480});
 * <Table data={data} columns={columns} idKey="id" virtualization={virtualization} />;
 * ```
 */
export function useTableRowsVirtualization({
  rowHeight,
  initialViewportHeight,
}: UseTableRowsVirtualizationConfig): TableVirtualizationCapability {
  return useMemo(
    () =>
      Object.freeze({
        [ROWS_CAPABILITY]: Object.freeze({rowHeight, initialViewportHeight}),
        [ROWS_WINDOWING]: TABLE_ROWS_WINDOWING,
      }) as unknown as TableVirtualizationCapability,
    [rowHeight, initialViewportHeight],
  );
}
