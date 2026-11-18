// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Timestamp component
 * @output Exports all Timestamp module public API
 * @position Entry point for Timestamp module
 *
 * SYNC: When adding new Timestamp files, update exports here
 */

export {Timestamp} from './Timestamp';
export type {TimestampProps, TimestampFormat} from './Timestamp';
export type {
  TimestampTooltipEntry,
  TimestampTooltipFormat,
} from './tooltipEntries';
