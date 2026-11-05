// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Experimental tonal-palette generator used only by the sandbox decision tool.
 *
 * This intentionally remains outside Core. It makes the proposed AST-008 input
 * choices executable without claiming that the algorithm or output is canonical.
 */

import {
  hexToHct,
  hexToOklch,
  hctToHex,
  luminance,
  maxOklchChroma,
  oklchClampedHex,
  parseColorInput,
  toneToOklabL,
} from '../color-studio/colorUtils';

export const FULL_21_STOPS = [
  0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95,
  100,
] as const;

export const COMPACT_11_STOPS = [
  0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
] as const;

export type PaletteAlgorithm = 'oklch-v1-experimental' | 'hct-v1-experimental';
export type NeutralProfile = 'neutral-v1' | 'warm-v1' | 'cool-v1' | 'custom';
export type PaletteMode = 'light' | 'dark';
export type ModeStrategy = 'light-only' | 'dark-only' | 'light-and-dark';
export type AnchorPolicy = 'exact' | 'bounded' | 'preferred';

export interface PaletteAnchor {
  mode: PaletteMode;
  stop: number;
  color: string;
  policy: AnchorPolicy;
  /** OKLab Euclidean distance × 100. Required for bounded anchors. */
  maxDeltaE?: number;
}

export interface PaletteFamilyRequest {
  id: string;
  name: string;
  seed: string;
  kind?: 'chromatic' | 'neutral';
  anchors?: PaletteAnchor[];
}

export interface PaletteGenerationRequest {
  algorithm: PaletteAlgorithm;
  /** Continuous perceptual color strength from 0 (subdued) to 100 (vivid). */
  vibrancy: number;
  neutralProfile: NeutralProfile;
  modeStrategy: ModeStrategy;
  stops: number[];
  families: PaletteFamilyRequest[];
}

export interface AnchorResult extends PaletteAnchor {
  generatedColor: string;
  deltaE: number;
}

export interface RampDiagnostics {
  monotonic: boolean;
  minimumAdjacentDeltaE: number;
  maximumAdjacentDeltaE: number;
  maximumHueDrift: number;
  hueIdentityRisk: 'blue-to-purple' | 'yellow-to-brown' | null;
  gamutMappedStops: number[];
  anchors: AnchorResult[];
}

export interface GeneratedRamp {
  colors: Record<number, string>;
  diagnostics: RampDiagnostics;
}

export interface GeneratedFamily {
  id: string;
  name: string;
  seed: string;
  light?: GeneratedRamp;
  dark?: GeneratedRamp;
}

export interface CoordinationDiagnostic {
  mode: PaletteMode;
  stop: number;
  closestFamilies: [string, string] | null;
  minimumFamilyDeltaE: number | null;
  strongestFamily: string | null;
  weakestFamily: string | null;
  chromaRatio: number | null;
}

export interface PaletteGenerationResult {
  request: PaletteGenerationRequest;
  families: GeneratedFamily[];
  coordination: CoordinationDiagnostic[];
  errors: {familyId: string; message: string}[];
}

interface PolarColor {
  lightness: number;
  chroma: number;
  hue: number;
}

const DARK_CHROMA_FACTOR = 0.85;
const DARK_TONE_LIFT = 5;
const DARK_LIFT_TAPER_START = 80;
const DARK_LIFT_TAPER_END = 95;

function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

function hueDistance(a: number, b: number): number {
  const difference = Math.abs(normalizeHue(a) - normalizeHue(b));
  return Math.min(difference, 360 - difference);
}

function signedHueDelta(from: number, to: number): number {
  return ((normalizeHue(to) - normalizeHue(from) + 540) % 360) - 180;
}

