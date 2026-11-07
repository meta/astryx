// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file clipboard-copy.ts
 * @input Core's internal clipboard hook
 * @output `@astryxdesign/core/internal/clipboard-copy`: `useClipboardCopy`,
 *   for Astryx's own packages
 * @position An internal entry reserved for Astryx's own packages:
 *   undocumented, outside the public API and its compatibility promise,
 *   versioned in lockstep with Core, and allowed only in Core and Lab by the
 *   `@astryx/no-core-internal-import` lint rule. Lab's Comments copies a
 *   comment link through it, so every copy button shares one failure state.
 *   Named re-exports only.
 *
 * SYNC: When modified, update clipboard-copy.test.ts and
 * scripts/sync-exports.js.
 */
export {useClipboardCopy} from '../hooks/useClipboard';
export type {
  UseClipboardCopyOptions,
  UseClipboardCopyReturn,
} from '../hooks/useClipboard';
