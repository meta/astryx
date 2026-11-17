// Copyright (c) Meta Platforms, Inc. and affiliates.
// Generated from packages/core/src/palette/generator.ts by
// scripts/generate-cli-palette-engine.mjs. Do not edit: change the Core
// source and run `pnpm generate:cli-palette-engine`.
/**
 * @file generator.ts
 * @input A tonal palette request: families with seeds, anchors, vibrancy,
 *   neutral profile, mode strategy, stops, recipe
 * @output Deterministic candidate palettes with per-ramp and cross-family
 *   diagnostics
 * @position The one tonal palette engine. `defineTheme({palette})` and the
 *   CLI palette command both run it; the CLI holds a generated copy
 */
import {
  hexToOklch,
  luminance,
  maxOklchChroma,
  normalizeColor,
  oklabCoordinates,
  oklabCoordinatesToHex,
  oklchClampedHex,
  toneToOklabLightness,
} from './color.mjs';

/** @typedef {import('./types.mjs').TonalPaletteAnchor} TonalPaletteAnchor */

/** @typedef {import('./types.mjs').TonalPaletteCandidate} TonalPaletteCandidate */

/** @typedef {import('./types.mjs').TonalPaletteCoordinationDiagnostics} TonalPaletteCoordinationDiagnostics */

/** @typedef {import('./types.mjs').TonalPaletteGenerationInput} TonalPaletteGenerationInput */

/** @typedef {import('./types.mjs').TonalPaletteNormalizedRequest} NormalizedRequest */

/** @typedef {import('./types.mjs').TonalPaletteRampDiagnostics} TonalPaletteRampDiagnostics */

/** @typedef {[number, number, number]} ColorTriple */

/** @typedef {'light' | 'dark'} PaletteMode */

/** @typedef {{lightness: number; chroma: number; hue: number}} PolarColor */

/** @typedef {TonalPaletteAnchor & { color: string; generatedColor: string; deltaE: number; }} AnchorResult */

/** @typedef {{ colors: Record<number, string>; diagnostics: TonalPaletteRampDiagnostics; }} GeneratedRamp */

/** @typedef {{ id: string; name: string; seed: string; kind: 'chromatic' | 'neutral'; anchors: TonalPaletteAnchor[]; }} NormalizedFamily */

/** @typedef {{ id: string; name: string; seed: string; light?: GeneratedRamp; dark?: GeneratedRamp; }} GeneratedFamily */

/** @typedef {{ recipe: PaletteRecipe; status: 'candidate'; request: NormalizedRequest; families: GeneratedFamily[]; coordination: TonalPaletteCoordinationDiagnostics[]; errors: {familyId: string; message: string}[]; }} PaletteGenerationResult */

/** @typedef {'astryx-oklch-v1' | 'astryx-oklch-v2' | 'astryx-oklch-v3'} PaletteRecipe */

/** The recipe a request that names none runs: the first one. */
export const PALETTE_RECIPE = 'astryx-oklch-v1';
/**
 * The recipe whose pale stops follow the vibrancy and the seed's own
 * chroma: a stop whose gamut cannot hold the most vivid request gives every
 * request the same share of it, and coordination never raises a seed's
 * chroma. A request runs it by naming it.
 */
export const PALETTE_RECIPE_V2 = 'astryx-oklch-v2';
/**
 * v2, and a dusty seed's pale tints stay at or below its own chroma even
 * where the gamut is wide, so a muted olive gives an earthy tint, not
 * chartreuse. The newest recipe: new palettes name it.
 */
export const PALETTE_RECIPE_V3 = 'astryx-oklch-v3';
/** The recipe new palettes name. */
export const PALETTE_RECIPE_NEWEST = PALETTE_RECIPE_V3;
/** Every recipe the generator runs. */
export const PALETTE_RECIPES = Object.freeze([
  PALETTE_RECIPE,
  PALETTE_RECIPE_V2,
  PALETTE_RECIPE_V3,
]);
/**
 * Whether a recipe shares the pale side of the gamut and fades a gray's
 * pale stops (v2, and v3 after it).
 * @param {string} recipe
 */
function sharesGamut(recipe) {
  return recipe === PALETTE_RECIPE_V2 || recipe === PALETTE_RECIPE_V3;
}
/**
 * Identity of this generator implementation. `PALETTE_RECIPE` names the
 * normative algorithm; this names the code that ran it, so a receipt can tell
 * two implementations of one recipe apart.
 */
export const PALETTE_GENERATOR_VERSION = 'palette-generator-v1';
export const PALETTE_BLACK = '#000000';
export const PALETTE_WHITE = '#ffffff';
export const DEFAULT_21_STOPS = Object.freeze([
  0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95,
  100,
]);
export const COMPACT_11_STOPS = Object.freeze([
  0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
]);
const DARK_CHROMA_FACTOR = 0.85;
const RESERVED_FAMILY_IDS = new Set(['black', 'white']);
const NEUTRAL_PROFILES = ['neutral-v1', 'warm-v1', 'cool-v1', 'custom'];
/**
 * @param {number} value
 * @param {number} minimum
 * @param {number} maximum
 */
function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
/**
 * @param {number} hue
 */
function normalizeHue(hue) {
  return ((hue % 360) + 360) % 360;
}
/**
 * @param {number} a
 * @param {number} b
 */
