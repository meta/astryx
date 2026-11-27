// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input The Tour component
 * @output Re-exports the Tour lab experiment's public API
 * @position Lab entry point for the Tour directory
 *
 * SYNC: When modified, update /packages/lab/src/Tour/Tour.doc.mjs
 */

export {Tour} from './Tour';
export type {
  TourEndReason,
  TourMissingAnchorBehavior,
  TourProps,
  TourStep,
} from './Tour';
