// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input Imports from useRefreshControl
 * @output Exports useRefreshControl, its types and the reveal's custom
 *   property
 * @position Entry point for Lab's pull to refresh; re-exported by
 *   /packages/lab/src/index.ts
 */

export {REFRESH_REVEAL_VAR, useRefreshControl} from './useRefreshControl';
export type {
  UseRefreshControlOptions,
  UseRefreshControlResult,
} from './useRefreshControl';
