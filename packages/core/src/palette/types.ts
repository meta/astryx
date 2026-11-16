// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file types.ts
 * @input None
 * @output The request, candidate and diagnostics shapes of the tonal palette
 *   generator
 * @position Public types of `@astryxdesign/core/palette`
 */

/**
 * A color an author pins at one stop of one mode, constraining generation.
 */
export interface TonalPaletteAnchor {
  /** Mode containing the anchored stop. */
  mode: 'light' | 'dark';
  /** Existing requested stop where the anchor applies. */
  stop: number;
  /** sRGB hex the stop is pulled toward: three or six digits, with or without `#`; the generator normalizes it. */
  color: string;
  /** `exact` preserves the chosen color at that stop; `bounded` permits adjustment within `maxDeltaE`; `flexible` treats the color as guidance and blends toward it. */
  policy: 'exact' | 'bounded' | 'flexible';
  /** Required non-negative perceptual-distance limit for a `bounded` anchor. */
  maxDeltaE?: number;
}

/**
 * One requested family: a seed color and the constraints applied to its ramp.
 */
export interface TonalPaletteFamilyInput {
  /** Lower-kebab-case key for the family in the generated palette. `black` and `white` are reserved for the standalone values. */
  id: string;
  /** sRGB hex the ramp is generated from: three or six digits, with or without `#`; the generator normalizes it. */
  seed: string;
  /** Display name for review artifacts; defaults to `id`. */
  name?: string;
  /** `neutral` derives the ramp from `neutralProfile` instead of the seed hue; defaults to `chromatic`. */
  kind?: 'chromatic' | 'neutral';
  /** Colors pinned at specific stops. */
  anchors?: TonalPaletteAnchor[];
}

/**
 * Mutes the dark edge of every chromatic family. Their dark ramps keep
 * `edgeMultiplier` of their in-gamut chroma through `throughStop`, then
 * recover along a smoothstep to the standard recipe at `recoverAtStop`. Light
 * ramps, neutral families, and the black and white endpoints do not change.
 */
export interface TonalPaletteDarkChromaTaper {
  /** Share of chroma, from 0 to 1, that the dark edge keeps. */
  edgeMultiplier: number;
  /** Last stop that takes the full edge multiplier; must be a requested stop. */
  throughStop: number;
  /** First stop back on the standard recipe; must be a requested stop after `throughStop`. */
  recoverAtStop: number;
  /** Edge multipliers, from 0 to 1, by chromatic family id, in place of `edgeMultiplier`. */
  familyMultipliers?: Record<string, number>;
}

export interface TonalPaletteGenerationInput {
  /** The recipe to run: astryx-oklch-v1 when none is named, so a request or config made before v2 keeps its colors; astryx-oklch-v2 makes pale stops follow the vibrancy and the seed's own chroma. New palettes name v2 (the theme editor records it); a config pins its recipe by naming it. */
  recipe?: 'astryx-oklch-v1' | 'astryx-oklch-v2';
  families: TonalPaletteFamilyInput[];
  /** Chroma control from 0 (most muted) through 50 (default) to 100 (most vivid). */
  vibrancy?: number;
  /** Hue treatment for `neutral` families: `neutral-v1` is fully achromatic, `warm-v1` and `cool-v1` add a slight tint, and `custom` derives the hue from the family's own seed. Defaults to `neutral-v1`. */
  neutralProfile?: 'neutral-v1' | 'warm-v1' | 'cool-v1' | 'custom';
  modeStrategy?: 'light-only' | 'dark-only' | 'light-and-dark';
  /** Mutes the dark edge of the chromatic families. */
  darkChromaTaper?: TonalPaletteDarkChromaTaper;
  /** Ordered stops shared by every requested family; defaults to 0 through 100 in increments of 5. Decimal stops are supported, and authors may omit the repeated black and white endpoints. */
  stops?: number[];
}

/**
 * A generated palette candidate. The palette is still subject to author review
 * and is not connected to runtime theme values.
 */
export interface TonalPaletteCandidate {
  schemaVersion: 1;
  status: 'candidate';
  recipe: 'astryx-oklch-v1' | 'astryx-oklch-v2';
  /** Exact solid black for theme authoring outside a tonal family. */
  black: '#000000';
  /** Exact solid white for theme authoring outside a tonal family. */
  white: '#ffffff';
  /** Canonical order for iterating the palette's stop lookup maps. */
  stops: number[];
  palette: Record<
    string,
    {
      name: string;
      light?: Record<string, string>;
      dark?: Record<string, string>;
    }
  >;
}

/**
 * Per-ramp evidence recorded for one family in one mode.
 */
export interface TonalPaletteRampDiagnostics {
  /** Whether luminance rises across every stop. */
  monotonic: boolean;
  /** Smallest perceptual gap between neighboring stops; a small value means two stops read as one color. */
  minimumAdjacentDeltaE: number;
  /** Largest gap between neighboring stops. */
  maximumAdjacentDeltaE: number;
  /** Largest hue distance, in degrees, between a stop and the family's reference hue. */
  maximumHueDrift: number;
  /** Named drift the ramp is at risk of, or `null`. */
  hueIdentityRisk: 'blue-to-purple' | 'yellow-to-brown' | null;
  /** Stops whose ideal color fell outside sRGB and was mapped back into it. */
  gamutMappedStops: number[];
  /** Each anchor with the color the stop received after its policy was applied and the perceptual distance that color still has from the requested target. */
  anchors: (TonalPaletteAnchor & {generatedColor: string; deltaE: number})[];
}

/**
 * Cross-family evidence for one mode, sampled at the stop nearest 50.
 */
export interface TonalPaletteCoordinationDiagnostics {
  /** Mode these samples come from. */
  mode: 'light' | 'dark';
  /** Sampled stop. */
  stop: number;
  /** The two chromatic families hardest to tell apart, or `null` with fewer than two. */
  closestFamilies: [string, string] | null;
  /** Perceptual distance between them. */
  minimumFamilyDeltaE: number | null;
  /** Most saturated family at this stop. */
  strongestFamily: string | null;
  /** Least saturated family at this stop. */
  weakestFamily: string | null;
  /** Strongest chroma over weakest; a large ratio means the families are unbalanced. */
  chromaRatio: number | null;
}

/**
 * The request as the generator resolved it, with every default filled in.
 */
export interface TonalPaletteNormalizedRequest {
  recipe: 'astryx-oklch-v1' | 'astryx-oklch-v2';
  vibrancy: number;
  neutralProfile: 'neutral-v1' | 'warm-v1' | 'cool-v1' | 'custom';
  modeStrategy: 'light-only' | 'dark-only' | 'light-and-dark';
  /** The requested taper, with `familyMultipliers` filled in; present only when the request has a taper. */
  darkChromaTaper?: Required<TonalPaletteDarkChromaTaper>;
  stops: number[];
  families: {
    id: string;
    name: string;
    seed: string;
    kind: 'chromatic' | 'neutral';
    anchors: TonalPaletteAnchor[];
  }[];
}
