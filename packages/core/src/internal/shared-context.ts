// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file shared-context.ts
 * @input Core's shared React context helper
 * @output `@astryxdesign/core/internal/shared-context`: createSharedContext,
 *   re-exported by name for Lab components
 * @position An internal entry reserved for Astryx's own packages:
 *   undocumented, outside the public API and its compatibility promise,
 *   versioned in lockstep with Core, and allowed only in Core and Lab by the
 *   `@astryx/no-core-internal-import` lint rule. Core components import the
 *   same module by relative path. Named re-exports only.
 *
 * SYNC: When modified, update scripts/sync-exports.js.
 */
export {createSharedContext} from '../utils/sharedContext';
