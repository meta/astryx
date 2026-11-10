// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTableColumnsVirtualization.ts
 * @input Positive finite CSS-pixel first-frame inline viewport width
 * @output Stable opaque TableVirtualizationCapability for column windowing
 * @position Inline-axis opt-in; Table owns columns, widths, pinned runs and rendering
 */
import {useMemo} from 'react';
import {sharedKey} from '../../../utils/sharedRealm';
import type {TableVirtualizationCapability} from './useTableRowsVirtualization';

// A registered key, so a swizzled Table reads a capability the package's hook
// made, and the package reads a copy's. It differs from the rows key, so each
// reader accepts only its own axis.
const CAPABILITY = sharedKey('table/columns-virtualization-capability', 1);

export interface UseTableColumnsVirtualizationConfig {
  /**
   * The inline viewport width in CSS pixels that the first window plans for,
   * on the server and before the viewport is measured. It does not size the
   * Table.
   */
  initialViewportWidth: number;
}

/** Private consumption seam. Parent validates the seed and all logical inputs. */
export function getTableColumnsVirtualizationConfig(
  capability: unknown,
): Readonly<UseTableColumnsVirtualizationConfig> | undefined {
  if (
    typeof capability !== 'object' ||
    capability === null ||
    !(CAPABILITY in capability)
  ) {
    return undefined;
  }
  return (
    capability as {
      readonly [CAPABILITY]: Readonly<UseTableColumnsVirtualizationConfig>;
    }
  )[CAPABILITY];
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
        [CAPABILITY]: Object.freeze({initialViewportWidth}),
      }) as unknown as TableVirtualizationCapability,
    [initialViewportWidth],
  );
}