function hueDistance(a, b) {
  const difference = Math.abs(normalizeHue(a) - normalizeHue(b));
  return Math.min(difference, 360 - difference);
}
/**
 * @param {number} from
 * @param {number} to
 */
function signedHueDelta(from, to) {
  return ((normalizeHue(to) - normalizeHue(from) + 540) % 360) - 180;
}
/**
 * @param {number} a
 * @param {number} b
 * @param {number} amount
 */
function interpolateHue(a, b, amount) {
  const delta = ((b - a + 540) % 360) - 180;
  return normalizeHue(a + delta * amount);
}
/**
 * @param {readonly number[]} stops
 * @returns {number[]}
 */
export function validateStops(stops) {
  if (!Array.isArray(stops) || stops.length === 0) {
    throw new Error('A palette requires at least one stop.');
  }
  for (const stop of stops) {
    if (!Number.isFinite(stop) || stop < 0 || stop > 100) {
      throw new Error(
        `Stop ${String(stop)} must be a finite number from 0 to 100.`,
      );
    }
  }
  for (let index = 1; index < stops.length; index++) {
    if (stops[index] <= stops[index - 1]) {
      throw new Error('Stops must be unique and strictly increasing.');
    }
  }
  return [...stops];
}
/**
 * @param {unknown} input
 * @returns {number[]}
 */
export function parseStopList(input) {
  const values = String(input)
    .split(',')
    .map(value => value.trim());
  if (values.some(value => value === '' || !Number.isFinite(Number(value)))) {
    throw new Error('Every custom stop must be a number from 0 to 100.');
  }
  return validateStops(values.map(Number));
}
/**
 * The fields the generator reads from a request, a family and an anchor
 * (see TonalPaletteGenerationInput); any other field changes nothing.
 */
export const GENERATION_INPUT_KEYS = Object.freeze([
  'recipe',
  'vibrancy',
  'neutralProfile',
  'modeStrategy',
  'darkChromaTaper',
  'stops',
  'families',
]);
const DARK_CHROMA_TAPER_KEYS = Object.freeze([
  'edgeMultiplier',
  'throughStop',
  'recoverAtStop',
  'familyMultipliers',
]);
export const FAMILY_INPUT_KEYS = Object.freeze([
  'id',
  'name',
  'seed',
  'kind',
  'anchors',
]);
export const ANCHOR_INPUT_KEYS = Object.freeze([
  'mode',
  'stop',
  'color',
  'policy',
  'maxDeltaE',
]);
/**
 * The modes a mode strategy generates.
 * @param {string} strategy
 * @returns {PaletteMode[]}
 */
export function modesForStrategy(strategy) {
  if (strategy === 'light-only') return ['light'];
  if (strategy === 'dark-only') return ['dark'];
  if (strategy === 'light-and-dark') return ['light', 'dark'];
  throw new Error(`Unknown mode strategy: ${String(strategy)}`);
}
/**
 * @param {number} hue
 */
function hueBalanceFactor(hue) {
  const normalized = normalizeHue(hue);
  if (normalized >= 70 && normalized < 115) return 0.94;
  if (normalized >= 115 && normalized < 175) return 0.78;
  if (normalized >= 175 && normalized < 230) return 0.82;
  if (normalized >= 285 && normalized < 340) return 0.9;
  return 1;
}
/**
 * @param {number} hue
 * @param {number} tone
 */
function highToneChromaFactor(hue, tone) {
  if (tone <= 60) return 1;
  const taper = smoothstep((tone - 60) / 35);
  const normalized = normalizeHue(hue);
  if (normalized >= 115 && normalized < 175) return 1 - 0.28 * taper;
  if (normalized >= 175 && normalized < 200) return 1 - 0.4 * taper;
  return 1;
}
/**
 * @param {number} hue
 * @param {number} tone
 */
function toneAdjustedHue(hue, tone) {
  const normalized = normalizeHue(hue);
  if (normalized < 40 || normalized >= 70 || tone >= 50) return normalized;
  const darkening = clamp((50 - tone) / 40, 0, 1);
  return normalizeHue(normalized - 8 * Math.sqrt(darkening));
}
/**
 * @param {number} tone
 */
function toneChromaEnvelope(tone) {
  const normalized = clamp(tone / 100, 0, 1);
  return 0.18 + 0.82 * Math.sqrt(Math.max(0, Math.sin(Math.PI * normalized)));
}
/**
 * @param {number} vibrancy
 */
function vibrancyMultiplier(vibrancy) {
  if (!Number.isFinite(vibrancy) || vibrancy < 0 || vibrancy > 100) {
    throw new Error('Vibrancy must be a number from 0 to 100.');
  }
  if (vibrancy <= 25) return (vibrancy / 25) * 0.72;
  if (vibrancy <= 50) return 0.72 + ((vibrancy - 25) / 25) * 0.28;
  return 1 + (vibrancy - 50) * 0.0096;
}
/**
 * A family's chroma drawn toward the shared one, so its families sit
 * together. As v2 shares a narrow stop's gamut it is never raised above the
 * seed's own, so a dusty seed stays dusty in its pale stops.
 * @param {number} sourceChroma
 * @param {PaletteRecipe} [recipe=PALETTE_RECIPE]
 */
function coordinatedChroma(sourceChroma, recipe = PALETTE_RECIPE) {
  const drawn = sourceChroma * 0.35 + 0.18 * 0.65;
  return sharesGamut(recipe) ? Math.min(sourceChroma, drawn) : drawn;
}
/**
 * How narrow a stop's gamut is for v2 to share it: the most vivid seed at
 * the default vibrancy asks this many times what the stop holds. From the
 * first the stop starts to share its gamut in proportion; from the second
 * it shares it wholly.
 */