function interpolateHue(a: number, b: number, amount: number): number {
  const delta = ((b - a + 540) % 360) - 180;
  return normalizeHue(a + delta * amount);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizedHex(input: string): string {
  const parsed = parseColorInput(input);
  if (!parsed) {
    throw new Error(`Invalid color: ${input}`);
  }
  return parsed.toLowerCase();
}

export function validateStops(stops: number[]): number[] {
  if (stops.length < 2) {
    throw new Error('A palette requires at least two stops.');
  }

  const normalized = [...stops];
  for (const stop of normalized) {
    if (!Number.isFinite(stop) || stop < 0 || stop > 100) {
      throw new Error(
        `Stop ${String(stop)} must be a finite number from 0 to 100.`,
      );
    }
  }

  for (let index = 1; index < normalized.length; index++) {
    if (normalized[index] <= normalized[index - 1]) {
      throw new Error('Stops must be unique and strictly increasing.');
    }
  }

  if (normalized[0] !== 0 || normalized[normalized.length - 1] !== 100) {
    throw new Error('Complete ramps must include stops 0 and 100.');
  }

  return normalized;
}

export function parseStopList(input: string): number[] {
  const tokens = input.split(',').map(value => value.trim());
  if (tokens.some(value => value === '' || !Number.isFinite(Number(value)))) {
    throw new Error('Every custom stop must be a number from 0 to 100.');
  }
  const values = tokens.map(Number);
  return validateStops(values);
}

function modesForStrategy(strategy: ModeStrategy): PaletteMode[] {
  if (strategy === 'light-only') {
    return ['light'];
  }
  if (strategy === 'dark-only') {
    return ['dark'];
  }
  return ['light', 'dark'];
}

/**
 * Hue-dependent compensation derived from the existing Astryx palette work.
 * It keeps naturally forceful green/cyan and purple regions from dominating
 * while allowing blue to retain more chroma. Names never affect this math.
 */
function hueBalanceFactor(hue: number): number {
  const h = normalizeHue(hue);
  if (h >= 70 && h < 115) {
    return 0.94; // yellow
  }
  if (h >= 115 && h < 175) {
    return 0.78; // green
  }
  if (h >= 175 && h < 230) {
    return 0.82; // teal/cyan
  }
  if (h >= 285 && h < 340) {
    return 0.9; // purple/magenta
  }
  return 1;
}

/**
 * Constant-hue orange becomes brown quickly in the lower sRGB gamut. A gentle
 * redward rotation below tone 50 preserves orange identity and unlocks more
 * usable chroma without changing the shared luminance scale. Other hue regions
 * stay fixed so this compensation cannot make blue drift toward purple.
 */
function toneAdjustedHue(
  algorithm: PaletteAlgorithm,
  hue: number,
  tone: number,
): number {
  const normalized = normalizeHue(hue);
  if (
    algorithm !== 'oklch-v1-experimental' ||
    normalized < 40 ||
    normalized >= 70 ||
    tone >= 50
  ) {
    return normalized;
  }

  const darkening = clamp((50 - tone) / 40, 0, 1);
  return normalizeHue(normalized - 18 * Math.sqrt(darkening));
}

function toneChromaEnvelope(tone: number): number {
  const normalized = clamp(tone / 100, 0, 1);
  return 0.18 + 0.82 * Math.sqrt(Math.max(0, Math.sin(Math.PI * normalized)));
}

function vibrancyMultiplier(vibrancy: number): number {
  if (!Number.isFinite(vibrancy) || vibrancy < 0 || vibrancy > 100) {
    throw new Error('Vibrancy must be a number from 0 to 100.');
  }

  // Preserve the preset calibration while making 0 genuinely achromatic:
  // 0 = no chroma, 25 = muted (0.72), 50 = balanced (1.0),
  // 75 = vibrant (1.24), and 100 = maximum (1.48).
  if (vibrancy <= 25) {
    return (vibrancy / 25) * 0.72;
  }
  if (vibrancy <= 50) {
    return 0.72 + ((vibrancy - 25) / 25) * 0.28;
  }
  return 1 + (vibrancy - 50) * 0.0096;
}

/**
 * Pull seed colors toward a shared perceptual intensity before applying the
 * hue-specific compensation. Anchors can still preserve intentional brand
 * differences, but arbitrary source saturation should not make one family
 * three times louder than its neighbors by accident.
 */
function coordinatedChroma(
  algorithm: PaletteAlgorithm,
  sourceChroma: number,
): number {
  const target = algorithm === 'oklch-v1-experimental' ? 0.18 : 65;
  return sourceChroma * 0.35 + target * 0.65;
}

function darkTone(tone: number): number {
  if (tone >= DARK_LIFT_TAPER_END) {
    return tone;
  }
  if (tone <= DARK_LIFT_TAPER_START) {
    return Math.min(100, tone + DARK_TONE_LIFT);
  }
  const ratio =
    (DARK_LIFT_TAPER_END - tone) /
    (DARK_LIFT_TAPER_END - DARK_LIFT_TAPER_START);
  return Math.min(100, tone + DARK_TONE_LIFT * ratio);
}

function neutralPolar(
  algorithm: PaletteAlgorithm,
  profile: NeutralProfile,
  seed: string,
): PolarColor {
  if (profile === 'custom') {
    return colorToPolar(algorithm, seed);
  }

  const hue = profile === 'warm-v1' ? 75 : profile === 'cool-v1' ? 250 : 0;
  if (algorithm === 'oklch-v1-experimental') {
    return {
      lightness: 0.5,
      chroma: profile === 'neutral-v1' ? 0 : 0.018,
      hue,
    };
  }
  return {
    lightness: 50,
    chroma: profile === 'neutral-v1' ? 0 : 4,
    hue,
  };
}

function colorToPolar(algorithm: PaletteAlgorithm, color: string): PolarColor {
  if (algorithm === 'oklch-v1-experimental') {
    const value = hexToOklch(color);
    return {lightness: value.L, chroma: value.C, hue: value.H};
  }
  const value = hexToHct(color);
  return {lightness: value.tone, chroma: value.chroma, hue: value.hue};
}

function anchorPolarAtStop(
  algorithm: PaletteAlgorithm,
  seed: PolarColor,
  anchors: PaletteAnchor[],
  stop: number,
): PolarColor {
  if (anchors.length === 0) {
    return seed;
  }

  const sorted = [...anchors].sort((a, b) => a.stop - b.stop);
  const lower = [...sorted].reverse().find(anchor => anchor.stop <= stop);
  const upper = sorted.find(anchor => anchor.stop >= stop);

  if (!lower || !upper || lower.stop === upper.stop) {
    return colorToPolar(
      algorithm,
      normalizedHex((lower ?? upper ?? sorted[0]).color),
    );
  }

  const start = colorToPolar(algorithm, normalizedHex(lower.color));
  const end = colorToPolar(algorithm, normalizedHex(upper.color));
  const amount = (stop - lower.stop) / (upper.stop - lower.stop);
  return {
    lightness: start.lightness + (end.lightness - start.lightness) * amount,
    chroma: start.chroma + (end.chroma - start.chroma) * amount,
    hue: interpolateHue(start.hue, end.hue, amount),
  };
}

function generateCandidate(
  algorithm: PaletteAlgorithm,
  source: PolarColor,
  tone: number,
  mode: PaletteMode,
  vibrancy: number,
  coordinateWithOtherFamilies: boolean,
): {hex: string; gamutMapped: boolean} {
  const adjustedTone = mode === 'dark' ? darkTone(tone) : tone;
  const adjustedHue = toneAdjustedHue(algorithm, source.hue, adjustedTone);
  const modeChroma = mode === 'dark' ? DARK_CHROMA_FACTOR : 1;
  const baseChroma = coordinateWithOtherFamilies
    ? coordinatedChroma(algorithm, source.chroma)
    : source.chroma;
  const chroma =
    baseChroma *
    vibrancyMultiplier(vibrancy) *
    hueBalanceFactor(adjustedHue) *
    toneChromaEnvelope(adjustedTone) *
    modeChroma;

  if (algorithm === 'oklch-v1-experimental') {
    const lightness = toneToOklabL(adjustedTone);
    const maximum = maxOklchChroma(adjustedHue, lightness);
    return {
      hex: oklchClampedHex(lightness, chroma, adjustedHue),
      gamutMapped: chroma > maximum + 0.000001,
    };
  }

  const boost = adjustedTone < 50 ? 1 + (50 - adjustedTone) / 40 : 1;
  const requestedChroma = chroma * boost;
  const hex = hctToHex({
    hue: source.hue,
    chroma: requestedChroma,
    tone: adjustedTone,
  });
  const achieved = hexToHct(hex).chroma;
  return {
    hex,
    gamutMapped: achieved + 0.5 < requestedChroma,
  };
}

function oklabCoordinates(color: string): [number, number, number] {
  const value = hexToOklch(color);
  const radians = (value.H * Math.PI) / 180;
  return [value.L, value.C * Math.cos(radians), value.C * Math.sin(radians)];
}

function oklabToHex([lightness, a, b]: [number, number, number]): string {
  const chroma = Math.sqrt(a * a + b * b);
  const hue = normalizeHue((Math.atan2(b, a) * 180) / Math.PI);
  return oklchClampedHex(clamp(lightness, 0, 1), chroma, hue);
}

export function perceptualDelta(colorA: string, colorB: string): number {
  const [l1, a1, b1] = oklabCoordinates(colorA);
  const [l2, a2, b2] = oklabCoordinates(colorB);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2) * 100;
}

