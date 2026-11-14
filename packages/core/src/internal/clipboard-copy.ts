// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file clipboard-copy.ts
 * @input Core's clipboard hook with its failed-write state
 * @output `@astryxdesign/core/internal/clipboard-copy`: useClipboardCopy and
 *   its option and return types, re-exported by name for Lab components
 * @position An internal entry reserved for Astryx's own packages:
 *   undocumented, outside the public API and its compatibility promise,
 *   versioned in lockstep with Core, and allowed only in Core and Lab by the
 *   `@astryx/no-core-internal-import` lint rule. Core components import the
 *   same module by relative path. Named re-exports only.
 *
 * SYNC: When modified, update scripts/sync-exports.js.
 */
export {
  useClipboardCopy,
  type UseClipboardCopyOptions,
  type UseClipboardCopyReturn,
} from '../hooks/useClipboard';