const V2_SHARED_FROM = 1.3;
/**
 * From this tone v3 starts to draw a tint at the seed's own chroma; by
 * V3_PALE_FROM + V3_PALE_SPAN it draws it wholly. The middle of a ramp, up
 * to tone 70, stays as v1 draws it.
 */
const V3_PALE_FROM = 70;
const V3_PALE_SPAN = 15;
/** v2 shares only stops lighter than this tone: the pale side of a ramp. */
const V2_SHARED_ABOVE = 50;
const V2_SHARED_FULL = 2;
/**
 * The share of its chroma a v2 gray family keeps at a lightness: all of it
 * up to GRAY_FADE_FROM, then less, linearly, to GRAY_FADE_LEAST at
 * GRAY_FADE_TO and above, as gray scales fade their tint toward white (a
 * slate's palest grays keep about a sixth of its color).
 * @param lightness OKLab lightness
 * @param {number} lightness
 */
function grayFade(lightness) {
  const t = clamp(
    (lightness - GRAY_FADE_FROM) / (GRAY_FADE_TO - GRAY_FADE_FROM),
    0,
    1,
  );
  return 1 - (1 - GRAY_FADE_LEAST) * t;
}
const GRAY_FADE_FROM = 0.7;
const GRAY_FADE_TO = 0.97;
const GRAY_FADE_LEAST = 0.28;
/** The chroma of the most vivid seed sRGB holds, as v2 coordinates it. */
const MOST_VIVID_CHROMA = coordinatedChroma(0.32, PALETTE_RECIPE_V2);
/**
 * @param {string} color
 * @returns {PolarColor}
 */
function colorToPolar(color) {
  const value = hexToOklch(color);
  return {lightness: value.L, chroma: value.C, hue: value.H};
}
/**
 * @param {string} profile
 * @param {string} seed
 * @returns {PolarColor}
 */
function neutralPolar(profile, seed) {
  if (profile === 'custom') return colorToPolar(seed);
  const hue = profile === 'warm-v1' ? 75 : profile === 'cool-v1' ? 250 : 0;
  if (!['neutral-v1', 'warm-v1', 'cool-v1'].includes(profile)) {
    throw new Error(`Unknown neutral profile: ${String(profile)}`);
  }
  return {
    lightness: 0.5,
    chroma: profile === 'neutral-v1' ? 0 : 0.018,
    hue,
  };
}
/**
 * @param {PolarColor} seed
 * @param {TonalPaletteAnchor[]} anchors
 * @param {number} stop
 * @returns {PolarColor}
 */
function anchorPolarAtStop(seed, anchors, stop) {
  if (anchors.length === 0) return seed;
  const sorted = [...anchors].sort((a, b) => a.stop - b.stop);
  const lower = [...sorted].reverse().find(anchor => anchor.stop <= stop);
  const upper = sorted.find(anchor => anchor.stop >= stop);
  if (!lower || !upper || lower.stop === upper.stop) {
    return colorToPolar(normalizeColor((lower ?? upper ?? sorted[0]).color));
  }
  const start = colorToPolar(normalizeColor(lower.color));
  const end = colorToPolar(normalizeColor(upper.color));
  const amount = (stop - lower.stop) / (upper.stop - lower.stop);
  return {
    lightness: start.lightness + (end.lightness - start.lightness) * amount,
    chroma: start.chroma + (end.chroma - start.chroma) * amount,
    hue: interpolateHue(start.hue, end.hue, amount),
  };
}
/**
 * @param [chromaMultiplier] Share of its in-gamut chroma the stop
 * keeps (see darkChromaMultiplier).
 * @param {PolarColor} source
 * @param {number} tone
 * @param {PaletteMode} mode
 * @param {number} vibrancy
 * @param {boolean} coordinateWithOtherFamilies
 * @param {number} [chromaMultiplier=1]
 * @param {PaletteRecipe} [recipe=PALETTE_RECIPE]
 */
