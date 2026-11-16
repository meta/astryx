// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input None
 * @output The public tonal palette API: the generator and its types
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
export type {
  TonalPaletteAnchor,
  TonalPaletteCandidate,
  TonalPaletteCoordinationDiagnostics,
  TonalPaletteDarkChromaTaper,
  TonalPaletteFamilyInput,
  TonalPaletteGenerationInput,
  TonalPaletteNormalizedRequest,
  TonalPaletteRampDiagnostics,
} from './types';
