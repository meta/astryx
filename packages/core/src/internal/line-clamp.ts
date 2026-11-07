// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file line-clamp.ts
 * @input Core's canonical focusable selector and the shared mutation observer
 * @output `@astryxdesign/core/internal/line-clamp`: FOCUSABLE_SELECTOR,
 *   observeMutations, flushMutations, TruncationTooltip and
 *   useTruncationTooltipInterest, re-exported by name for Lab's LineClamp
 * @position An internal entry reserved for Astryx's own packages:
 *   undocumented, outside the public API and its compatibility promise,
 *   versioned in lockstep with Core, and allowed only in Core and Lab by the
 *   `@astryx/no-core-internal-import` lint rule. Core components import the
 *   same modules by relative path. Named re-exports only.
 *
 * SYNC: When modified, update scripts/sync-exports.js.
 */
export {FOCUSABLE_SELECTOR} from '../hooks/focusableSelector';
export {
  flushMutations,
  observeMutations,
} from '../utils/sharedMutationObserver';
export {
  TruncationTooltip,
  useTruncationTooltipInterest,
} from '../Text/TruncationTooltip';
