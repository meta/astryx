// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file virtualization.ts
 * @input The private list-windowing module (`virtualization/`)
 * @output `@astryxdesign/core/internal/virtualization`: the shared list
 *   window hook, its pure range and anchor math and its measurement helpers,
 *   re-exported by name for Lab
 * @position An internal entry reserved for Astryx's own packages. It is
 *   undocumented, outside the public API and its compatibility promise, and
 *   versioned in lockstep with Core. The `@astryx/no-core-internal-import`
 *   lint rule allows it only in Core and Lab. Core components import the
 *   module by relative path.
 *
 * SYNC: When modified, update scripts/sync-exports.js.
 */
export {
  calculateListWindow,
  createListWindowSegments,
  isPositiveFinite,
  reconcileListAnchor,
  type ListAnchorOptions,
  type ListWindowOptions,
  type ListWindowPlan,
  type ListWindowSegment,
} from '../virtualization/listWindow';
export {measureText, readPixels} from '../virtualization/measure';
export {
  useListWindow,
  type ListWindowGeometry,
  type ListWindowGeometrySource,
  type ListWindowKey,
  type ListWindowPitch,
  type ListWindowResult,
  type UseListWindowOptions,
} from '../virtualization/useListWindow';
