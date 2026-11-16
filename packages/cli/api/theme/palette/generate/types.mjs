// Copyright (c) Meta Platforms, Inc. and affiliates.
// Generated from packages/core/src/palette/types.ts by
// scripts/generate-cli-palette-engine.mjs. Do not edit: change the Core
// source and run `pnpm generate:cli-palette-engine`.

/**
 * A color an author pins at one stop of one mode, constraining generation.
 * @typedef {object} TonalPaletteAnchor
 * @property {'light' | 'dark'} mode Mode containing the anchored stop.
 * @property {number} stop Existing requested stop where the anchor applies.
 * @property {string} color sRGB hex the stop is pulled toward: three or six digits, with or without `#`; the generator normalizes it.
 * @property {'exact' | 'bounded' | 'flexible'} policy `exact` preserves the chosen color at that stop; `bounded` permits adjustment within `maxDeltaE`; `flexible` treats the color as guidance and blends toward it.
 * @property {number} [maxDeltaE] Required non-negative perceptual-distance limit for a `bounded` anchor.
 */

/**
 * One requested family: a seed color and the constraints applied to its ramp.
 * @typedef {object} TonalPaletteFamilyInput
 * @property {string} id Lower-kebab-case key for the family in the generated palette. `black` and `white` are reserved for the standalone values.
 * @property {string} seed sRGB hex the ramp is generated from: three or six digits, with or without `#`; the generator normalizes it.
 * @property {string} [name] Display name for review artifacts; defaults to `id`.
 * @property {'chromatic' | 'neutral'} [kind] `neutral` derives the ramp from `neutralProfile` instead of the seed hue; defaults to `chromatic`.
 * @property {TonalPaletteAnchor[]} [anchors] Colors pinned at specific stops.
 */

/**
 * Mutes the dark edge of every chromatic family. Their dark ramps keep
 * `edgeMultiplier` of their in-gamut chroma through `throughStop`, then
 * recover along a smoothstep to the standard recipe at `recoverAtStop`. Light
 * ramps, neutral families, and the black and white endpoints do not change.
 * @typedef {object} TonalPaletteDarkChromaTaper
 * @property {number} edgeMultiplier Share of chroma, from 0 to 1, that the dark edge keeps.
 * @property {number} throughStop Last stop that takes the full edge multiplier; must be a requested stop.
 * @property {number} recoverAtStop First stop back on the standard recipe; must be a requested stop after `throughStop`.
 * @property {Record<string, number>} [familyMultipliers] Edge multipliers, from 0 to 1, by chromatic family id, in place of `edgeMultiplier`.
 */

/**
 * @typedef {object} TonalPaletteGenerationInput
 * @property {'astryx-oklch-v1' | 'astryx-oklch-v2'} [recipe] The recipe to run: astryx-oklch-v1 when none is named, so a request or config made before v2 keeps its colors; astryx-oklch-v2 makes pale stops follow the vibrancy and the seed's own chroma. New palettes name v2 (the theme editor records it); a config pins its recipe by naming it.
 * @property {TonalPaletteFamilyInput[]} families
 * @property {number} [vibrancy] Chroma control from 0 (most muted) through 50 (default) to 100 (most vivid).
 * @property {'neutral-v1' | 'warm-v1' | 'cool-v1' | 'custom'} [neutralProfile] Hue treatment for `neutral` families: `neutral-v1` is fully achromatic, `warm-v1` and `cool-v1` add a slight tint, and `custom` derives the hue from the family's own seed. Defaults to `neutral-v1`.
 * @property {'light-only' | 'dark-only' | 'light-and-dark'} [modeStrategy]
 * @property {TonalPaletteDarkChromaTaper} [darkChromaTaper] Mutes the dark edge of the chromatic families.
 * @property {number[]} [stops] Ordered stops shared by every requested family; defaults to 0 through 100 in increments of 5. Decimal stops are supported, and authors may omit the repeated black and white endpoints.
 */

/**
 * A generated palette candidate. The palette is still subject to author review
 * and is not connected to runtime theme values.
 * @typedef {object} TonalPaletteCandidate
 * @property {1} schemaVersion
 * @property {'candidate'} status
 * @property {'astryx-oklch-v1' | 'astryx-oklch-v2'} recipe
 * @property {'#000000'} black Exact solid black for theme authoring outside a tonal family.
 * @property {'#ffffff'} white Exact solid white for theme authoring outside a tonal family.
 * @property {number[]} stops Canonical order for iterating the palette's stop lookup maps.
 * @property {Record< string, { name: string; light?: Record<string, string>; dark?: Record<string, string>; } >} palette
 */

/**
 * Per-ramp evidence recorded for one family in one mode.
 * @typedef {object} TonalPaletteRampDiagnostics
 * @property {boolean} monotonic Whether luminance rises across every stop.
 * @property {number} minimumAdjacentDeltaE Smallest perceptual gap between neighboring stops; a small value means two stops read as one color.
 * @property {number} maximumAdjacentDeltaE Largest gap between neighboring stops.
 * @property {number} maximumHueDrift Largest hue distance, in degrees, between a stop and the family's reference hue.
 * @property {'blue-to-purple' | 'yellow-to-brown' | null} hueIdentityRisk Named drift the ramp is at risk of, or `null`.
 * @property {number[]} gamutMappedStops Stops whose ideal color fell outside sRGB and was mapped back into it.
 * @property {(TonalPaletteAnchor & {generatedColor: string; deltaE: number})[]} anchors Each anchor with the color the stop received after its policy was applied and the perceptual distance that color still has from the requested target.
 */

/**
 * Cross-family evidence for one mode, sampled at the stop nearest 50.
 * @typedef {object} TonalPaletteCoordinationDiagnostics
 * @property {'light' | 'dark'} mode Mode these samples come from.
 * @property {number} stop Sampled stop.
 * @property {[string, string] | null} closestFamilies The two chromatic families hardest to tell apart, or `null` with fewer than two.
 * @property {number | null} minimumFamilyDeltaE Perceptual distance between them.
 * @property {string | null} strongestFamily Most saturated family at this stop.
 * @property {string | null} weakestFamily Least saturated family at this stop.
 * @property {number | null} chromaRatio Strongest chroma over weakest; a large ratio means the families are unbalanced.
 */

/**
 * The request as the generator resolved it, with every default filled in.
 * @typedef {object} TonalPaletteNormalizedRequest
 * @property {'astryx-oklch-v1' | 'astryx-oklch-v2'} recipe
 * @property {number} vibrancy
 * @property {'neutral-v1' | 'warm-v1' | 'cool-v1' | 'custom'} neutralProfile
 * @property {'light-only' | 'dark-only' | 'light-and-dark'} modeStrategy
 * @property {Required<TonalPaletteDarkChromaTaper>} [darkChromaTaper] The requested taper, with `familyMultipliers` filled in; present only when the request has a taper.
 * @property {number[]} stops
 * @property {{ id: string; name: string; seed: string; kind: 'chromatic' | 'neutral'; anchors: TonalPaletteAnchor[]; }[]} families
 */

export {};
