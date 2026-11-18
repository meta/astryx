// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file page-scroller.ts
 * @input Core's page-scroller owner module
 * @output `@astryxdesign/core/internal/page-scroller`: scrollsPage,
 *   scrollportTop and scrollEventTarget, re-exported by name for Lab
 * @position An internal entry reserved for Astryx's own packages:
 *   undocumented, outside the public API and its compatibility promise,
 *   versioned in lockstep with Core, and allowed only in Core and Lab by the
 *   `@astryx/no-core-internal-import` lint rule. Core components import the
 *   owner module by relative path. Named re-exports only.
 *
 * SYNC: When modified, update scripts/sync-exports.js.
 */
export {
  scrollEventTarget,
  scrollportTop,
  scrollsPage,
} from '../utils/pageScroller';