function interpolateColor(
  colorA: string,
  colorB: string,
  amount: number,
): string {
  const start = hexToOklch(colorA);
  const end = hexToOklch(colorB);
  return oklchClampedHex(
    start.L + (end.L - start.L) * amount,
    start.C + (end.C - start.C) * amount,
    interpolateHue(start.H, end.H, amount),
  );
}

function applyAnchor(candidate: string, anchor: PaletteAnchor): AnchorResult {
  const target = normalizedHex(anchor.color);
  let generatedColor = candidate;

  if (anchor.policy === 'exact') {
    generatedColor = target;
  } else if (anchor.policy === 'bounded') {
    const tolerance = anchor.maxDeltaE;
    if (tolerance == null || !Number.isFinite(tolerance) || tolerance < 0) {
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
        if (perceptualDelta(mixed, target) <= tolerance) {
          low = amount;
        } else {
          high = amount;
        }
      }
      generatedColor = interpolateColor(target, candidate, low);
    }
  } else {
    generatedColor = interpolateColor(candidate, target, 0.35);
  }

  return {
    ...anchor,
    color: target,
    generatedColor,
    deltaE: perceptualDelta(generatedColor, target),
  };
}

interface AnchorCorrection {
  stop: number;
  delta: [number, number, number];
  result: AnchorResult;
}

