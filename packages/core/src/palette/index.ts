// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input None
 * @output The public palette API: `themePalette()`, the generator, and their
 *   types
 * @position Entry of `@astryxdesign/core/palette`. It is its own entry, so an
 *   app that never imports it ships no generator code
 */

export {
  COMPACT_11_STOPS,
  DEFAULT_21_STOPS,
  PALETTE_BLACK,
  PALETTE_RECIPE,
  PALETTE_RECIPE_V2,
  PALETTE_RECIPES,
  PALETTE_WHITE,
  generateTonalPalette,
} from './generator';
export {themePalette} from './themePalette';
export type {
  TonalPaletteAnchor,
  TonalPaletteCandidate,
  TonalPaletteCoordinationDiagnostics,
  TonalPaletteDarkChromaTaper,
  TonalPaletteFamilyInput,
  TonalPaletteGenerationInput,
  TonalPaletteNormalizedRequest,
  TonalPaletteRampDiagnostics,
  PaletteLift,
  ThemePalette,
  ThemePaletteInput,
} from './types';