function generateCandidate(
  source,
  tone,
  mode,
  vibrancy,
  coordinateWithOtherFamilies,
  chromaMultiplier = 1,
  recipe = PALETTE_RECIPE,
) {
  const adjustedTone = tone;
  const adjustedHue = toneAdjustedHue(source.hue, adjustedTone);
  // Every recipe starts from v1's chroma, so a stop v2 does not share is
  // drawn exactly as v1 draws it, the middle of a ramp included. In v3 a
  // pale tint (above V3_PALE_FROM) moves to the seed's own chroma, which
  // coordination never raises: a dusty seed's tints stay dusty.
  const pale =
    recipe === PALETTE_RECIPE_V3
      ? smoothstep((adjustedTone - V3_PALE_FROM) / V3_PALE_SPAN)
      : 0;
  const baseChroma = coordinateWithOtherFamilies
    ? (1 - pale) * coordinatedChroma(source.chroma) +
      pale * coordinatedChroma(source.chroma, recipe)
    : source.chroma;
  let chroma =
    baseChroma *
    vibrancyMultiplier(vibrancy) *
    hueBalanceFactor(adjustedHue) *
    highToneChromaFactor(adjustedHue, adjustedTone) *
    toneChromaEnvelope(adjustedTone) *
    (mode === 'dark' ? DARK_CHROMA_FACTOR : 1);
  const lightness = toneToOklabLightness(adjustedTone);
  const maxChroma = maxOklchChroma(adjustedHue, lightness);
  // v2: a gray family's color fades toward white the way a gray scale's
  // does, so its pale stops (a page, a card on it) carry only a faint tint
  // of its hue; its darker stops keep their color.
  if (sharesGamut(recipe) && !coordinateWithOtherFamilies)
    chroma *= grayFade(lightness);
  // v2, on the pale side of a ramp (above its middle): the narrower a
  // stop's gamut is for the most vivid seed at the default vibrancy (a pale
  // tint), the more every request shares that gamut in proportion (the most
  // vivid seed at vibrancy 100 takes all of it), so such a stop follows the
  // seed's chroma, never raised above the seed's own, and the vibrancy,
  // instead of every request landing on the gamut's edge. A stop whose
  // gamut holds the most vivid seed at the default vibrancy shares nothing,
  // and the dark side never shares (role text and dark fills keep their
  // strength): those stops are drawn exactly as v1 draws them, for every
  // seed at every vibrancy.
  if (
    sharesGamut(recipe) &&
    coordinateWithOtherFamilies &&
    adjustedTone > V2_SHARED_ABOVE
  ) {
    const shape =
      hueBalanceFactor(adjustedHue) *
      highToneChromaFactor(adjustedHue, adjustedTone) *
      toneChromaEnvelope(adjustedTone) *
      (mode === 'dark' ? DARK_CHROMA_FACTOR : 1);
    const narrow =
      (MOST_VIVID_CHROMA * vibrancyMultiplier(50) * shape) /
      Math.max(maxChroma, 1e-6);
    const share = smoothstep(
      (narrow - V2_SHARED_FROM) / (V2_SHARED_FULL - V2_SHARED_FROM),
    );
    if (share > 0) {
      const most = MOST_VIVID_CHROMA * vibrancyMultiplier(100) * shape;
      const own =
        coordinatedChroma(source.chroma, recipe) *
        vibrancyMultiplier(vibrancy) *
        shape;
      const shared = (own / most) * maxChroma;
      chroma = (1 - share) * Math.min(chroma, maxChroma) + share * shared;
    }
  }
  // A taper scales the chroma the stop shows after gamut mapping, so a stop
  // the gamut already limits loses the same share as any other stop.
  const shownChroma =
    chromaMultiplier === 1
      ? chroma
      : Math.min(chroma, maxChroma) * chromaMultiplier;
  return {
    hex: oklchClampedHex(lightness, shownChroma, adjustedHue),
    gamutMapped: chroma > maxChroma + 0.000001,
  };
}
/**
 * @param {string} colorA
 * @param {string} colorB
 */
export function perceptualDelta(colorA, colorB) {
  const [lightnessA, aA, bA] = oklabCoordinates(colorA);
  const [lightnessB, aB, bB] = oklabCoordinates(colorB);
  return (
    Math.sqrt(
      (lightnessA - lightnessB) ** 2 + (aA - aB) ** 2 + (bA - bB) ** 2,
    ) * 100
  );
}
/**
 * @param {string} colorA
 * @param {string} colorB
 * @param {number} amount
 */
function interpolateColor(colorA, colorB, amount) {
  const start = hexToOklch(colorA);
  const end = hexToOklch(colorB);
  return oklchClampedHex(
    start.L + (end.L - start.L) * amount,
    start.C + (end.C - start.C) * amount,
    interpolateHue(start.H, end.H, amount),
  );
}
/**
 * @param {string} candidate
 * @param {TonalPaletteAnchor} anchor
 * @returns {AnchorResult}
 */
function applyAnchor(candidate, anchor) {
  const target = normalizeColor(anchor.color);
  let generatedColor = candidate;
  if (anchor.policy === 'exact') {
    generatedColor = target;
  } else if (anchor.policy === 'bounded') {
    const tolerance = Number(anchor.maxDeltaE);
    if (!Number.isFinite(tolerance) || tolerance < 0) {
      throw new Error(
        `Bounded anchor at stop ${anchor.stop} requires a non-negative maxDeltaE.`,
      );
    }
    if (perceptualDelta(candidate, target) > tolerance) {
      let low = 0;
      let high = 1;
      for (let index = 0; index < 18; index++) {
        const amount = (low + high) / 2;
        const mixed = interpolateColor(target, candidate, amount);
        if (perceptualDelta(mixed, target) <= tolerance) low = amount;
        else high = amount;
      }
      generatedColor = interpolateColor(target, candidate, low);
    }
  } else if (anchor.policy === 'flexible') {
    generatedColor = interpolateColor(candidate, target, 0.35);
  } else {
    throw new Error(`Unknown anchor policy: ${String(anchor.policy)}`);
  }
  return {
    ...anchor,
    color: target,
    generatedColor,
    deltaE: perceptualDelta(generatedColor, target),
  };
}
/**
 * @param {number} amount
 */
function smoothstep(amount) {
  const value = clamp(amount, 0, 1);
  return value * value * (3 - 2 * value);
}
/**
 * @param {ColorTriple} start
 * @param {ColorTriple} end
 * @param {number} amount
 * @returns {ColorTriple}
 */
