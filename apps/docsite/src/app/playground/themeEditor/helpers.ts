// Copyright (c) Meta Platforms, Inc. and affiliates.

import {COMPONENT_VAR_TO_OVERRIDE, COMPONENT_VAR_NAMES} from './constants';
import {expandRadiusScale} from '@astryxdesign/core/theme';

export function parseLightDark(
  value: string,
): {light: string; dark: string} | null {
  const match = value.match(/^light-dark\(([^,]+),\s*([^)]+)\)$/);
  if (match) {
    return {light: match[1].trim(), dark: match[2].trim()};
  }
  return null;
}

export function parseColorWithAlpha(
  value: string,
): {hex: string; alpha: number} | null {
  const hex8Match = value.match(/^#([0-9A-Fa-f]{8})$/);
  if (hex8Match) {
    const hex = '#' + hex8Match[1].slice(0, 6);
    const alpha = parseInt(hex8Match[1].slice(6, 8), 16) / 255;
    return {hex, alpha: Math.round(alpha * 100) / 100};
  }
  const hex6Match = value.match(/^#([0-9A-Fa-f]{6})$/);
  if (hex6Match) {
    return {hex: value, alpha: 1};
  }
  const hex3Match = value.match(/^#([0-9A-Fa-f]{3})$/);
  if (hex3Match) {
    const r = hex3Match[1][0];
    const g = hex3Match[1][1];
    const b = hex3Match[1][2];
    return {hex: `#${r}${r}${g}${g}${b}${b}`, alpha: 1};
  }
  const rgbaMatch = value.match(
    /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/,
  );
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1], 10).toString(16).padStart(2, '0');
    const g = parseInt(rgbaMatch[2], 10).toString(16).padStart(2, '0');
    const b = parseInt(rgbaMatch[3], 10).toString(16).padStart(2, '0');
    const alpha = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1;
    return {hex: `#${r}${g}${b}`, alpha};
  }
  return null;
}

export function colorWithAlphaToString(hex: string, alpha: number): string {
  if (alpha >= 1) {
    return hex.toUpperCase();
  }
  const alphaHex = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${alphaHex}`.toUpperCase();
}

export function getTokenLabel(tokenName: string): string {
  return tokenName
    .replace(/^--/, '')
    .replace(/-/g, ' ')
    .replace(/\bbackground /gi, '')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/** The root font size the editor's px controls are written against. */
const DEFAULT_ROOT_FONT_SIZE_PX = 16;

/**
 * A spacing token value in px at the default 16px root: the default scale's
 * `'0.5rem'` reads as 8, and a theme's own px value (`'12px'`) as written.
 * `NaN` for anything else.
 */
export function spacingToPx(value: string | undefined): number {
  const match = /^(\d*\.?\d+)(px|rem)$/.exec((value ?? '').trim());
  if (match == null) {
    return Number.NaN;
  }
  const length = Number.parseFloat(match[1]);
  return match[2] === 'rem' ? length * DEFAULT_ROOT_FONT_SIZE_PX : length;
}

/**
 * Build the `--spacing-*` token ramp from a base step in px: each token is
 * `round(base × step)` px, written in rem like the default scale so the ramp
 * keeps following the reader's root font size, and the default base (4)
 * reproduces the defaults exactly. Token keys derive from the step (e.g.
 * 0.5 → "0-5").
 */
export function buildSpacingScale(base: number): Record<string, string> {
  const steps = [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const patch: Record<string, string> = {};
  for (const step of steps) {
    patch[`--spacing-${String(step).replace('.', '-')}`] =
      `${Math.round(base * step) / DEFAULT_ROOT_FONT_SIZE_PX}rem`;
  }
  return patch;
}

export interface ConcentricityWarning {
  /** Short Banner title. */
  title: string;
  /** The conflict in concrete px, plus what to change to resolve it. */
  description: string;
}

/**
 * Copy for the warning banner shown under the radius and spacing controls when
 * the two bases diverge, or `null` while concentricity holds.
 *
 * Nested rounded rects look concentric when `inner-radius = outer-radius − gap`.
 * The radius scale steps by `base` per rung (inner ×1, element ×2, container ×3)
 * and the editor nests one spacing step (`--spacing-1` = the spacing base)
 * between rungs, so the relation collapses to `radiusBase === spacingBase`.
 *
 * Educate over enforce: the numbers come from the scales the editor actually
 * generates, so the message stays correct if those scales change. `control`
 * picks which knob the suggestion points at — the banner renders under both
 * sliders and each one offers to move itself. #958
 */
export function getConcentricityWarning(
  control: 'radius' | 'spacing',
  radiusBase: number,
  spacingBase: number,
): ConcentricityWarning | null {
  if (!Number.isFinite(radiusBase) || !Number.isFinite(spacingBase)) {
    return null;
  }
  if (radiusBase === spacingBase) {
    return null;
  }
  const radii = expandRadiusScale({base: radiusBase, multiplier: 1});
  const container = parseInt(radii['--radius-container'], 10);
  const element = parseInt(radii['--radius-element'], 10);
  const gap = spacingToPx(buildSpacingScale(spacingBase)['--spacing-1']);
  const suggestion =
    control === 'radius'
      ? `Set radius to ${spacingBase}px`
      : `Set spacing to ${radiusBase}px`;
  return {
    title: 'Concentricity broken',
    description:
      `Container radius (${container}px) − spacing-1 (${gap}px) = ${container - gap}px, ` +
      `but element radius is ${element}px, so nested corners won't look ` +
      `concentric. ${suggestion} to match.`,
  };
}

