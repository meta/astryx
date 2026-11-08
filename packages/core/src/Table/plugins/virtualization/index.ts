// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Public geometry-only Table virtualization hook
 * @output Hook, config and opaque capability types; no engine or private controller
 * @position Table virtualization plugin export seam
 */
export {useTableRowsVirtualization} from './useTableRowsVirtualization';
export type {
  UseTableRowsVirtualizationConfig,
  TableVirtualizationCapability,
} from './useTableRowsVirtualization';
