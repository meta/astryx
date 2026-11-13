// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Shared color math for the theme preview + audit panel.
 *
 * Originally inlined in ThemePalettePreview.tsx — extracted so the
 * "snap-to-tonal-step" detector in the audit drawer can reuse the same
 * sRGB → linear → XYZ → Lab pipeline that builds the visible ramps.
 *
 * Color spaces used:
 *   - sRGB: input/output (hex strings the rest of the app speaks)
 *   - Linear RGB: gamma-stripped sRGB (so light blends linearly)
 *   - XYZ (D65): canonical CIE space, intermediate
 *   - Lab (D65): perceptually-uniform; ΔE = euclidean distance is "good enough"
 *     for design tokens (~ΔE 76; we don't need ΔE2000 for swatch matching).
 *
 * "HCT" here is approximate: hue/chroma derived from Lab a/b, tone = L*.
 * It is NOT the full Material HCT (CAM16-based). It's the same approximation
 * the existing tonal preview already uses, kept consistent so what the audit
 * drawer reports matches what the visible ramps render.
 */

export type Rgb = [number, number, number];

export interface HCT {
  /** Hue, 0–360° (Lab a/b → polar angle) */
  hue: number;
  /** Chroma, sqrt(a² + b²) — distance from gray axis in Lab */
  chroma: number;
  /** Tone, equivalent to Lab L* (0–100) */
  tone: number;
}

// =============================================================================
// sRGB ↔ linear ↔ XYZ ↔ Lab
// =============================================================================

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '').slice(0, 6);
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return '#' + clamp(r) + clamp(g) + clamp(b);
}

export function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.min(255, Math.max(0, s * 255)));
}

export function linearRgbToXyz(r: number, g: number, b: number): Rgb {
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  ];
}

export function xyzToLinearRgb(x: number, y: number, z: number): Rgb {
  return [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ];
}

const D65: Rgb = [0.95047, 1.0, 1.08883];

function labF(t: number): number {
  const d = 6 / 29;
  return t > d * d * d ? Math.cbrt(t) : t / (3 * d * d) + 4 / 29;
}

function labFInv(t: number): number {
  const d = 6 / 29;
  return t > d ? t * t * t : 3 * d * d * (t - 4 / 29);
}

