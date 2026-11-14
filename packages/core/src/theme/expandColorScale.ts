// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file expandColorScale.ts
 * @input Color scale configuration { accent?, neutralStyle?, contrast? }
 * @output Token overrides for derivable color tokens
 * @position Theme utility; consumed by defineTheme.ts
 *
 * Generates color token overrides from an accent seed using the HCT
 * perceptual color model. Only produces tokens that meaningfully
 * derive from the accent — status colors, categorical hues, and fixed
 * tokens (on-dark/on-light) fall through to colorDefaults.
 *
 * `accent` is optional: a neutral-only config still gets the full neutral
 * ramp (seeded from the default accent's hue) while the accent tokens
 * themselves fall through to colorDefaults, same as the tokens above.
 *
 * `accent` also accepts a `[light, dark]` tuple (matching `TokenValue` in
 * defineTheme). A tuple seeds each color scheme from its own half: the
 * light side of every generated `light-dark()` pair derives from the light
 * accent's palettes, the dark side from the dark accent's. A plain string
 * seeds both sides identically, token for token the same output as before
 * tuples existed.
 *
 * WCAG contrast guarantees (asserted in expandColorScale.test.ts):
 * - Text tones are guaranteed >= 4.5:1 against their surfaces by tone
 *   spacing alone — HCT tone is CIE L*, which fixes relative luminance
 *   regardless of hue/chroma, so the fixed tone assignments hold for any
 *   accent/neutralStyle (WCAG 1.4.3), and each half of a tuple pairs with
 *   surfaces derived from that same seed.
 * - --color-border-emphasized is tone-bumped until it reaches >= 3:1
 *   against the generated surface (WCAG 1.4.11).
 * - --color-border-control (form-control edges) is tone-bumped until it
 *   reaches >= 3:1 against both the generated surface and page body.
 * - --color-border, --color-skeleton, and --color-track are intentionally
 *   decorative/redundant cues and are NOT held to 3:1 — see the test file
 *   for the rationale.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/theme/defineTheme.ts
 * - /packages/cli/assets/theme.template.ts (the annotated field reference)
 */

import {contrastRatio} from './contrast';
import {hexToHct, hctToHex, tonalPalette, hexWithAlpha} from './hct';

// =============================================================================
// Types
// =============================================================================

/**
 * Color scale configuration.
 *
 * @example
 * ```
 * // Minimal — just a seed color
 * { accent: '#0064E0' }
 *
 * // Per-scheme seeds: light palettes from '#0064E0', dark from '#48CAE4'
 * { accent: ['#0064E0', '#48CAE4'] }
 *
 * // With customization
 * { accent: '#B7410E', neutralStyle: 'warm', contrast: 'high' }
 *
 * // Neutral-only — keeps the default accent, themes the neutrals
 * { neutralStyle: 'warm' }
 * ```
 */
export interface ColorScaleConfig {
  /**
   * Seed accent color. Everything derives from this.
   *
   * Either a single hex (#RRGGBB) used for both color schemes, or a
   * `[light, dark]` hex tuple: the light scheme's palettes derive from
   * the light seed and the dark scheme's palettes from the dark seed.
   *
   * Optional. When omitted, the neutral palettes are seeded from the
   * default accent's hue and the accent tokens (--color-accent,
   * --color-accent-muted, --color-on-accent) are not generated — they
   * fall through to colorDefaults.
   */
  accent?: string | [light: string, dark: string];

  /**
   * Neutral tone warmth. Controls how much of the seed's hue bleeds
   * into neutral/background colors.
   * @default 'cool'
   */
  neutralStyle?: 'warm' | 'cool' | 'neutral';

  /**
   * Contrast level. `'high'` pulls text, icons, and borders toward stronger
   * tones (and thickens the subtle border's alpha) so structural and textual
   * boundaries stay perceivable.
   * @default 'standard'
   */
  contrast?: 'standard' | 'high';
}

export type ColorScaleTokens = Record<string, string>;

// =============================================================================
// Neutral chroma by style
// =============================================================================

const NEUTRAL_CHROMA: Record<string, number> = {
  warm: 7,
  cool: 5,
  neutral: 3,
};

const NEUTRAL_VARIANT_CHROMA: Record<string, number> = {
  warm: 10,
  cool: 8,
  neutral: 6,
};

/**
 * Hue source for accent-less configs — the light half of
 * colorDefaults['--color-accent'] (a test guards the two against drift).
 * Only its hue reaches the output: the accent tokens stay ungenerated, so
 * they keep their colorDefaults values rather than this seed's derivation.
 */
const DEFAULT_ACCENT_SEED = '#0064E0';

// =============================================================================
// Computation
// =============================================================================

function ld(light: string, dark: string): string {
  return `light-dark(${light}, ${dark})`;
}

function accentWithAlpha(alpha: number): string {
  return `color-mix(in srgb, var(--color-accent) ${alpha * 100}%, transparent)`;
}

/** WCAG 1.4.11 minimum contrast for non-text UI boundaries. */
const NON_TEXT_MIN_CONTRAST = 3;

/**
 * Walk tone in `step` increments from `startTone` until the color reaches
 * `minRatio` against `background`, and return the resulting hex.
 *
 * Used for tokens whose preferred tone is not guaranteed by tone spacing
 * alone (e.g. --color-border-emphasized). Because HCT tone is CIE L*,
 * each step moves luminance monotonically, so the loop always terminates —
 * at worst at pure black/white (21:1 against anything mid-range).
 */
export function ensureContrastTone(
  hue: number,
  chroma: number,
  startTone: number,
  step: -1 | 1,
  background: string,
  minRatio: number,
): string {
  let tone = startTone;
  let hex = hctToHex({hue, chroma, tone});
  while (
    contrastRatio(hex, background) < minRatio &&
    tone + step >= 0 &&
    tone + step <= 100
  ) {
    tone += step;
    hex = hctToHex({hue, chroma, tone});
  }
  return hex;
}

/**
 * Expand a color scale config into Astryx color token overrides.
 *
 * Only generates tokens that meaningfully derive from the accent color.
 * Tokens that are convention-bound (status colors, categorical hues,
 * --color-on-dark/on-light) are NOT generated — they fall through
 * to colorDefaults.
 *
 * A `[light, dark]` tuple accent seeds each scheme separately: the light
 * half of every generated `light-dark()` pair comes from the light seed's
 * palettes, the dark half from the dark seed's. A string accent seeds both
 * halves from the same palettes, exactly as before tuples were supported.
 *
 * Without an `accent`, the accent tokens join that fall-through set: the
 * neutrals are seeded from the default accent's hue, and --color-accent,
 * --color-accent-muted and --color-on-accent keep their colorDefaults values.
 *
 * @example
 * ```
 * const tokens = expandColorScale({ accent: '#0064E0' });
 * // tokens['--color-accent'] === 'light-dark(#..., #...)'
 *
 * const perScheme = expandColorScale({ accent: ['#0064E0', '#48CAE4'] });
 * // light half derives from #0064E0, dark half from #48CAE4
 *
 * const neutralOnly = expandColorScale({ neutralStyle: 'warm' });
 * // neutralOnly['--color-accent'] === undefined
 * ```
 */
export function expandColorScale(config: ColorScaleConfig): ColorScaleTokens {
  const {accent, neutralStyle = 'cool', contrast = 'standard'} = config;

  // Normalize to per-scheme seeds. A string accent (or an absent one) uses
  // the same seed for both halves, which keeps single-seed output identical
  // to the pre-tuple implementation.
  const [lightAccent, darkAccent] = Array.isArray(accent)
    ? accent
    : [accent, accent];

  const lightSeed = hexToHct(lightAccent ?? DEFAULT_ACCENT_SEED);
  const sameSeed = darkAccent === lightAccent;
  const darkSeed = sameSeed
    ? lightSeed
    : hexToHct(darkAccent ?? DEFAULT_ACCENT_SEED);

  const neutralChroma = NEUTRAL_CHROMA[neutralStyle] ?? 5;
  const neutralVariantChroma = NEUTRAL_VARIANT_CHROMA[neutralStyle] ?? 8;

  // Palette naming: *L palettes feed the light (first) half of each ld()
  // pair below, *D palettes the dark (second) half. With a single seed the
  // D palettes alias the L ones.
  const PL = tonalPalette(lightSeed.hue, Math.max(lightSeed.chroma, 48));
  const NL = tonalPalette(lightSeed.hue, neutralChroma);
  const NVL = tonalPalette(lightSeed.hue, neutralVariantChroma);
  const PD = sameSeed
    ? PL
    : tonalPalette(darkSeed.hue, Math.max(darkSeed.chroma, 48));
  const ND = sameSeed ? NL : tonalPalette(darkSeed.hue, neutralChroma);
  const NVD = sameSeed ? NVL : tonalPalette(darkSeed.hue, neutralVariantChroma);

  const isHigh = contrast === 'high';

  const textPrimaryLightTone = isHigh ? 0 : 10;
  const textPrimaryDarkTone = isHigh ? 99 : 90;
  const textSecondaryLightTone = isHigh ? 20 : 30;
  const textSecondaryDarkTone = isHigh ? 80 : 70;

  // Borders track contrast the same way text does: high contrast pulls the
  // emphasized border tone toward mid-scale (stronger against both the near-
  // white light surface and the near-black dark surface) and thickens the
  // otherwise-decorative subtle hairline by doubling its alpha, so structural
  // boundaries stay perceivable for users who opt into high contrast.
  const borderSubtleAlpha = isHigh ? 0.2 : 0.1;

  // Emphasized borders outline form controls (CheckboxInput, Selector), so
  // they are non-text UI boundaries under WCAG 1.4.11 and must reach 3:1
  // against the surface they sit on. High contrast starts at a more
  // aggressive tone (50 vs 70/30), guaranteeing a stronger result; standard
  // contrast starts at 70/30 and walks toward mid-scale only as far as needed.
  const borderEmphasizedStartLight = isHigh ? 50 : 70;
  const borderEmphasizedStartDark = isHigh ? 50 : 30;
  const borderEmphasized = ld(
    ensureContrastTone(
      lightSeed.hue,
      neutralVariantChroma,
      borderEmphasizedStartLight,
      -1,
      NL[99],
      NON_TEXT_MIN_CONTRAST,
    ),
    ensureContrastTone(
      darkSeed.hue,
      neutralVariantChroma,
      borderEmphasizedStartDark,
      1,
      ND[10],
      NON_TEXT_MIN_CONTRAST,
    ),
  );

  // A form control's edge holds 3:1 against both the surface and the page
  // body. The body is the darker of the two in each scheme, so the light edge
  // (darker than both) is checked against the body and the dark edge (lighter
  // than both) against the surface.
  const borderControl = ld(
    ensureContrastTone(
      lightSeed.hue,
      neutralVariantChroma,
      borderEmphasizedStartLight,
      -1,
      NL[95],
      NON_TEXT_MIN_CONTRAST,
    ),
    ensureContrastTone(
      darkSeed.hue,
      neutralVariantChroma,
      borderEmphasizedStartDark,
      1,
      ND[10],
      NON_TEXT_MIN_CONTRAST,
    ),
  );

  return {
    // Core semantic — only with a seed accent. Without one these fall through
    // to colorDefaults, whose --color-accent is NOT what the default seed
    // derives: defaulting the seed instead of omitting the tokens would
    // recolor every neutral-only theme. Nullish and not truthy, matching the
    // seed above, so a supplied-but-malformed accent keeps its old behavior.
    ...(accent != null
      ? {
          '--color-accent': ld(PL[40], PD[80]),
          // Derived accent tokens reference --color-accent instead of baking its
          // resolved hex, so a scoped override of the base token re-accents the
          // whole subtree at runtime. --color-on-accent stays baked: it is a
          // contrast computation against the accent, which CSS cannot express.
          '--color-accent-muted': ld(
            accentWithAlpha(0.2),
            accentWithAlpha(0.25),
          ),
          '--color-on-accent': ld(PL[100], PD[20]),
        }
      : null),
    '--color-neutral': ld(hexWithAlpha(NL[10], 0.1), hexWithAlpha(ND[90], 0.2)),
    '--color-background-surface': ld(NL[99], ND[10]),
    '--color-background-body': ld(NL[95], ND[5]),
    '--color-overlay': ld(hexWithAlpha(NL[10], 0.4), hexWithAlpha(ND[10], 0.6)),
    '--color-overlay-hover': ld(
      hexWithAlpha(NL[10], 0.05),
      hexWithAlpha(ND[100], 0.05),
    ),
    '--color-overlay-pressed': ld(
      hexWithAlpha(NL[10], 0.1),
      hexWithAlpha(ND[100], 0.1),
    ),
    '--color-background-muted': ld(
      hexWithAlpha(NL[10], 0.05),
      hexWithAlpha(ND[10], 0.5),
    ),

    // Text
    '--color-text-primary': ld(
      NL[textPrimaryLightTone],
      ND[textPrimaryDarkTone],
    ),
    '--color-text-secondary': ld(
      NVL[textSecondaryLightTone],
      NVD[textSecondaryDarkTone],
    ),
    '--color-text-disabled': ld(NVL[60], NVD[40]),
    '--color-text-accent': 'var(--color-accent)',

    // Icon
    '--color-icon-accent': 'var(--color-accent)',
    '--color-icon-primary': ld(
      NL[textPrimaryLightTone],
      ND[textPrimaryDarkTone],
    ),
    '--color-icon-secondary': ld(
      NVL[textSecondaryLightTone],
      NVD[textSecondaryDarkTone],
    ),
    '--color-icon-disabled': ld(NVL[60], NVD[40]),

    // Surface variants
    '--color-background-card': ld(NL[99], ND[10]),
    '--color-background-popover': ld(NL[99], ND[20]),
    '--color-background-inverted': ld(NL[10], ND[99]),

    // Border
    // Decorative hairline — not a WCAG 1.4.11 boundary. High contrast
    // doubles the alpha so structural boundaries stay perceivable.
    '--color-border': ld(
      hexWithAlpha(NL[10], borderSubtleAlpha),
      hexWithAlpha(ND[95], borderSubtleAlpha),
    ),
    '--color-border-emphasized': borderEmphasized,
    '--color-border-control': borderControl,

    // Effects
    '--color-skeleton': ld(NVL[70], NVD[30]),
    // Channel-on-body surface (ProgressBar/Slider tracks, Switch off-state).
    // Defaults to the same NV[70]/NV[30] ramp stop as --color-skeleton.
    '--color-track': ld(NVL[70], NVD[30]),
    '--color-shadow': ld(hexWithAlpha(NL[0], 0.1), hexWithAlpha(ND[0], 0.3)),
    '--color-tint-hover': ld('black', 'white'),
  };
}
