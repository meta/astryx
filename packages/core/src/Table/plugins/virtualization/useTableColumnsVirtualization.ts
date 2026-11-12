// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTableColumnsVirtualization.ts
 * @input Positive finite CSS-pixel first-frame inline viewport width
 * @output Stable opaque TableVirtualizationCapability that carries the
 *   column window
 * @position Inline-axis opt-in; Table owns columns, widths, pinned runs and
 *   rendering. This import alone reaches the column windowing code.
 */
import {useMemo} from 'react';
import {COLUMNS_CAPABILITY} from '../../tableColumnWindowing';
import type {TableVirtualizationCapability} from './useTableRowsVirtualization';
import {TABLE_COLUMNS_WINDOWING} from './TableColumnWindow';

export {getTableColumnsVirtualizationConfig} from '../../tableColumnWindowing';

export interface UseTableColumnsVirtualizationConfig {
  /**
   * The inline viewport width in CSS pixels that the first window plans for,
   * on the server and before the viewport is measured. It does not size the
   * Table.
   */
  initialViewportWidth: number;
}

/**
 * Opt into Table column windowing: only the unpinned columns near the inline
 * viewport mount. Columns keep their declared widths; unsupported content or
 * structure renders every column.
 *
 * @example
 * ```
 * const virtualization = useTableColumnsVirtualization({initialViewportWidth: 960});
 * <Table data={data} columns={columns} idKey="id" virtualization={virtualization} />;
 * ```
 */
export function useTableColumnsVirtualization({
  initialViewportWidth,
}: UseTableColumnsVirtualizationConfig): TableVirtualizationCapability {
  return useMemo(
    () =>
      Object.freeze({
        [COLUMNS_CAPABILITY]: Object.freeze({
          initialViewportWidth,
          windowing: TABLE_COLUMNS_WINDOWING,
        }),
      }) as unknown as TableVirtualizationCapability,
    [initialViewportWidth],
  );
}