type ComponentStyleMap = Record<string, Record<string, Record<string, string>>>;

export function buildComponentOverrides(
  componentTokens: Record<string, string>,
): ComponentStyleMap {
  const components: ComponentStyleMap = {};
  for (const [varName, value] of Object.entries(componentTokens)) {
    const mappings = COMPONENT_VAR_TO_OVERRIDE[varName];
    if (!mappings) {
      continue;
    }
    for (const {component, cssProperty} of mappings) {
      components[component] ??= {};
      components[component].base ??= {};
      components[component].base[cssProperty] = value;
    }
  }
  return components;
}

/**
 * Deep-merge any number of component style maps into a fresh object. Later
 * maps win at the leaf level; nested selector objects (e.g. `variant:ghost`
 * → `:hover`) are merged recursively rather than replaced wholesale. Used to
 * layer a preset theme's component overrides under the editor's own token-
 * and custom-overrides so all three sources compose correctly.
 */
export function mergeComponentStyleMaps(
  ...maps: Array<Record<string, unknown> | undefined>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const map of maps) {
    if (!map) {
      continue;
    }
    for (const [key, value] of Object.entries(map)) {
      const existing = result[key];
      if (
        value &&
        typeof value === 'object' &&
        existing &&
        typeof existing === 'object'
      ) {
        result[key] = mergeComponentStyleMaps(
          existing as Record<string, unknown>,
          value as Record<string, unknown>,
        );
      } else if (value && typeof value === 'object') {
        result[key] = mergeComponentStyleMaps(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

/**
 * Serialize a nested style object to indented `defineTheme`-style source
 * lines. Handles arbitrary selector nesting (base, `variant:*`, `:hover`,
 * etc.) so the exported code matches what the live preview renders.
 */
function serializeStyleObject(
  obj: Record<string, unknown>,
  indentLevel: number,
): string[] {
  const pad = '  '.repeat(indentLevel);
  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const escapedKey = key.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    if (value && typeof value === 'object') {
      lines.push(`${pad}'${escapedKey}': {`);
      lines.push(
        ...serializeStyleObject(
          value as Record<string, unknown>,
          indentLevel + 1,
        ),
      );
      lines.push(`${pad}},`);
    } else {
      const escapedVal = String(value)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");
      lines.push(`${pad}'${escapedKey}': '${escapedVal}',`);
    }
  }
  return lines;
}

interface CustomOverrideEntry {
  component: string;
  property: string;
  value: string;
}

export function generateThemeCode(
  themeName: string,
  tokens: Record<string, string>,
  allDefaults: Record<string, string>,
  typeScaleBase: number,
  typeScaleRatio: number,
  customOverrides: CustomOverrideEntry[] = [],
  baseComponents: Record<string, unknown> = {},
): string {
  const changedTokens: Record<string, string> = {};
  const changedComponentTokens: Record<string, string> = {};
  for (const [key, value] of Object.entries(tokens)) {
    if (allDefaults[key] !== value) {
      if (COMPONENT_VAR_NAMES.has(key)) {
        changedComponentTokens[key] = value;
      } else {
        changedTokens[key] = value;
      }
    }
  }

  // Custom overrides are flat (component → base → property). Build them as a
  // map so they can be merged on top of the preset + token-derived overrides.
  const customMap: Record<string, {base: Record<string, string>}> = {};
  for (const override of customOverrides) {
    customMap[override.component] ??= {base: {}};
    customMap[override.component].base[override.property] = override.value;
  }
  const components = mergeComponentStyleMaps(
    baseComponents,
    buildComponentOverrides(changedComponentTokens),
    customMap,
  );

  const lines: string[] = [
    "import {defineTheme} from '@astryxdesign/core/theme';",
    '',
    `export const ${themeName}Theme = defineTheme({`,
    `  name: '${themeName}',`,
  ];

  if (typeScaleBase !== 14 || typeScaleRatio !== 1.2) {
    lines.push('  typography: {');
    lines.push(
      `    scale: {base: ${typeScaleBase}, ratio: ${typeScaleRatio}},`,
    );
    lines.push('  },');
  }

  if (Object.keys(changedTokens).length > 0) {
    lines.push('  tokens: {');
    for (const [key, value] of Object.entries(changedTokens)) {
      lines.push(`    '${key}': '${value}',`);
    }
    lines.push('  },');
  }

  if (Object.keys(components).length > 0) {
    lines.push('  components: {');
    lines.push(...serializeStyleObject(components, 2));
    lines.push('  },');
  }

  lines.push('});');
  return lines.join('\n');
}
