// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file scroll-anchoring.ts
 * @input The scroll-anchoring owner module
 * @output `@astryxdesign/core/internal/scroll-anchoring`: setScrollAnchoringOff,
 *   re-exported by name for Lab
 * @position An internal entry reserved for Astryx's own packages. It is
 *   undocumented, outside the public API and its compatibility promise, and
 *   versioned in lockstep with Core. The `@astryx/no-core-internal-import`
 *   lint rule allows it only in Core and Lab. Core components import the
 *   owner module by relative path. Named re-exports only: the writer, never
 *   the attribute's name.
 *
 * SYNC: When modified, update scripts/sync-exports.js.
 */
export {setScrollAnchoringOff} from '../privateAttributes/scrollAnchoring.stylex';