function smoothstep(amount: number): number {
  const value = clamp(amount, 0, 1);
  return value * value * (3 - 2 * value);
}

function interpolateDelta(
  start: [number, number, number],
  end: [number, number, number],
  amount: number,
): [number, number, number] {
  return [
    start[0] + (end[0] - start[0]) * amount,
    start[1] + (end[1] - start[1]) * amount,
    start[2] + (end[2] - start[2]) * amount,
  ];
}

function correctionAtStop(
  corrections: AnchorCorrection[],
  stop: number,
): [number, number, number] {
  const zero: [number, number, number] = [0, 0, 0];
  if (corrections.length === 0) {
    return zero;
  }

  const first = corrections[0];
  if (stop <= first.stop) {
    const boundary = Math.max(0, first.stop - 25);
    if (stop <= boundary && boundary !== first.stop) {
      return zero;
    }
    const amount =
      boundary === first.stop
        ? 1
        : smoothstep((stop - boundary) / (first.stop - boundary));
    return interpolateDelta(zero, first.delta, amount);
  }

  const last = corrections[corrections.length - 1];
  if (stop >= last.stop) {
    const boundary = Math.min(100, last.stop + 25);
    if (stop >= boundary && boundary !== last.stop) {
      return zero;
    }
    const amount =
      boundary === last.stop
        ? 1
        : smoothstep((stop - last.stop) / (boundary - last.stop));
    return interpolateDelta(last.delta, zero, amount);
  }

  const upperIndex = corrections.findIndex(item => item.stop > stop);
  const lower = corrections[upperIndex - 1];
  const upper = corrections[upperIndex];
  const amount = smoothstep((stop - lower.stop) / (upper.stop - lower.stop));
  return interpolateDelta(lower.delta, upper.delta, amount);
}

function applyAnchorCorrections(
  colors: Record<number, string>,
  stops: number[],
  anchors: PaletteAnchor[],
): {colors: Record<number, string>; anchors: AnchorResult[]} {
  if (anchors.length === 0) {
    return {colors, anchors: []};
  }

  const corrections = anchors
    .map(anchor => {
      const candidate = colors[anchor.stop];
      const result = applyAnchor(candidate, anchor);
      const base = oklabCoordinates(candidate);
      const target = oklabCoordinates(result.generatedColor);
      return {
        stop: anchor.stop,
        delta: [
          target[0] - base[0],
          target[1] - base[1],
          target[2] - base[2],
        ] as [number, number, number],
        result,
      };
    })
    .sort((a, b) => a.stop - b.stop);

  const corrected: Record<number, string> = {};
  for (const stop of stops) {
    const base = oklabCoordinates(colors[stop]);
    const delta = correctionAtStop(corrections, stop);
    corrected[stop] = oklabToHex([
      base[0] + delta[0],
      base[1] + delta[1],
      base[2] + delta[2],
    ]);
  }

  // Preserve the canonical anchor value after conversion and gamut mapping.
  for (const correction of corrections) {
    corrected[correction.stop] = correction.result.generatedColor;
  }

  return {
    colors: corrected,
    anchors: corrections.map(correction => correction.result),
  };
}

