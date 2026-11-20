// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Stat re-export
 * @input `@astryxdesign/core/Stat`
 * @output Exports Stat, StatProps, StatDelta, StatDeltaDirection,
 *   StatDeltaSentiment, StatSize from Core
 * @position Lab entry that re-exports Core's Stat, so Lab imports keep
 *   working; consumed by packages/lab/src/index.ts
 */

export {Stat} from '@astryxdesign/core/Stat';
export type {
  StatProps,
  StatDelta,
  StatDeltaDirection,
  StatDeltaSentiment,
  StatSize,
} from '@astryxdesign/core/Stat';
