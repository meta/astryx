// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file spinner-rotor.ts
 * @input Spinner's shared rotor
 * @output `@astryxdesign/core/internal/spinner-rotor`: SPINNER_ARC_FRACTION,
 *   spinnerRotorStyles and syncRotationPhase, re-exported by name for Lab's
 *   indeterminate CircularProgress
 * @position An internal entry reserved for Astryx's own packages. It is
 *   undocumented, outside the public API and its compatibility promise, and
 *   versioned in lockstep with Core. The `@astryx/no-core-internal-import`
 *   lint rule allows it only in Core and Lab. Core components import the
 *   same modules by relative path. Named re-exports only.
 *
 * SYNC: When modified, update scripts/sync-exports.js.
 */
export {
  SPINNER_ARC_FRACTION,
  spinnerRotorStyles,
  syncRotationPhase,
} from '../Spinner/spinnerRotor';
