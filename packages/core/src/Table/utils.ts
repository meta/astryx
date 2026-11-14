// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file utils.ts
 * @output Server-safe re-exports of pure Table utility functions
 * @position Subpath entry point: `@astryxdesign/core/Table/utils`
 */

export {
  proportional,
  pixel,
  capitalize,
  generateColumns,
  resolveColumnWidths,
  DEFAULT_MIN_COLUMN_WIDTH,
} from './columnUtils';

export {registerFixedHeightColumn} from './tableColumnAdmission';

export type {
  ColumnWidth,
  ProportionalWidth,
  PixelWidth,
  TableColumn,
} from './types';
