// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file Private fixed-height column admission.
 * @input First-party columns whose structural renderer is owned and bounded.
 * @output Identity-based admission without a new caller assertion prop.
 * @position Shared Table protocol, with actual pitch validated after mount.
 */
import type {ReactNode} from 'react';
import type {TableColumn} from './types';
const heightSafe = new WeakMap<object, boolean>();
const logicalRenderers = new WeakMap<
  object,
  (logicalIndex: number) => ReactNode
>();
export function registerFixedHeightColumn<T extends Record<string, unknown>>(
  column: TableColumn<T>,
  isCompatible = true,
  renderLogicalPosition?: (logicalIndex: number) => ReactNode,
): void {
  heightSafe.set(column, isCompatible);
  if (renderLogicalPosition != null) {
    logicalRenderers.set(column, renderLogicalPosition);
  }
}
export function getLogicalPositionRenderer<T extends Record<string, unknown>>(
  column: TableColumn<T>,
): ((logicalIndex: number) => ReactNode) | undefined {
  return logicalRenderers.get(column);
}
export function isFixedHeightColumn<T extends Record<string, unknown>>(
  column: TableColumn<T>,
): boolean {
  return column.renderCell == null || heightSafe.get(column) === true;
}
