// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input The Tour component
 * @output Exports the Tour module's public API
 * @position Entry point for the Tour module
 *
 * SYNC: When adding new Tour files, update exports here
 */

export {Tour} from './Tour';
export type {
  TourEndReason,
  TourMissingAnchorBehavior,
  TourProps,
  TourStep,
} from './Tour';