export function xyzToLab(x: number, y: number, z: number): Rgb {
  const fx = labF(x / D65[0]);
  const fy = labF(y / D65[1]);
  const fz = labF(z / D65[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToXyz(L: number, a: number, b: number): Rgb {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  return [labFInv(fx) * D65[0], labFInv(fy) * D65[1], labFInv(fz) * D65[2]];
}

export function hexToLab(hex: string): Rgb {
  const [r, g, b] = hexToRgb(hex);
  const [x, y, z] = linearRgbToXyz(
    srgbToLinear(r),
    srgbToLinear(g),
    srgbToLinear(b),
  );
  return xyzToLab(x, y, z);
}

// =============================================================================
// HCT (approximate) — same approximation the visible tonal ramps use
// =============================================================================

export function hexToHct(hex: string): HCT {
  const [L, a, bL] = hexToLab(hex);
  let hue = (Math.atan2(bL, a) * 180) / Math.PI;
  if (hue < 0) {
    hue += 360;
  }
  return {
    hue,
    chroma: Math.sqrt(a * a + bL * bL),
    tone: Math.max(0, Math.min(100, L)),
  };
}

/**
 * Inverse of hexToHct — solves Lab → sRGB and binary-searches chroma so
 * the result lands inside the sRGB gamut (high-chroma tones at the dark/light
 * extremes can't be expressed without clipping; we back off chroma until they
 * round-trip cleanly through sRGB).
 */
export function hctToHex({hue, chroma, tone}: HCT): string {
  if (tone <= 0) {
    return '#000000';
  }
  if (tone >= 100) {
    return '#ffffff';
  }
  if (chroma < 0.5) {
    const y = labFInv((tone + 16) / 116);
    const g = linearToSrgb(y);
    return '#' + [g, g, g].map(c => c.toString(16).padStart(2, '0')).join('');
  }
  let lo = 0;
  let hi = chroma;
  let best = '#000000';
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    const hRad = (hue * Math.PI) / 180;
    const a = Math.cos(hRad) * mid;
    const b = Math.sin(hRad) * mid;
    const [x, y, z] = labToXyz(tone, a, b);
    const [lr, lg, lb] = xyzToLinearRgb(x, y, z);
    const r = linearToSrgb(lr);
    const g = linearToSrgb(lg);
    const bv = linearToSrgb(lb);
    const ok =
      Math.abs(srgbToLinear(r) - lr) < 0.02 &&
      Math.abs(srgbToLinear(g) - lg) < 0.02 &&
      Math.abs(srgbToLinear(bv) - lb) < 0.02 &&
      r >= 0 &&
      r <= 255 &&
      g >= 0 &&
      g <= 255 &&
      bv >= 0 &&
      bv <= 255;
    if (ok) {
      best =
        '#' + [r, g, bv].map(c => c.toString(16).padStart(2, '0')).join('');
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return best;
}

// =============================================================================
// Tonal ramps — must mirror the visible ramps in ThemePalettePreview
// =============================================================================

export const TONE_STEPS = [
  0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95,
  100,
] as const;

export type ToneStep = (typeof TONE_STEPS)[number];

/**
 * Light-mode tonal palette: 21 perceptually-uniform tones (T0 → T100).
 * Low-tone chroma is boosted (1 + (50 - tone) / 40) so dark colored text
 * stays visibly hued; capped at chroma × 1.8 so peak saturation doesn't
 * exceed what the gamut binary-search inside hctToHex can reach.
 */
export function tonalPalette(
  hue: number,
  chroma: number,
): Record<number, string> {
  const result: Record<number, string> = {};
  const maxChroma = chroma * 1.8;
  for (const t of TONE_STEPS) {
    const boost = t < 50 ? 1 + (50 - t) / 40 : 1;
    result[t] = hctToHex({
      hue,
      chroma: Math.min(chroma * boost, maxChroma),
      tone: t,
    });
  }
  return result;
}

/**
 * Dark-mode tonal palette per the audit rubric in issue #2150 §4:
 * mid-tones lift +5 (tapered between T80/T95), chroma × 0.85 across the
 * ramp so saturated stops don't vibrate against a dark canvas.
 */
const DARK_TONE_LIFT = 5;
const DARK_LIFT_TAPER_START = 80;
const DARK_LIFT_TAPER_END = 95;
const DARK_CHROMA_FACTOR = 0.85;

export function darkTonalPalette(
  hue: number,
  chroma: number,
): Record<number, string> {
  const adjustedChroma = chroma * DARK_CHROMA_FACTOR;
  const maxChroma = adjustedChroma * 1.8;
  const result: Record<number, string> = {};
  for (const t of TONE_STEPS) {
    let lift = DARK_TONE_LIFT;
    if (t >= DARK_LIFT_TAPER_END) {
      lift = 0;
    } else if (t > DARK_LIFT_TAPER_START) {
      const ratio =
        (DARK_LIFT_TAPER_END - t) /
        (DARK_LIFT_TAPER_END - DARK_LIFT_TAPER_START);
      lift = DARK_TONE_LIFT * ratio;
    }
    const liftedTone = Math.min(100, t + lift);
    const boost = liftedTone < 50 ? 1 + (50 - liftedTone) / 40 : 1;
    result[t] = hctToHex({
      hue,
      chroma: Math.min(adjustedChroma * boost, maxChroma),
      tone: liftedTone,
    });
  }
  return result;
}

export type Mode = 'light' | 'dark';

export function tonalPaletteForMode(
  hue: number,
  chroma: number,
  mode: Mode,
): Record<number, string> {
  return mode === 'dark'
    ? darkTonalPalette(hue, chroma)
    : tonalPalette(hue, chroma);
}

// =============================================================================
// ΔE (CIE76) — close-enough perceptual distance for swatch matching
// =============================================================================

/**
 * Plain euclidean distance in Lab. CIE76 is intentional: ΔE2000 is more
 * accurate but adds enough complexity that for "is this token snapped to
 * a ramp step?" we'd just be reporting the same answers with extra digits.
 * The thresholds in deltaEVerdict are calibrated for CIE76.
 */
export function deltaE(labA: Rgb, labB: Rgb): number {
  const dL = labA[0] - labB[0];
  const da = labA[1] - labB[1];
  const db = labA[2] - labB[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

export function deltaEHex(a: string, b: string): number {
  return deltaE(hexToLab(a), hexToLab(b));
}

/**
 * Bucket a ΔE into a human verdict.
 * Calibrated for "did a designer pick this off a ramp on purpose?":
 *   - ≤1.0  → exact: round-trip noise, indistinguishable
 *   - ≤2.5  → snapped: visually identical, almost certainly intentional
 *   - ≤5.0  → near: probably picked off the ramp then nudged
 *   - >5.0  → off: free-form color, not on any ramp
 */
export type SnapVerdict = 'exact' | 'snapped' | 'near' | 'off';

export function deltaEVerdict(d: number): SnapVerdict {
  if (d <= 1.0) {
    return 'exact';
  }
  if (d <= 2.5) {
    return 'snapped';
  }
  if (d <= 5.0) {
    return 'near';
  }
  return 'off';
}

// =============================================================================
// Snap detection — find the closest tonal step across a set of ramps
// =============================================================================

export interface RampSeed {
  /** Display name shown in audit reports ("Blue", "Stone Neutral", etc.) */
  name: string;
  /** Source hex used to compute hue/chroma (the same input the visible ramp uses) */
  sourceHex: string;
  /** Optional semantic tag ("Success", "Error", …) — informational only */
  semantic?: string;
  /** Optional precomputed canonical light-mode ramp. */
  tones?: Readonly<Record<string | number, string | number>>;
  /** Optional dark-mode source and ramp for mode-aware theme palettes. */
  dark?: {
    sourceHex?: string;
    tones?: Readonly<Record<string | number, string | number>>;
  };
}

export interface SnapMatch {
  rampName: string;
  /** Optional semantic the matched ramp carries ("Success" etc.) */
  rampSemantic?: string;
  tone: ToneStep;
  hex: string;
  deltaE: number;
  verdict: SnapVerdict;
}

/**
 * Find the closest tone step across `seeds` for `targetHex`.
 * Returns the single best match (lowest ΔE). When no ramps are provided
 * or the target is non-color, returns null.
 *
 * Uses the same per-mode ramp generator the preview uses so audit results
 * line up with the visible swatches the user sees on the page.
 */
export function findClosestRampStep(
  targetHex: string,
  seeds: RampSeed[],
  mode: Mode,
): SnapMatch | null {
  if (seeds.length === 0) {
    return null;
  }
  const targetLab = hexToLab(targetHex);
  let best: SnapMatch | null = null;
  for (const seed of seeds) {
    const canonicalTones = (mode === 'dark' && seed.dark?.tones) || seed.tones;
    let lookup: (t: number) => string | undefined;
    if (canonicalTones) {
      lookup = t => {
        const value = canonicalTones[t];
        return typeof value === 'string' ? value : undefined;
      };
    } else {
      const sourceHex =
        (mode === 'dark' && seed.dark?.sourceHex) || seed.sourceHex;
      const {hue, chroma} = hexToHct(sourceHex);
      const ramp = tonalPaletteForMode(hue, chroma, mode);
      lookup = t => ramp[t];
    }
    for (const t of TONE_STEPS) {
      const swatch = lookup(t);
      // Canonical ramps may be sparse (e.g. only 0/5/10/…/100). Skip
      // tone steps without a value rather than crashing on `undefined`.
      if (!swatch) {
        continue;
      }
      const d = deltaE(targetLab, hexToLab(swatch));
      if (best == null || d < best.deltaE) {
        best = {
          rampName: seed.name,
          rampSemantic: seed.semantic,
          tone: t,
          hex: swatch,
          deltaE: d,
          verdict: deltaEVerdict(d),
        };
      }
    }
  }
  return best;
}