function interpolateDelta(start, end, amount) {
  return [
    start[0] + (end[0] - start[0]) * amount,
    start[1] + (end[1] - start[1]) * amount,
    start[2] + (end[2] - start[2]) * amount,
  ];
}
/**
 * @param {{stop: number; delta: ColorTriple}[]} corrections
 * @param {number} stop
 * @returns {ColorTriple}
 */
function correctionAtStop(corrections, stop) {
  /**
   * @type {ColorTriple}
   */
  const zero = [0, 0, 0];
  if (corrections.length === 0) return zero;
  const first = corrections[0];
  if (stop <= first.stop) {
    const boundary = Math.max(0, first.stop - 25);
    if (stop <= boundary && boundary !== first.stop) return zero;
    const amount =
      boundary === first.stop
        ? 1
        : smoothstep((stop - boundary) / (first.stop - boundary));
    return interpolateDelta(zero, first.delta, amount);
  }
  const last = corrections[corrections.length - 1];
  if (stop >= last.stop) {
    const boundary = Math.min(100, last.stop + 25);
    if (stop >= boundary && boundary !== last.stop) return zero;
    const amount =
      boundary === last.stop
        ? 1
        : smoothstep((stop - last.stop) / (boundary - last.stop));
    return interpolateDelta(last.delta, zero, amount);
  }
  const upperIndex = corrections.findIndex(item => item.stop > stop);
  const lower = corrections[upperIndex - 1];
  const upper = corrections[upperIndex];
  return interpolateDelta(
    lower.delta,
    upper.delta,
    smoothstep((stop - lower.stop) / (upper.stop - lower.stop)),
  );
}
/**
 * @param {Record<number, string>} colors
 * @param {number[]} stops
 * @param {TonalPaletteAnchor[]} anchors
 */
function applyAnchorCorrections(colors, stops, anchors) {
  if (anchors.length === 0) return {colors, anchors: []};
  const corrections = anchors
    .map(anchor => {
      const candidate = colors[anchor.stop];
      const result = applyAnchor(candidate, anchor);
      const base = oklabCoordinates(candidate);
      const target = oklabCoordinates(result.generatedColor);
      /**
       * @type {ColorTriple}
       */
      const delta = [
        target[0] - base[0],
        target[1] - base[1],
        target[2] - base[2],
      ];
      return {
        stop: anchor.stop,
        delta,
        result,
      };
    })
    .sort((a, b) => a.stop - b.stop);
  /**
   * @type {Record<number, string>}
   */
  const corrected = {};
  for (const stop of stops) {
    const base = oklabCoordinates(colors[stop]);
    const delta = correctionAtStop(corrections, stop);
    corrected[stop] = oklabCoordinatesToHex([
      base[0] + delta[0],
      base[1] + delta[1],
      base[2] + delta[2],
    ]);
  }
  for (const correction of corrections) {
    corrected[correction.stop] = correction.result.generatedColor;
  }
  return {
    colors: corrected,
    anchors: corrections.map(correction => correction.result),
  };
}
/**
 * @param {TonalPaletteAnchor[]} anchors
 * @param {number[]} stops
 */
function assertAnchorSet(anchors, stops) {
  const seen = new Set();
  for (const anchor of anchors) {
    const color = normalizeColor(anchor.color);
    if (!['light', 'dark'].includes(anchor.mode)) {
      throw new Error(`Unknown anchor mode: ${String(anchor.mode)}`);
    }
    if (!stops.includes(anchor.stop)) {
      throw new Error(
        `Anchor stop ${anchor.stop} is not present in the requested stop layout.`,
      );
    }
    if (
      (anchor.stop === 0 && color !== PALETTE_BLACK) ||
      (anchor.stop === 100 && color !== PALETTE_WHITE)
    ) {
      throw new Error(
        `Anchor stop ${anchor.stop} is reserved for exact ${anchor.stop === 0 ? 'black' : 'white'}; use an interior stop for a tinted endpoint.`,
      );
    }
    const key = `${anchor.mode}:${anchor.stop}`;
    if (seen.has(key)) {
      throw new Error(
        `Duplicate anchor for ${anchor.mode} stop ${anchor.stop}.`,
      );
    }
    seen.add(key);
  }
}
/**
 * @param {Record<number, string>} colors
 * @param {number[]} stops
 * @param {number} sourceHue
 * @param {number[]} gamutMappedStops
 * @param {AnchorResult[]} anchors
 */
