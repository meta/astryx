// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Pending-overrides model for the audit drawer's interactive editor.
 *
 * The audit drawer lets you reassign each color token to a different
 * (rampName, tone) per mode. We track those reassignments here as an
 * in-memory map, then format them out two ways:
 *
 *   - serializeAsTokensBlock() → a `tokens: { ... }` snippet ready to
 *     paste into the theme's defineTheme() call.
 *   - toApplyPayload()         → the JSON payload the /api/theme-audit/apply
 *     endpoint expects, which writes the same values back into the source
 *     theme file.
 */

import type {Mode, RampSeed} from './colorMath';
import {hexToHct, tonalPaletteForMode, type ToneStep} from './colorMath';

// =============================================================================
// Types
// =============================================================================

/**
 * A single per-mode reassignment for one token.
 *
 * Discriminated by `kind`:
 *   - `'palette'` — the user picked a step on a tonal ramp. We retain
 *     `rampName`, `rampSourceHex`, and `tone` so the editor can show
 *     "Blue T35" as the row subtitle and re-resolve the hex if the
 *     ramp seed changes upstream.
 *   - `'custom'` — the user typed a free-form hex (or used the native
 *     color picker). We only carry the hex itself; the editor renders
 *     the row subtitle as "Custom".
 *
 * Both shapes carry the resolved `hex` so the export formatter, CSS
 * variable injector, and active swatch all read from a single field.
 */
export type ModeOverride =
  | {
      kind: 'palette';
      /** Display name of the ramp (e.g. "Blue", "Stone Neutral") */
      rampName: string;
      /** Source hex of the ramp seed — keeps us decoupled from the seed
       *  list so reassignments survive reordering of `tonalColors`. */
      rampSourceHex: string;
      /** Tone step the user picked (0-100, in 5-step increments) */
      tone: ToneStep;
      /**
       * Optional alpha channel (0-1, default 1). Preserved when the
       * source token had transparency so a snapped overlay/shadow
       * keeps its low-opacity treatment. The resolved `hex` field is
       * the 8-digit form (`#rrggbbaa`) when alpha < 1.
       */
      alpha: number;
      /** Resolved hex at that ramp+tone+mode (8-digit when alpha < 1). */
      hex: string;
    }
  | {
      kind: 'custom';
      /** Optional alpha channel (0-1, default 1). */
      alpha: number;
      /** Free-form hex value (8-digit when alpha < 1). */
      hex: string;
    };

/** Pending edits for a single token. Either side may be undefined when
 *  the user hasn't reassigned that mode. */
export interface TokenOverride {
  light?: ModeOverride;
  dark?: ModeOverride;
}

/** Full pending-overrides map, keyed by token name (e.g. `--color-text-primary`). */
export type OverridesMap = Record<string, TokenOverride>;

// =============================================================================
// State helpers (called by useReducer in ThemeAuditDrawer)
// =============================================================================

export type OverridesAction =
  | {type: 'set'; token: string; mode: Mode; override: ModeOverride}
  | {type: 'clearMode'; token: string; mode: Mode}
  | {type: 'clearToken'; token: string}
  | {type: 'reset'};

export function overridesReducer(
  state: OverridesMap,
  action: OverridesAction,
): OverridesMap {
  switch (action.type) {
    case 'set': {
      const prev = state[action.token] ?? {};
      const next: TokenOverride = {...prev, [action.mode]: action.override};
      return {...state, [action.token]: next};
    }
    case 'clearMode': {
      const prev = state[action.token];
      if (!prev) {
        return state;
      }
      const next: TokenOverride = {...prev};
      delete next[action.mode];
      // Drop the token entry entirely when neither mode is set so the
      // count badges read cleanly without "phantom" empty entries.
      if (!next.light && !next.dark) {
        const {[action.token]: _, ...rest} = state;
        return rest;
      }
      return {...state, [action.token]: next};
    }
    case 'clearToken': {
      const {[action.token]: _, ...rest} = state;
      return rest;
    }
    case 'reset':
      return {};
  }
}

// =============================================================================
// Resolve a (rampSeed, tone, mode) → hex
// =============================================================================

/**
 * Compute the hex for a given ramp+tone+mode. When the seed carries a
 * canonical hand-tuned ramp (`seed.tones`), that's the source of
 * truth — falls back to generating via HCT only when no canonical
 * ramp is supplied. Always returns a 6-digit hex; alpha is the
 * caller's concern (apply via `composeAlphaHex`).
 */
