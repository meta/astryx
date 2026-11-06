// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file statusRoleDerivation.ts
 * @input A theme's portable and local token maps
 * @output Concrete values for the status roles the theme does not set
 * @position Theme generation step for architecture:theme-compilation INV17,
 *   called by generateThemeRules for runtime and static output alike.
 *
 * Each status (`info`, `success`, `warning`, `error`) has one strong fill,
 * `--color-<status>`. A theme that sets a fill, its content, its pale fill, or
 * a surface gets the roles it leaves unset, computed against its own colours:
 * - `--color-on-<status>`: the theme's light or dark content colour
 *   (`--color-on-dark` or `--color-on-light`), whichever contrasts more with
 *   the fill, or pure white or black when neither reaches 4.5:1;
 * - `--color-text-<status>`: the fill's hue at 4.5:1 on surface and card;
 * - `--color-on-<status>-muted`: the fill's hue at 4.5:1 on the pale fill over
 *   the surface.
 * Fills are never derived: a fill a theme does not set is Core's. Icon and
 * border roles alias the text role through the scoped status-role aliases in
 * generateThemeRules, so they are not computed here.
 */

import {colorDefaults} from './tokens.stylex';
import {
  composite,
  contrastRatio,
  isChromatic,
  parseConcreteColor,
  solveLightness,
  toHex,
} from './statusColor';
import type {RGBA} from '../utils/color';

export const STATUS_NAMES = ['info', 'success', 'warning', 'error'] as const;
export type StatusName = (typeof STATUS_NAMES)[number];

type ResolvedThemeMode = 'light' | 'dark';

const TEXT_RATIO = 4.5;
// Solve slightly above the floor so rounding to #RRGGBB never lands below it.
const SOLVE_RATIO = TEXT_RATIO + 0.08;
const MODES: ReadonlyArray<ResolvedThemeMode> = ['light', 'dark'];

/** The strong fill of a status, the source its other roles derive from. */
export function statusSourceToken(status: StatusName): string {
  return `--color-${status}`;
}

function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of input) {
    if (ch === '(') {
      depth++;
    }
    if (ch === ')') {
      depth--;
    }
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current.trim());
  return parts;
}

/**
 * Resolve one token to a concrete value for a mode, following `light-dark()`
 * and `var()` through the theme's tokens and then Core's colour defaults.
 * This stays local (rather than using tokens.ts) so theme generation does not
 * import the runtime token helpers that themselves depend on defineTheme.
 */
function resolveToken(
  tokens: Record<string, unknown>,
  name: string,
  mode: ResolvedThemeMode,
  seen: ReadonlySet<string> = new Set(),
): string | undefined {
  if (seen.has(name)) {
    return undefined;
  }
  const raw = tokens[name] ?? (colorDefaults as Record<string, string>)[name];
  return resolveValue(tokens, raw, mode, new Set([...seen, name]));
}

function resolveValue(
  tokens: Record<string, unknown>,
  raw: unknown,
  mode: ResolvedThemeMode,
  seen: ReadonlySet<string>,
): string | undefined {
  if (Array.isArray(raw)) {
    return resolveValue(tokens, raw[mode === 'light' ? 0 : 1], mode, seen);
  }
  if (typeof raw !== 'string') {
    return undefined;
  }
  const value = raw.trim();
  if (/^light-dark\(/i.test(value) && value.endsWith(')')) {
    const [light, dark] = splitTopLevel(
      value.slice(value.indexOf('(') + 1, -1),
    );
    return resolveValue(tokens, mode === 'light' ? light : dark, mode, seen);
  }
  const ref = /^var\(\s*(--[\w-]+)\s*(?:,(.*))?\)$/s.exec(value);
  if (ref) {
    const resolved = resolveToken(tokens, ref[1], mode, seen);
    return (
      resolved ??
      (ref[2] ? resolveValue(tokens, ref[2], mode, seen) : undefined)
    );
  }
  return value;
}

const CORE_TOKENS: Record<string, unknown> = {};

function resolveModes(
  tokens: Record<string, unknown>,
): Record<ResolvedThemeMode, Record<string, string>> {
  const names = new Set([
    ...Object.keys(colorDefaults),
    ...Object.keys(tokens),
  ]);
  const at = (mode: ResolvedThemeMode): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const name of names) {
      const value = resolveToken(tokens, name, mode);
      if (value !== undefined) {
        out[name] = value;
      }
    }
    return out;
  };
  return {light: at('light'), dark: at('dark')};
}

let coreCache: Record<ResolvedThemeMode, Record<string, string>> | undefined;
function core(): Record<ResolvedThemeMode, Record<string, string>> {
  coreCache ??= resolveModes(CORE_TOKENS);
  return coreCache;
}

