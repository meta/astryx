// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file getChartColors.ts
 * @output Pure function to resolve chart colors from a theme — no React required
 * @position Foundation utility; consumed by useChartColors and non-React contexts
 *
 * Takes a token resolver function (or a defined theme + mode) and returns
 * the full chart colors API. The useChartColors hook wraps this.
 *
 * Palettes degrade gracefully for any count: the categorical scale wraps
 * around its slots, and the sequential/diverging scales pick hand-tuned token
 * stops when enough exist and interpolate across the ramp when more are asked
 * for. The theme entry point resolves through the canonical token resolver, so
 * data tokens fall back to their defaults even when a theme doesn't override
 * them.
 */

import {resolveThemeTokens, type DefinedTheme} from '@astryxdesign/core/theme';
import {
  parseHex,
  parseColor,
  formatHex,
  formatColor,
} from '@astryxdesign/core/utils';

// =============================================================================
// Types
// =============================================================================

/** Hue names available in the sequential ramps */
export type SequentialHue =
  | 'blue'
  | 'shamrock'
  | 'orange'
  | 'pink'
  | 'purple'
  | 'red'
  | 'teal'
  | 'yellow'
  | 'gray';

/** The chart colors API returned by both getChartColors and useChartColors */
export interface ChartColorsAPI {
  categorical(n: number): string[];
  sequential: Record<SequentialHue, (n: number) => string[]>;
  diverging: {
    positiveNegative(n: number): string[];
    coldHot(n: number): string[];
    custom(
      neg: SequentialHue,
      pos: SequentialHue,
      n: number,
      midpoint?: string,
    ): string[];
  };
  semantic: {
    positive: string;
    negative: string;
    warning: string;
    neutral: string;
  };
  /** Structural colors for chart chrome — axes, grid, ticks, labels */
  structural: {
    axis: string;
    grid: string;
    tick: string;
    label: string;
  };
  alpha(hex: string, opacity: number): string;
}

/** A function that resolves a token name to its current value */
export type TokenResolver = (name: string) => string;

// =============================================================================
// Internals
// =============================================================================

const CATEGORICAL_TOKENS = [
  '--color-data-categorical-blue',
  '--color-data-categorical-orange',
  '--color-data-categorical-purple',
  '--color-data-categorical-green',
  '--color-data-categorical-pink',
  '--color-data-categorical-cyan',
  '--color-data-categorical-red',
  '--color-data-categorical-teal',
  '--color-data-categorical-brown',
  '--color-data-categorical-indigo',
] as const;

const SEQUENTIAL_HUES: SequentialHue[] = [
  'blue',
  'shamrock',
  'orange',
  'pink',
  'purple',
  'red',
  'teal',
  'yellow',
  'gray',
];

/** Interpolate between two hex colors in sRGB. Non-hex input falls back to the nearer endpoint. */
function lerpHex(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (ca === null || cb === null) {
    return t < 0.5 ? a : b;
  }
  const mix = (x: number, y: number): number => x + (y - x) * t;
  return formatHex(mix(ca.r, cb.r), mix(ca.g, cb.g), mix(ca.b, cb.b));
}

/**
 * Sample `n` colors from an ordered ramp of stops.
 * - `n <= stops.length` → picks the nearest exact stops, preserving the
 *   hand-tuned design-token values.
 * - `n > stops.length` → interpolates across the ramp so any count is supported
 *   instead of silently capping at the number of stops.
 * - `n === 1` → the middle stop, a single representative tone.
 */
function sampleRamp(stops: string[], n: number): string[] {
  const len = stops.length;
  // A non-finite count (e.g. Infinity) would make the Array.from calls below
  // attempt a ~2**53 element allocation and hang, so treat it as empty.
  if (!Number.isFinite(n) || n <= 0 || len === 0) {
    return [];
  }
  if (n === 1) {
    return [stops[Math.floor((len - 1) / 2)]];
  }
  if (len === 1) {
    return Array.from({length: n}, () => stops[0]);
  }
  if (n <= len) {
    return Array.from(
      {length: n},
      (_, i) => stops[Math.round((i * (len - 1)) / (n - 1))],
    );
  }
  return Array.from({length: n}, (_, i) => {
    const t = (i * (len - 1)) / (n - 1);
    const lo = Math.floor(t);
    const frac = t - lo;
    return frac === 0 ? stops[lo] : lerpHex(stops[lo], stops[lo + 1], frac);
  });
}