function buildDiagnostics(colors, stops, sourceHue, gamutMappedStops, anchors) {
  let monotonic = true;
  let minimumAdjacentDeltaE = Number.POSITIVE_INFINITY;
  let maximumAdjacentDeltaE = 0;
  let maximumHueDrift = 0;
  /**
   * @type {TonalPaletteRampDiagnostics['hueIdentityRisk']}
   */
  let hueIdentityRisk = null;
  for (let index = 0; index < stops.length; index++) {
    const stop = stops[index];
    const color = colors[stop];
    const oklch = hexToOklch(color);
    if (oklch.C >= 0.015) {
      const drift = signedHueDelta(sourceHue, oklch.H);
      maximumHueDrift = Math.max(
        maximumHueDrift,
        hueDistance(sourceHue, oklch.H),
      );
      if (sourceHue >= 230 && sourceHue < 285 && drift > 12) {
        hueIdentityRisk = 'blue-to-purple';
      }
      if (sourceHue >= 70 && sourceHue < 115 && drift < -12) {
        hueIdentityRisk = 'yellow-to-brown';
      }
    }
    if (index === 0) continue;
    const previous = colors[stops[index - 1]];
    if (luminance(color) + 0.000001 < luminance(previous)) monotonic = false;
    const adjacentDelta = perceptualDelta(previous, color);
    minimumAdjacentDeltaE = Math.min(minimumAdjacentDeltaE, adjacentDelta);
    maximumAdjacentDeltaE = Math.max(maximumAdjacentDeltaE, adjacentDelta);
  }
  return {
    monotonic,
    minimumAdjacentDeltaE:
      minimumAdjacentDeltaE === Number.POSITIVE_INFINITY
        ? 0
        : minimumAdjacentDeltaE,
    maximumAdjacentDeltaE,
    maximumHueDrift,
    hueIdentityRisk,
    gamutMappedStops,
    anchors,
  };
}
/**
 * The share of its chroma a stop keeps under the request's
 * `darkChromaTaper`: the edge multiplier through `throughStop`, a smoothstep
 * back to 1 at `recoverAtStop`, and 1 from there on. Light ramps, neutral
 * families, and the black and white endpoints keep all of it.
 * @param {NormalizedRequest['darkChromaTaper']} taper
 * @param {NormalizedFamily} family
 * @param {PaletteMode} mode
 * @param {number} stop
 */
function darkChromaMultiplier(taper, family, mode, stop) {
  if (!taper || mode !== 'dark' || family.kind === 'neutral') return 1;
  if (stop <= 0 || stop >= 100 || stop >= taper.recoverAtStop) return 1;
  // Read own keys only. A family id such as `constructor` must not get a
  // multiplier from the object prototype.
  const edge = Object.hasOwn(taper.familyMultipliers, family.id)
    ? taper.familyMultipliers[family.id]
    : taper.edgeMultiplier;
  if (stop <= taper.throughStop) return edge;
  const recovery = smoothstep(
    (stop - taper.throughStop) / (taper.recoverAtStop - taper.throughStop),
  );
  return edge + (1 - edge) * recovery;
}
/**
 * @param {NormalizedRequest} request
 * @param {NormalizedFamily} family
 * @param {PaletteMode} mode
 * @returns {GeneratedRamp}
 */
function generateRamp(request, family, mode) {
  const seedHex = normalizeColor(family.seed);
  const anchors = (family.anchors ?? []).filter(anchor => anchor.mode === mode);
  assertAnchorSet(family.anchors ?? [], request.stops);
  const seed =
    family.kind === 'neutral'
      ? neutralPolar(request.neutralProfile, seedHex)
      : colorToPolar(seedHex);
  /**
   * @type {Record<number, string>}
   */
  const colors = {};
  const gamutMappedStops = [];
  const diagnosticReference = generateCandidate(
    seed,
    50,
    mode,
    request.vibrancy,
    family.kind !== 'neutral',
    darkChromaMultiplier(request.darkChromaTaper, family, mode, 50),
    request.recipe,
  ).hex;
  for (const stop of request.stops) {
    const source = anchorPolarAtStop(seed, anchors, stop);
    const generated = generateCandidate(
      source,
      stop,
      mode,
      request.vibrancy,
      family.kind !== 'neutral',
      darkChromaMultiplier(request.darkChromaTaper, family, mode, stop),
      request.recipe,
    );
    colors[stop] = generated.hex;
    if (generated.gamutMapped) gamutMappedStops.push(stop);
  }
  const corrected = applyAnchorCorrections(colors, request.stops, anchors);
  const diagnostics = buildDiagnostics(
    corrected.colors,
    request.stops,
    hexToOklch(diagnosticReference).H,
    gamutMappedStops,
    corrected.anchors,
  );
  if (!diagnostics.monotonic) {
    throw new Error(
      `${family.name} ${mode} ramp is not luminance-monotonic with the requested anchors.`,
    );
  }
  return {colors: corrected.colors, diagnostics};
}
/**
 * @param {number[]} stops
 * @param {number} target
 */
function nearestStop(stops, target) {
  return stops.reduce((best, stop) =>
    Math.abs(stop - target) < Math.abs(best - target) ? stop : best,
  );
}
/**
 * @param {NormalizedRequest} request
 * @param {GeneratedFamily[]} families
 */
function buildCoordinationDiagnostics(request, families) {
  const stop = nearestStop(request.stops, 50);
  const chromaticIds = new Set(
    request.families
      .filter(family => family.kind !== 'neutral')
      .map(family => family.id),
  );
  return modesForStrategy(request.modeStrategy).map(mode => {
    const samples = families
      .filter(family => chromaticIds.has(family.id) && family[mode])
      .map(family => {
        const ramp = family[mode];
        if (!ramp) throw new Error(`Missing ${mode} ramp for ${family.id}.`);
        const color = ramp.colors[stop];
        return {
          id: family.id,
          name: family.name,
          color,
          chroma: hexToOklch(color).C,
        };
      });
    /**
     * @type {[string, string] | null}
     */
    let closestFamilies = null;
    let minimumFamilyDeltaE = Number.POSITIVE_INFINITY;
    for (let index = 0; index < samples.length; index++) {
      for (let next = index + 1; next < samples.length; next++) {
        const delta = perceptualDelta(
          samples[index].color,
          samples[next].color,
        );
        if (delta < minimumFamilyDeltaE) {
          minimumFamilyDeltaE = delta;
          closestFamilies = [samples[index].name, samples[next].name];
        }
      }
    }
    const byChroma = [...samples].sort((a, b) => a.chroma - b.chroma);
    const weakest = byChroma[0];
    const strongest = byChroma[byChroma.length - 1];
    return {
      mode,
      stop,
      closestFamilies,
      minimumFamilyDeltaE:
        minimumFamilyDeltaE === Number.POSITIVE_INFINITY
          ? null
          : minimumFamilyDeltaE,
      strongestFamily: strongest?.name ?? null,
      weakestFamily: weakest?.name ?? null,
      chromaRatio:
        weakest && strongest && weakest.chroma > 0.0001
          ? strongest.chroma / weakest.chroma
          : null,
    };
  });
}
/**
 * @param {unknown} value
 * @param {string} label
 */