export function resolveOverrideHex(
  seed: RampSeed,
  tone: ToneStep,
  mode: Mode,
): string {
  const canonicalTones = (mode === 'dark' && seed.dark?.tones) || seed.tones;
  if (canonicalTones) {
    const value = canonicalTones[tone];
    if (typeof value === 'string') {
      return value;
    }
  }
  const sourceHex = (mode === 'dark' && seed.dark?.sourceHex) || seed.sourceHex;
  const {hue, chroma} = hexToHct(sourceHex);
  return tonalPaletteForMode(hue, chroma, mode)[tone];
}

/**
 * Build a palette-style ModeOverride from a ramp seed + tone + mode.
 * Optional `alpha` (0-1) is preserved on the override so a snapped
 * overlay/shadow token retains its transparency end-to-end (the
 * resolved hex becomes 8-digit when alpha < 1).
 */
export function buildModeOverride(
  seed: RampSeed,
  tone: ToneStep,
  mode: Mode,
  alpha?: number,
): ModeOverride {
  const baseHex = resolveOverrideHex(seed, tone, mode);
  return {
    kind: 'palette',
    rampName: seed.name,
    rampSourceHex: (mode === 'dark' && seed.dark?.sourceHex) || seed.sourceHex,
    tone,
    alpha: clampAlpha(alpha),
    hex: composeAlphaHex(baseHex, alpha),
  };
}

/**
 * Build a custom (free-form hex) ModeOverride. The input may carry
 * either a 6-digit hex (no alpha) or an 8-digit hex / `'#hex N%'`
 * shape (with alpha) — alpha round-trips through to the resolved
 * `hex` field (8-digit when alpha < 1) and is also surfaced as a
 * separate `alpha` value for UI display.
 */
export function buildCustomOverride(input: string): ModeOverride {
  const {hex, alpha} = parseHexWithAlpha(input);
  const cleaned = normalizeHex(hex);
  return {
    kind: 'custom',
    alpha: clampAlpha(alpha),
    hex: composeAlphaHex(cleaned, alpha),
  };
}

/**
 * Validate + normalise a free-form hex to 6-digit `#rrggbb`. Returns
 * `#000000` for unparseable input. Alpha (4th channel of 8-digit hex
 * or `#abcd`) is dropped — combine with `composeAlphaHex` to put it
 * back on for emit / preview.
 */