/**
 * Apply an opacity to a concrete CSS color (hex — with or without the leading
 * `#` — `rgb()`/`rgba()`, named). The `opacity` argument always wins over any
 * alpha already in the color. Unparseable input (e.g. `var()`) is returned
 * unchanged.
 */
function hexAlpha(hex: string, opacity: number): string {
  // parseColor requires the `#` for hex; fall back to parseHex so bare hex
  // strings (`0064E0`) keep working as they did before #3739.
  const rgba = parseColor(hex) ?? parseHex(hex);
  if (rgba === null) {
    return hex;
  }
  const a = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1;
  return formatColor({...rgba, a});
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Build chart colors from a token resolver function.
 * This is the lowest-level API — pass any function that maps token names to values.
 */
export function getChartColorsFromResolver(
  resolve: TokenResolver,
): ChartColorsAPI {
  const categorical = CATEGORICAL_TOKENS.map(t => resolve(t));

  const ramp = (hue: SequentialHue): string[] =>
    [5, 4, 3, 2, 1].map(step => resolve(`--color-data-${hue}-${step}`));

  const gray1 = resolve('--color-data-gray-1');

  function buildDiverging(
    negHue: SequentialHue,
    posHue: SequentialHue,
    n: number,
    midpoint: string = gray1,
  ): string[] {
    if (n <= 0) {
      return [];
    }
    if (n === 1) {
      return [midpoint];
    }
    const half = Math.floor(n / 2);
    const hasCenter = n % 2 === 1;
    const negSide = sampleRamp(ramp(negHue), half);
    const posSide = sampleRamp(ramp(posHue), half).reverse();
    if (hasCenter) {
      return [...negSide, midpoint, ...posSide];
    }
    return [...negSide, ...posSide];
  }

  return {
    categorical(n: number): string[] {
      // A non-finite count (e.g. Infinity) would make the wrap-around Array.from
      // below attempt a ~2**53 element allocation and hang, so treat it as empty.
      if (!Number.isFinite(n) || n <= 0 || categorical.length === 0) {
        return [];
      }
      // Wrap around the palette so any series count gets a deterministic color.
      return Array.from(
        {length: n},
        (_, i) => categorical[i % categorical.length],
      );
    },

    sequential: Object.fromEntries(
      SEQUENTIAL_HUES.map(hue => [
        hue,
        (n: number): string[] => sampleRamp(ramp(hue), n),
      ]),
    ) as Record<SequentialHue, (n: number) => string[]>,

    diverging: {
      positiveNegative: (n: number) => buildDiverging('shamrock', 'red', n),
      coldHot: (n: number) => buildDiverging('blue', 'red', n),
      custom: (
        neg: SequentialHue,
        pos: SequentialHue,
        n: number,
        mid?: string,
      ) => buildDiverging(neg, pos, n, mid),
    },

    semantic: {
      positive: resolve('--color-data-categorical-green'),
      negative: resolve('--color-data-categorical-red'),
      warning: resolve('--color-data-categorical-orange'),
      neutral: resolve('--color-data-neutral'),
    },

    structural: {
      axis: resolve('--color-border-emphasized'),
      grid: resolve('--color-border'),
      tick: resolve('--color-border-emphasized'),
      label: resolve('--color-text-secondary'),
    },

    alpha: hexAlpha,
  };
}

/**
 * Build chart colors from a defined theme and color mode.
 *
 * Use this in non-React contexts — WebGL setup, SSR, tests, Node scripts.
 *
 * Resolves through the canonical theme token resolver, so data tokens fall back
 * to their defaults when the theme doesn't override them, and both
 * `light-dark()` strings and `[light, dark]` tuples are handled for `mode`.
 *
 * @example
 * ```
 * import { neutralTheme } from '@astryxdesign/theme-neutral';
 * const colors = getChartColors(neutralTheme, 'light');
 * colors.categorical(5)
 * ```
 */
export function getChartColors(
  theme: DefinedTheme,
  mode: 'light' | 'dark' = 'light',
): ChartColorsAPI {
  const tokens = resolveThemeTokens(theme, {mode});
  return getChartColorsFromResolver(name => tokens[name] ?? '');
}