function assertMultiplier(value, label) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error(`${label} must be a number from 0 to 1.`);
  }
  return value;
}
/**
 * The request's dark chroma taper, checked against its stops and families,
 * or undefined when the request has none. The receipt records the taper, so
 * a field the taper does not read fails instead of changing nothing.
 * @param {unknown} taper
 * @param {number[]} stops
 * @param {NormalizedFamily[]} families
 * @returns {NormalizedRequest['darkChromaTaper']}
 */
function normalizeDarkChromaTaper(taper, stops, families) {
  if (taper == null) return undefined;
  if (typeof taper !== 'object' || Array.isArray(taper)) {
    throw new Error('darkChromaTaper must be an object.');
  }
  const fields = /** @type {Record<string, unknown>} */ (taper);
  const unread = Object.keys(fields).filter(
    key => !DARK_CHROMA_TAPER_KEYS.includes(key),
  );
  if (unread.length > 0) {
    throw new Error(
      `darkChromaTaper does not read ${unread.join(', ')}; it reads ${DARK_CHROMA_TAPER_KEYS.join(', ')}.`,
    );
  }
  const {edgeMultiplier, throughStop, recoverAtStop, familyMultipliers} =
    fields;
  const edge = assertMultiplier(
    edgeMultiplier,
    'darkChromaTaper.edgeMultiplier',
  );
  if (typeof throughStop !== 'number' || !stops.includes(throughStop)) {
    throw new Error(
      'darkChromaTaper.throughStop must be a stop in the requested stop layout.',
    );
  }
  if (
    typeof recoverAtStop !== 'number' ||
    !stops.includes(recoverAtStop) ||
    recoverAtStop <= throughStop
  ) {
    throw new Error(
      'darkChromaTaper.recoverAtStop must be a stop in the requested stop layout after throughStop.',
    );
  }
  if (
    familyMultipliers != null &&
    (typeof familyMultipliers !== 'object' || Array.isArray(familyMultipliers))
  ) {
    throw new Error('darkChromaTaper.familyMultipliers must be an object.');
  }
  /**
   * @type {Record<string, number>}
   */
  const multipliers = {};
  for (const [id, value] of Object.entries(familyMultipliers ?? {})) {
    const family = families.find(candidate => candidate.id === id);
    if (!family) {
      throw new Error(
        `darkChromaTaper.familyMultipliers names unknown family ${id}.`,
      );
    }
    if (family.kind === 'neutral') {
      throw new Error(
        `darkChromaTaper.familyMultipliers names neutral family ${id}; the taper changes only chromatic families.`,
      );
    }
    multipliers[id] = assertMultiplier(
      value,
      `darkChromaTaper.familyMultipliers.${id}`,
    );
  }
  return {
    edgeMultiplier: edge,
    throughStop,
    recoverAtStop,
    familyMultipliers: multipliers,
  };
}
/**
 * @param {TonalPaletteGenerationInput} input
 * @returns {NormalizedRequest}
 */