function assertAnchorSet(anchors: PaletteAnchor[], stops: number[]): void {
  const seen = new Set<string>();
  for (const anchor of anchors) {
    normalizedHex(anchor.color);
    if (!stops.includes(anchor.stop)) {
      throw new Error(
        `Anchor stop ${anchor.stop} is not present in the requested stop layout.`,
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

function buildDiagnostics(
  colors: Record<number, string>,
  stops: number[],
  sourceHue: number,
  gamutMappedStops: number[],
  anchors: AnchorResult[],
): RampDiagnostics {
  let monotonic = true;
  let minimumAdjacentDeltaE = Number.POSITIVE_INFINITY;
  let maximumAdjacentDeltaE = 0;
  let maximumHueDrift = 0;
  let hueIdentityRisk: RampDiagnostics['hueIdentityRisk'] = null;

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
    if (index === 0) {
      continue;
    }
    const previous = colors[stops[index - 1]];
    if (luminance(color) + 0.000001 < luminance(previous)) {
      monotonic = false;
    }
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

function generateRamp(
  request: PaletteGenerationRequest,
  family: PaletteFamilyRequest,
  mode: PaletteMode,
): GeneratedRamp {
  const stops = validateStops(request.stops);
  const seedHex = normalizedHex(family.seed);
  const anchors = (family.anchors ?? []).filter(anchor => anchor.mode === mode);
  assertAnchorSet(family.anchors ?? [], stops);

  const seed =
    family.kind === 'neutral'
      ? neutralPolar(request.algorithm, request.neutralProfile, seedHex)
      : colorToPolar(request.algorithm, seedHex);
  const baseColors: Record<number, string> = {};
  const gamutMappedStops: number[] = [];
  const diagnosticReference = generateCandidate(
    request.algorithm,
    seed,
    50,
    mode,
    request.vibrancy,
    family.kind !== 'neutral',
  ).hex;

  for (const stop of stops) {
    const source = anchorPolarAtStop(request.algorithm, seed, anchors, stop);
    const generated = generateCandidate(
      request.algorithm,
      source,
      stop,
      mode,
      request.vibrancy,
      family.kind !== 'neutral',
    );
    const color = generated.hex;
    if (generated.gamutMapped) {
      gamutMappedStops.push(stop);
    }

    baseColors[stop] = color;
  }

  const corrected = applyAnchorCorrections(baseColors, stops, anchors);

  const diagnostics = buildDiagnostics(
    corrected.colors,
    stops,
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

function nearestStop(stops: number[], target: number): number {
  return stops.reduce((best, stop) =>
    Math.abs(stop - target) < Math.abs(best - target) ? stop : best,
  );
}

function buildCoordinationDiagnostics(
  request: PaletteGenerationRequest,
  families: GeneratedFamily[],
): CoordinationDiagnostic[] {
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
        const color = family[mode]?.colors[stop] ?? '#000000';
        return {
          id: family.id,
          name: family.name,
          color,
          chroma: hexToOklch(color).C,
        };
      });

    let closestFamilies: [string, string] | null = null;
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
    const chromaRatio =
      weakest && strongest && weakest.chroma > 0.0001
        ? strongest.chroma / weakest.chroma
        : null;

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
      chromaRatio,
    };
  });
}

export function generatePaletteSet(
  request: PaletteGenerationRequest,
): PaletteGenerationResult {
  vibrancyMultiplier(request.vibrancy);
  validateStops(request.stops);
  const families: GeneratedFamily[] = [];
  const errors: {familyId: string; message: string}[] = [];

  for (const family of request.families) {
    try {
      const generated: GeneratedFamily = {
        id: family.id,
        name: family.name,
        seed: normalizedHex(family.seed),
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
    request,
    families,
    coordination: buildCoordinationDiagnostics(request, families),
    errors,
  };
}

export function serializeGenerationResult(
  result: PaletteGenerationResult,
): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}