export function normalizeHex(input: string): string {
  const trimmed = input.trim().toLowerCase();
  const m = trimmed.match(/^#?([0-9a-f]{3,8})$/);
  if (!m) {
    return '#000000';
  }
  const body = m[1];
  if (body.length === 3) {
    return '#' + body[0] + body[0] + body[1] + body[1] + body[2] + body[2];
  }
  if (body.length === 4) {
    return '#' + body[0] + body[0] + body[1] + body[1] + body[2] + body[2];
  }
  if (body.length === 6) {
    return '#' + body;
  }
  if (body.length === 8) {
    return '#' + body.slice(0, 6);
  }
  return '#000000';
}

export function isValidHex(input: string): boolean {
  // Accept either a bare hex or the `'#hex N%'` shape used by the
  // alpha-aware Custom-tab input.
  if (/^#?[0-9a-fA-F]{3,8}$/.test(input.trim())) {
    return true;
  }
  return /^#?[0-9a-fA-F]{3,8}\s+\d{1,3}%?$/.test(input.trim());
}

// =============================================================================
// Alpha helpers — `'#28282a 10%'` ⇄ `{hex: '#28282a', alpha: 0.1}` ⇄ `'#28282a1A'`
// =============================================================================

/**
 * Clamp an alpha (0-1) into [0, 1]. Treats undefined / NaN / out-of-range
 * input as 1 (fully opaque) — the safe default that matches "no alpha
 * specified" in CSS color literals.
 */
export function clampAlpha(alpha: number | undefined): number {
  if (alpha == null || !Number.isFinite(alpha)) {
    return 1;
  }
  if (alpha < 0) {
    return 0;
  }
  if (alpha > 1) {
    return 1;
  }
  return alpha;
}

/**
 * Convert a 0-1 alpha to a 2-digit lowercase hex pair (e.g. 0.1 → '1a',
 * 0.5 → '80', 1 → 'ff'). Used to build 8-digit hex emit values.
 */
export function alphaToHex(alpha: number): string {
  const v = Math.round(clampAlpha(alpha) * 255);
  return v.toString(16).padStart(2, '0');
}

/**
 * Compose a base 6-digit hex with an alpha into the canonical 8-digit
 * emit form (`#rrggbbaa`). When alpha is 1 (or omitted), returns the
 * 6-digit hex unchanged so we don't gratuitously upgrade the form.
 */
export function composeAlphaHex(hex: string, alpha?: number): string {
  const a = clampAlpha(alpha);
  const base = normalizeHex(hex);
  if (a === 1) {
    return base;
  }
  return base + alphaToHex(a);
}

/**
 * Format a base hex + alpha as `'#rrggbb 10%'` for display in inputs
 * and trigger labels. When alpha is 1, returns the base hex with no
 * suffix so on-ramp opaque tokens read cleanly.
 */
export function formatHexWithAlpha(hex: string, alpha?: number): string {
  const a = clampAlpha(alpha);
  const base = normalizeHex(hex);
  if (a === 1) {
    return base;
  }
  return base + ' ' + Math.round(a * 100) + '%';
}

/**
 * Inverse of `formatHexWithAlpha`. Accepts:
 *   - `'#28282a 10%'` — the canonical pretty form
 *   - `'#28282a1a'`   — 8-digit hex (alpha embedded as last 2 chars)
 *   - `'#28282a'`     — bare hex, alpha defaults to 1
 *   - `'28282a 10'`   — leading `#` and trailing `%` are tolerated
 *
 * Returns `{hex: '#rrggbb', alpha: 0-1}`. Unparseable input returns
 * `{hex: '#000000', alpha: 1}`.
 */
export function parseHexWithAlpha(input: string): {hex: string; alpha: number} {
  const trimmed = input.trim().toLowerCase();
  // Pretty form: hex + percent (handles `#28282a 10%`, `28282a 10`, etc.)
  const pretty = trimmed.match(/^#?([0-9a-f]{3,8})\s+(\d{1,3})%?$/);
  if (pretty) {
    const baseBody = pretty[1];
    const pct = Math.min(100, Math.max(0, Number(pretty[2])));
    return {
      hex: normalizeHex(baseBody),
      alpha: pct / 100,
    };
  }
  // Bare hex form (3/4/6/8 digit)
  const bare = trimmed.match(/^#?([0-9a-f]{3,8})$/);
  if (bare) {
    const body = bare[1];
    if (body.length === 8) {
      // Last 2 hex chars carry alpha
      const a = parseInt(body.slice(6, 8), 16) / 255;
      return {hex: normalizeHex(body.slice(0, 6)), alpha: a};
    }
    if (body.length === 4) {
      // 4-digit shorthand: last digit doubled = alpha pair
      const aChar = body[3];
      const a = parseInt(aChar + aChar, 16) / 255;
      return {hex: normalizeHex(body.slice(0, 3)), alpha: a};
    }
    return {hex: normalizeHex(body), alpha: 1};
  }
  return {hex: '#000000', alpha: 1};
}

// =============================================================================
// Count helpers
// =============================================================================

/** Count of tokens with any pending override. Drives the toolbar badge. */
export function countOverrides(state: OverridesMap): number {
  return Object.keys(state).length;
}

/** Total per-mode reassignments across all tokens. Drives sub-counts. */
export function countModeOverrides(state: OverridesMap): {
  light: number;
  dark: number;
} {
  let light = 0;
  let dark = 0;
  for (const t of Object.values(state)) {
    if (t.light) {
      light++;
    }
    if (t.dark) {
      dark++;
    }
  }
  return {light, dark};
}

// =============================================================================
// Export — TypeScript tokens block
// =============================================================================

/**
 * Format the pending overrides as a TypeScript `tokens: { ... }` snippet
 * suitable for pasting into a `defineTheme()` call.
 *
 * Per-token shape:
 *   - both modes set:    '--color-foo': ['#light', '#dark'],   // Ramp T35 / Ramp T80
 *   - only light set:    '--color-foo': ['#light', '<existing dark>'],
 *   - only dark set:     '--color-foo': ['<existing light>', '#dark'],
 *
 * The "unchanged" side falls back to the current theme value (passed in via
 * `currentTokenValues`) so the resulting array is always a valid replacement
 * for the existing entry — copy-paste won't accidentally drop the other mode.
 */
export interface SerializeContext {
  /** Current resolved hex per token per mode — used to fill in the side
   *  the user didn't reassign. */
  currentTokenValues: Record<
    string,
    {light: string | null; dark: string | null}
  >;
}

export function serializeAsTokensBlock(
  state: OverridesMap,
  ctx: SerializeContext,
): string {
  const lines: string[] = [];
  // Sort tokens alphabetically — predictable diff output.
  const tokens = Object.keys(state).sort();
  for (const token of tokens) {
    const ov = state[token];
    const current = ctx.currentTokenValues[token] ?? {light: null, dark: null};
    const lightHex = ov.light?.hex ?? current.light;
    const darkHex = ov.dark?.hex ?? current.dark;

    // When light === dark, defineTheme accepts a single string. Keep tuple
    // form when either mode comes from the user (so the comment annotation
    // attaches to the right side); collapse to single only when both modes
    // are unmanaged (shouldn't happen here but kept defensive).
    const value =
      lightHex && darkHex && lightHex === darkHex && !ov.light && !ov.dark
        ? `'${lightHex}'`
        : `[${formatHex(lightHex)}, ${formatHex(darkHex)}]`;

    const annotations: string[] = [];
    if (ov.light) {
      annotations.push(`light: ${describeOverride(ov.light)}`);
    }
    if (ov.dark) {
      annotations.push(`dark: ${describeOverride(ov.dark)}`);
    }
    const comment = annotations.length ? `  // ${annotations.join(' · ')}` : '';

    lines.push(`    '${token}': ${value},${comment}`);
  }
  return `tokens: {\n${lines.join('\n')}\n  }`;
}

/**
 * Human-readable description of a ModeOverride for export comments and
 * inline subtitles. Palette overrides read as `Blue T35`; custom
 * overrides read as `Custom`. When the override carries non-1 alpha,
 * appends ` · 10%` so transparency is visible in the source comments
 * and trigger labels.
 */
export function describeOverride(ov: ModeOverride): string {
  const base = ov.kind === 'palette' ? `${ov.rampName} T${ov.tone}` : 'Custom';
  return ov.alpha < 1 ? `${base} · ${Math.round(ov.alpha * 100)}%` : base;
}

function formatHex(hex: string | null): string {
  if (!hex) {
    return `''`;
  }
  return `'${hex}'`;
}

// =============================================================================
// Apply payload — JSON sent to /api/theme-audit/apply
// =============================================================================

export interface ApplyPayloadEntry {
  token: string;
  /** Final value to write — either a single hex (both modes equal) or a
   *  [light, dark] tuple. */
  value: string | [string, string];
  /** Human-readable annotation string the endpoint can use as a trailing
   *  `// ...` comment when inserting a new token entry. */
  annotation?: string;
}

export interface ApplyPayload {
  themeName: string;
  entries: ApplyPayloadEntry[];
}

export function toApplyPayload(
  themeName: string,
  state: OverridesMap,
  ctx: SerializeContext,
): ApplyPayload {
  const entries: ApplyPayloadEntry[] = [];
  for (const token of Object.keys(state).sort()) {
    const ov = state[token];
    const current = ctx.currentTokenValues[token] ?? {light: null, dark: null};
    const lightHex = ov.light?.hex ?? current.light ?? '';
    const darkHex = ov.dark?.hex ?? current.dark ?? '';
    const value: string | [string, string] =
      lightHex === darkHex ? lightHex : [lightHex, darkHex];

    const annotations: string[] = [];
    if (ov.light) {
      annotations.push(`light: ${describeOverride(ov.light)}`);
    }
    if (ov.dark) {
      annotations.push(`dark: ${describeOverride(ov.dark)}`);
    }
    entries.push({
      token,
      value,
      annotation: annotations.length > 0 ? annotations.join(' · ') : undefined,
    });
  }
  return {themeName, entries};
}

// =============================================================================
// Live preview — convert pending overrides into a CSS-custom-property style map
// =============================================================================

/**
 * Build the set of CSS custom properties that, when applied to a parent
 * element, cause every descendant component to render with the pending
 * overrides instead of the committed theme values.
 *
 * Each entry comes out as `light-dark(#light, #dark)`:
 *   - the user-edited side uses the new ramp+tone hex
 *   - the unedited side falls back to the current theme value (so we
 *     never accidentally collapse a [light, dark] tuple to a single
 *     value when the user only touched one mode)
 *
 * Returns the empty object when nothing is pending — the caller can spread
 * unconditionally without an extra branch.
 *
 * Note: returned as `React.CSSProperties` so it composes cleanly with
 * other inline styles, but the keys are CSS custom properties which the
 * built-in CSSProperties type doesn't model — `as` cast required.
 */
export function buildOverrideCSSVars(
  state: OverridesMap,
  ctx: SerializeContext,
): React.CSSProperties {
  const vars: Record<string, string> = {};
  for (const [token, ov] of Object.entries(state)) {
    const current = ctx.currentTokenValues[token] ?? {light: null, dark: null};
    const lightHex = ov.light?.hex ?? current.light;
    const darkHex = ov.dark?.hex ?? current.dark;
    if (!lightHex && !darkHex) {
      continue;
    }
    if (lightHex === darkHex && lightHex) {
      vars[token] = lightHex;
    } else {
      // Either side may be null when the original theme value was
      // unparseable (e.g. var() reference). Fall back to a transparent
      // sentinel rather than emitting `light-dark(null, ...)` which is
      // invalid CSS and would silently break the cascade for that token.
      vars[token] =
        `light-dark(${lightHex ?? 'transparent'}, ${darkHex ?? 'transparent'})`;
    }
  }
  return vars as React.CSSProperties;
}
