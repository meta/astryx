// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file expandRadiusScale.ts
 * @input Radius scale configuration { base, multiplier }
 * @output Token overrides for radius tokens
 * @position Theme utility; consumed by defineTheme.ts
 *
 * Computes border-radius values from a base unit and multiplier.
 * --radius-none and --radius-full are always fixed (never affected by multiplier).
 * --radius-inner through --radius-page = base * step * multiplier.
 *
 * Semantic scale:
 *   --radius-none      → 0px (fixed)
 *   --radius-inner     → base × 1 × multiplier (internal corners)
 *   --radius-element   → base × 2 × multiplier (buttons, inputs)
 *   --radius-container → base × 3 × multiplier (cards, panels)
 *   --radius-page      → base × 7 × multiplier (page-level containers)
 *   --radius-chat      → base × 7 × multiplier (chat surfaces; tracks page)
 *   --radius-full      → 9999px (fixed, pill shapes)
 *
 * SYNC: When modified, update:
 * - /packages/core/src/theme/expandRadiusScale.test.ts
 * - /packages/core/src/theme/defineTheme.ts
 * - /packages/cli/assets/theme.template.ts (the annotated field reference)
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Radius scale configuration.
 *
 * @example
 * ```
 * // Default Astryx radius scale
 * { base: 4, multiplier: 1 }
 *
 * // Sharp/brutalist — all radii become 0
 * { base: 4, multiplier: 0 }
 *
 * // Extra rounded
 * { base: 4, multiplier: 1.5 }
 * ```
 */
export interface RadiusScaleConfig {
  /** Base radius unit in px. Default: 4 */
  base: number;
  /** Multiplier applied to scalable tokens (inner through page). Default: 1. Range: 0-2 */
  multiplier: number;
}

/**
 * Generated radius token overrides.
 * Keys are CSS custom property names, values are CSS strings.
 */
export type RadiusScaleTokens = Record<string, string>;

// =============================================================================
// Computation
// =============================================================================

/**
 * Expand a radius scale config into token overrides.
 *
 * --radius-none and --radius-full are fixed anchors.
 * --radius-inner through --radius-page scale with base × step × multiplier.
 *
 * @example
 * ```
 * const tokens = expandRadiusScale({ base: 4, multiplier: 1 });
 * // tokens['--radius-none'] === '0px'
 * // tokens['--radius-inner'] === '4px'       (4 × 1 × 1)
 * // tokens['--radius-element'] === '8px'     (4 × 2 × 1)
 * // tokens['--radius-container'] === '12px'  (4 × 3 × 1)
 * // tokens['--radius-page'] === '28px'       (4 × 7 × 1)
 * // tokens['--radius-chat'] === '28px'       (4 × 7 × 1)
 * // tokens['--radius-full'] === '9999px'
 *
 * const sharp = expandRadiusScale({ base: 4, multiplier: 0 });
 * // All scalable tokens become '0px', none and full unchanged
 * ```
 */
export function expandRadiusScale(
  config: RadiusScaleConfig,
): RadiusScaleTokens {
  const {base, multiplier} = config;
  return {
    '--radius-none': '0px',
    '--radius-inner': `${Math.round(base * 1 * multiplier)}px`,
    '--radius-element': `${Math.round(base * 2 * multiplier)}px`,
    '--radius-container': `${Math.round(base * 3 * multiplier)}px`,
    '--radius-page': `${Math.round(base * 7 * multiplier)}px`,
    // Chat surfaces track the page step (× 7) so they scale with the theme
    // multiplier, but remain a distinct token for independent theming. #2072
    '--radius-chat': `${Math.round(base * 7 * multiplier)}px`,
    '--radius-full': '9999px',
  };
}
