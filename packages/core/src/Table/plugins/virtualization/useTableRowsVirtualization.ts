// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTableRowsVirtualization.ts
 * @input Positive finite CSS-pixel row pitch and viewport height
 * @output Stable opaque TableVirtualizationCapability and public config type
 * @position Geometry-only opt-in; Table owns data, admission and rendering
 */
import {useMemo} from 'react';
import {sharedKey} from '../../../utils/sharedRealm';

// A registered key, so a swizzled Table reads a capability the package's hook
// made, and the package reads a copy's.
const CAPABILITY = sharedKey('table/virtualization-capability', 1);

export interface UseTableRowsVirtualizationConfig {
  /** Total body-row pitch, including padding and collapsed borders, in CSS pixels. */
  rowHeight: number;
  /** Bounded Table-owned viewport height in CSS pixels. */
  viewportHeight: number;
}

/** Geometry intent, not a data slice, renderer, scroll handle or plugin. */
export interface TableVirtualizationCapability {
  /**
   * A brand that is never present at runtime. It is required, so only the
   * hook makes a capability, and its name is the same in a swizzled copy.
   */
  readonly '@astryxdesign/core/table-virtualization/v1': never;
}

/** Private consumption seam. Parent validates geometry and all logical inputs. */
export function getTableVirtualizationConfig(
  capability: unknown,
): Readonly<UseTableRowsVirtualizationConfig> | undefined {
  if (
    typeof capability !== 'object' ||
    capability === null ||
    !(CAPABILITY in capability)
  ) {
    return undefined;
  }
  return (
    capability as {
      readonly [CAPABILITY]: Readonly<UseTableRowsVirtualizationConfig>;
    }
  )[CAPABILITY];
}

/**
 * Opt into fixed-height flat-row Table rendering without transferring data ownership.
 * Unsupported geometry, identity or content falls back to ordinary Table rendering.
 *
 * @example
 * ```
 * const virtualization = useTableRowsVirtualization({rowHeight: 48, viewportHeight: 480});
 * <Table data={data} columns={columns} idKey="id" virtualization={virtualization} />;
 * ```
 */
export function useTableRowsVirtualization({
  rowHeight,
  viewportHeight,
}: UseTableRowsVirtualizationConfig): TableVirtualizationCapability {
  return useMemo(
    () =>
      Object.freeze({
        [CAPABILITY]: Object.freeze({rowHeight, viewportHeight}),
      }) as unknown as TableVirtualizationCapability,
    [rowHeight, viewportHeight],
  );
}
