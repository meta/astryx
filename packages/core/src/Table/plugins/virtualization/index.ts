// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Public geometry-only Table rows and columns virtualization hooks
 * @output Hook, config and opaque capability types; no engine or private controller
 * @position Table virtualization plugin export seam
 */
export {useTableRowsVirtualization} from './useTableRowsVirtualization';
export type {
  UseTableRowsVirtualizationConfig,
  TableVirtualizationCapability,
} from './useTableRowsVirtualization';
export {useTableColumnsVirtualization} from './useTableColumnsVirtualization';
export type {UseTableColumnsVirtualizationConfig} from './useTableColumnsVirtualization';