export function normalizeGenerationRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Palette generation config must be an object.');
  }
  const families = input.families;
  if (!Array.isArray(families) || families.length === 0) {
    throw new Error('Palette generation requires at least one family.');
  }
  // A request that names no recipe runs the first one, so a config written
  // before v2 regenerates the same colors.
  const recipe = input.recipe ?? /** @type {PaletteRecipe} */ (PALETTE_RECIPE);
  if (!PALETTE_RECIPES.includes(recipe)) {
    throw new Error(
      `Unknown palette recipe: ${String(input.recipe)} (known: ${PALETTE_RECIPES.join(', ')}).`,
    );
  }
  const modeStrategy = input.modeStrategy ?? 'light-and-dark';
  const modes = modesForStrategy(modeStrategy);
  const stops = validateStops(input.stops ?? DEFAULT_21_STOPS);
  const ids = new Set();
  const normalizedFamilies = families.map((family, index) => {
    if (!family || typeof family !== 'object' || Array.isArray(family)) {
      throw new Error(`Family ${index} must be an object.`);
    }
    const id = String(family.id ?? '').trim();
    if (!/^[a-z][a-z0-9-]*$/.test(id)) {
      throw new Error(
        `Family ${index} id must use lower-kebab-case characters.`,
      );
    }
    if (RESERVED_FAMILY_IDS.has(id)) {
      throw new Error(
        `Family id ${id} is reserved for the standalone ${id} palette value.`,
      );
    }
    if (ids.has(id)) throw new Error(`Duplicate family id: ${id}.`);
    ids.add(id);
    const kind = family.kind ?? 'chromatic';
    if (!['chromatic', 'neutral'].includes(kind)) {
      throw new Error(`Unknown family kind: ${String(kind)}`);
    }
    if (family.anchors != null && !Array.isArray(family.anchors)) {
      throw new Error(`Family ${id} anchors must be an array.`);
    }
    const anchors = (family.anchors ?? []).map((anchor, anchorIndex) => {
      if (!anchor || typeof anchor !== 'object' || Array.isArray(anchor)) {
        throw new Error(
          `Family ${id} anchor ${anchorIndex} must be an object.`,
        );
      }
      if (!['light', 'dark'].includes(anchor.mode)) {
        throw new Error(`Unknown anchor mode: ${String(anchor.mode)}`);
      }
      if (!modes.includes(anchor.mode)) {
        throw new Error(
          `Anchor mode ${anchor.mode} is not generated by mode strategy ${modeStrategy}.`,
        );
      }
      if (!Number.isFinite(anchor.stop) || !stops.includes(anchor.stop)) {
        throw new Error(
          `Anchor stop ${String(anchor.stop)} is not present in the requested stop layout.`,
        );
      }
      if (!['exact', 'bounded', 'flexible'].includes(anchor.policy)) {
        throw new Error(`Unknown anchor policy: ${String(anchor.policy)}`);
      }
      const maxDeltaE = anchor.maxDeltaE;
      if (
        anchor.policy === 'bounded' &&
        (typeof maxDeltaE !== 'number' ||
          !Number.isFinite(maxDeltaE) ||
          maxDeltaE < 0)
      ) {
        throw new Error(
          `Bounded anchor at stop ${anchor.stop} requires a non-negative maxDeltaE.`,
        );
      }
      if (anchor.policy !== 'bounded' && maxDeltaE != null) {
        throw new Error(
          `Anchor policy ${anchor.policy} does not accept maxDeltaE.`,
        );
      }
      const color = normalizeColor(anchor.color);
      if (
        (anchor.stop === 0 && color !== PALETTE_BLACK) ||
        (anchor.stop === 100 && color !== PALETTE_WHITE)
      ) {
        throw new Error(
          `Anchor stop ${anchor.stop} is reserved for exact ${anchor.stop === 0 ? 'black' : 'white'}; use an interior stop for a tinted endpoint.`,
        );
      }
      return {
        mode: anchor.mode,
        stop: anchor.stop,
        color,
        policy: anchor.policy,
        ...(anchor.policy === 'bounded' ? {maxDeltaE} : {}),
      };
    });
    return {
      id,
      name: String(family.name ?? id),
      seed: normalizeColor(family.seed),
      kind,
      anchors,
    };
  });
  const neutralProfile = input.neutralProfile ?? 'neutral-v1';
  // The receipt records this request, so an unknown profile fails even when no
  // neutral family reads it.
  if (!NEUTRAL_PROFILES.includes(neutralProfile)) {
    throw new Error(`Unknown neutral profile: ${String(neutralProfile)}`);
  }
  const darkChromaTaper = normalizeDarkChromaTaper(
    input.darkChromaTaper,
    stops,
    normalizedFamilies,
  );
  /**
   * @type {NormalizedRequest}
   */
  const request = {
    recipe,
    vibrancy: input.vibrancy ?? 50,
    neutralProfile,
    modeStrategy,
    ...(darkChromaTaper ? {darkChromaTaper} : {}),
    stops,
    families: normalizedFamilies,
  };
  vibrancyMultiplier(request.vibrancy);
  return request;
}
/**
 * @param {TonalPaletteGenerationInput} input
 * @returns {PaletteGenerationResult}
 */
export function generatePaletteSet(input) {
  const request = normalizeGenerationRequest(input);
  /**
   * @type {GeneratedFamily[]}
   */
  const families = [];
  /**
   * @type {{familyId: string; message: string}[]}
   */
  const errors = [];
  for (const family of request.families) {
    try {
      /**
       * @type {GeneratedFamily}
       */
      const generated = {
        id: family.id,
        name: family.name,
        seed: family.seed,
      };
      for (const mode of modesForStrategy(request.modeStrategy)) {
        generated[mode] = generateRamp(request, family, mode);
      }
      families.push(generated);
    } catch (error) {
      errors.push({
        familyId: family.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    recipe: request.recipe,
    status: 'candidate',
    request,
    families,
    coordination: buildCoordinationDiagnostics(request, families),
    errors,
  };
}
/**
 * Generate candidate palette data without reading or writing files.
 * @param {TonalPaletteGenerationInput} input
 * @returns {TonalPaletteCandidate}
 */
export function generateTonalPalette(input) {
  const result = generatePaletteSet(input);
  if (result.errors.length > 0) {
    throw new Error(
      result.errors
        .map(error => `${error.familyId}: ${error.message}`)
        .join('\n'),
    );
  }
  return {
    schemaVersion: 1,
    status: 'candidate',
    recipe: result.recipe,
    black: PALETTE_BLACK,
    white: PALETTE_WHITE,
    stops: [...result.request.stops],
    palette: Object.fromEntries(
      result.families.map(family => [
        family.id,
        {
          name: family.name,
          ...(family.light ? {light: family.light.colors} : {}),
          ...(family.dark ? {dark: family.dark.colors} : {}),
        },
      ]),
    ),
  };
}
/**
 * @param {unknown} result
 */
export function serializeGenerationResult(result) {
  return `${JSON.stringify(result, null, 2)}\n`;
}