function statusHue(
  status: StatusName,
  resolved: Record<string, string>,
  mode: ResolvedThemeMode,
): RGBA | null {
  const color = parseConcreteColor(resolved[statusSourceToken(status)]);
  if (color !== null && isChromatic(color)) {
    return {...color, a: 1};
  }
  // A grey source falls back to Core's own status hue, so derived text stays
  // chromatic.
  const fallback = parseConcreteColor(core()[mode][statusSourceToken(status)]);
  return fallback === null ? null : {...fallback, a: 1};
}

function opaqueOver(color: RGBA, under: RGBA): RGBA {
  return color.a < 1 ? composite(color, under) : color;
}

interface ModeRoles {
  on?: RGBA;
  text?: RGBA;
  onMuted?: RGBA;
}

function deriveForMode(
  status: StatusName,
  resolved: Record<string, string>,
  mode: ResolvedThemeMode,
): ModeRoles | null {
  // Every colour the computations measure must be concrete. When one is not
  // (an oklch() value, an unknown reference), the status keeps its scoped
  // aliases instead of a guess (architecture:theme-compilation INV17).
  const source = parseConcreteColor(resolved[statusSourceToken(status)]);
  const hue = statusHue(status, resolved, mode);
  const surface = parseConcreteColor(resolved['--color-background-surface']);
  const cardColor = parseConcreteColor(resolved['--color-background-card']);
  const muted = parseConcreteColor(resolved[`--color-${status}-muted`]);
  const onDark = parseConcreteColor(resolved['--color-on-dark']);
  const onLight = parseConcreteColor(resolved['--color-on-light']);
  if (
    source === null ||
    hue === null ||
    surface === null ||
    cardColor === null ||
    muted === null ||
    onDark === null ||
    onLight === null
  ) {
    return null;
  }
  const opaqueSurface = opaqueOver(surface, {r: 255, g: 255, b: 255, a: 1});
  const card = opaqueOver(cardColor, opaqueSurface);
  const fill = opaqueOver(source, opaqueSurface);
  const roles: ModeRoles = {};

  const lightInk = opaqueOver(onDark, fill);
  const darkInk = opaqueOver(onLight, fill);
  const themeInk =
    contrastRatio(lightInk, fill) >= contrastRatio(darkInk, fill)
      ? lightInk
      : darkInk;
  // A theme's off-white and off-black content can both miss the floor on a
  // mid-tone fill; pure white or black always reaches it.
  const white = {r: 255, g: 255, b: 255, a: 1};
  const black = {r: 0, g: 0, b: 0, a: 1};
  roles.on =
    contrastRatio(themeInk, fill) >= TEXT_RATIO
      ? themeInk
      : contrastRatio(white, fill) >= contrastRatio(black, fill)
        ? white
        : black;

  const text = solveLightness(hue, [opaqueSurface, card], SOLVE_RATIO);
  if (text !== null) {
    roles.text = text;
  }

  const pale = composite(muted.a < 1 ? muted : {...muted, a: 1}, opaqueSurface);
  const onMuted = solveLightness(hue, [pale], SOLVE_RATIO);
  if (onMuted !== null) {
    roles.onMuted = onMuted;
  }
  return roles;
}

const ROLE_TOKENS: Record<keyof ModeRoles, (status: StatusName) => string> = {
  on: s => `--color-on-${s}`,
  text: s => `--color-text-${s}`,
  onMuted: s => `--color-on-${s}-muted`,
};

/**
 * Concrete `light-dark()` values for every status role a theme leaves unset
 * while setting a colour that role is measured against. Authored roles are
 * never overridden.
 */
export function deriveStatusRoleTokens(
  tokens: Record<string, string>,
  localTokens: Record<string, string> = {},
): [string, string][] {
  const authored = new Set(Object.keys(tokens));
  const surfaceSet =
    authored.has('--color-background-surface') ||
    authored.has('--color-background-card');
  const inkSet =
    authored.has('--color-on-dark') || authored.has('--color-on-light');
  const resolved = resolveModes({...localTokens, ...tokens});
  const entries: [string, string][] = [];
  for (const status of STATUS_NAMES) {
    const fillSet = authored.has(statusSourceToken(status));
    const mutedSet = authored.has(`--color-${status}-muted`);
    // Which roles this theme's own colours affect.
    const affects: Record<keyof ModeRoles, boolean> = {
      on: fillSet || inkSet,
      text: fillSet || surfaceSet,
      onMuted: fillSet || mutedSet || surfaceSet,
    };
    if (!affects.on && !affects.text && !affects.onMuted) {
      continue;
    }
    const perMode = MODES.map(mode =>
      deriveForMode(status, resolved[mode], mode),
    );
    if (perMode.some(r => r === null)) {
      continue;
    }
    for (const key of Object.keys(ROLE_TOKENS) as (keyof ModeRoles)[]) {
      const token = ROLE_TOKENS[key](status);
      if (!affects[key] || authored.has(token)) {
        continue;
      }
      const [light, dark] = perMode.map(r => r?.[key]);
      if (light === undefined || dark === undefined) {
        continue;
      }
      entries.push([token, `light-dark(${toHex(light)}, ${toHex(dark)})`]);
    }
  }
  return entries;
}
