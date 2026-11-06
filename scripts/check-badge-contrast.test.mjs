// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Badge label contrast guard.
 *
 * The Badge label renders at 12px / weight 500, so WCAG 2.1 AA asks for 4.5:1
 * — the 3:1 large-text allowance does not apply. Semantic Badge pairings are
 * owned by Core. Each theme supplies the token values and may optionally re-bind
 * a variant in `components.badge`, so this guard resolves Core's defaults through
 * every first-party theme and then applies any theme-local component override.
 *
 * @input The seven first-party theme objects.
 * @output Fails when a badge variant's label/fill pair drops below 4.5:1 in
 *   either colour scheme.
 * @position Repo-level guard, sibling of the other scripts/check-*.
 */

import {describe, it, expect} from 'vitest';
import {butterTheme} from '../packages/themes/butter/src/butterTheme.ts';
import {chocolateTheme} from '../packages/themes/chocolate/src/chocolateTheme.ts';
import {gothicTheme} from '../packages/themes/gothic/src/gothicTheme.ts';
import {matchaTheme} from '../packages/themes/matcha/src/matchaTheme.ts';
import {neutralTheme} from '../packages/themes/neutral/src/neutralTheme.ts';
import {stoneTheme} from '../packages/themes/stone/src/stoneTheme.ts';
import {y2kTheme} from '../packages/themes/y2k/src/y2kTheme.ts';
import {withEmittedTokens} from './lib/theme-emitted-tokens.mjs';

// Each theme as its generated CSS sets it, so status roles it leaves to theme
// generation (architecture:theme-compilation INV17) resolve too.
const THEMES = Object.fromEntries(
  Object.entries({
    butter: butterTheme,
    chocolate: chocolateTheme,
    gothic: gothicTheme,
    matcha: matchaTheme,
    neutral: neutralTheme,
    stone: stoneTheme,
    y2k: y2kTheme,
  }).map(([name, theme]) => [name, withEmittedTokens(theme)]),
);

const MODES = ['light', 'dark'];
/** WCAG 2.1 AA, normal-size text. */
const AA_NORMAL = 4.5;

// Surfaces a badge can sit on, most specific first — needed to flatten the
// semi-transparent fills the dark ramps use.
const SURFACE_TOKENS = [
  '--color-background-card',
  '--color-background-surface',
  '--color-background-body',
];

/** Split `a, b` at the top level, ignoring commas nested in parens. */
function splitArgs(input) {
  const out = [];
  let depth = 0;
  let current = '';
  for (const ch of input) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out;
}

/**
 * Resolve a theme colour expression down to a hex string for one colour
 * scheme, following `light-dark()` and `var()` indirection.
 */
function resolve(value, theme, modeIndex, seen = new Set()) {
  if (typeof value !== 'string') return null;
  const v = value.trim();

  if (v.startsWith('light-dark(')) {
    const args = splitArgs(v.slice('light-dark('.length, -1));
    return resolve(args[modeIndex], theme, modeIndex, seen);
  }

  if (v.startsWith('var(')) {
    const args = splitArgs(v.slice('var('.length, -1));
    const [name, fallback] = args;
    if (seen.has(name)) return null; // cycle guard
    const next = theme.localTokens?.[name] ?? theme.tokens?.[name];
    if (next == null) {
      return fallback ? resolve(fallback, theme, modeIndex, seen) : null;
    }
    return resolve(next, theme, modeIndex, new Set([...seen, name]));
  }

  return /^#[0-9a-f]{3,8}$/i.test(v) ? v : null;
}

/** `#rgb` / `#rrggbb` / `#rrggbbaa` -> `{r, g, b, a}` in 0-255 / 0-1. */
function parseHex(hex) {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
  const n = i => parseInt(h.slice(i, i + 2), 16);
  return {r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1};
}

/** Composite `top` over the opaque `base`. */
function flatten(top, base) {
  if (top.a >= 1) return top;
  const mix = (t, b) => Math.round(t * top.a + b * (1 - top.a));
  return {
    r: mix(top.r, base.r),
    g: mix(top.g, base.g),
    b: mix(top.b, base.b),
    a: 1,
  };
}

function luminance({r, g, b}) {
  const lin = c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(fg, bg) {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/** The opaque surface a badge is painted onto, for flattening alpha fills. */
function surfaceOf(theme, modeIndex) {
  for (const token of SURFACE_TOKENS) {
    const hex = resolve(theme.tokens?.[token], theme, modeIndex);
    if (hex) {
      const parsed = parseHex(hex);
      if (parsed.a >= 1) return parsed;
    }
  }
  // No opaque surface declared — fall back to the colour scheme's page default.
  return modeIndex === 0
    ? {r: 255, g: 255, b: 255, a: 1}
    : {r: 0, g: 0, b: 0, a: 1};
}

const CORE_SEMANTIC_BADGE = {
  info: {
    backgroundColor: 'var(--color-info)',
    color: 'var(--color-on-info)',
  },
  success: {
    backgroundColor: 'var(--color-success)',
    color: 'var(--color-on-success)',
  },
  warning: {
    backgroundColor: 'var(--color-warning)',
    color: 'var(--color-on-warning)',
  },
  error: {
    backgroundColor: 'var(--color-error)',
    color: 'var(--color-on-error)',
  },
};

/**
 * Every resolvable badge label/fill pair, as
 * `{theme, mode, variant, fg, bg, ratio}`.
 */
function badgePairs() {
  const rows = [];
  for (const [themeName, theme] of Object.entries(THEMES)) {
    const badge = theme.components?.badge ?? {};
    // A variant may inherit the block's own base colour/fill.
    const baseColor = badge.color;
    const baseBg = badge.backgroundColor;
    const variants = new Set([
      ...Object.keys(CORE_SEMANTIC_BADGE),
      ...Object.keys(badge)
        .filter(key => key.startsWith('variant:'))
        .map(key => key.slice('variant:'.length)),
    ]);

    for (const variant of variants) {
      const block = badge[`variant:${variant}`];
      if (block != null && typeof block !== 'object') continue;
      const core = CORE_SEMANTIC_BADGE[variant];

      for (let modeIndex = 0; modeIndex < MODES.length; modeIndex++) {
        const fgHex = resolve(
          block?.color ?? baseColor ?? core?.color,
          theme,
          modeIndex,
        );
        const bgHex = resolve(
          block?.backgroundColor ?? baseBg ?? core?.backgroundColor,
          theme,
          modeIndex,
        );
        if (!fgHex || !bgHex) continue; // not expressible as a flat pair

        const surface = surfaceOf(theme, modeIndex);
        const bg = flatten(parseHex(bgHex), surface);
        const fg = flatten(parseHex(fgHex), bg);
        rows.push({
          theme: themeName,
          mode: MODES[modeIndex],
          variant,
          fg: fgHex,
          bg: bgHex,
          ratio: contrast(fg, bg),
        });
      }
    }
  }
  return rows;
}

const FIRST_PARTY_THEMES = Object.keys(THEMES).sort();

/** Exact allowlist: every maintained Badge pair currently clears AA. */
const KNOWN_GAPS = [];

describe('Badge label contrast', () => {
  const rows = badgePairs();
  const label = r => `${r.theme}/${r.mode} variant:${r.variant}`;

  it('resolves Core semantic badge pairs through every first-party theme', () => {
    // Guards the resolver itself: a refactor that silently stops resolving
    // would otherwise turn this whole file into a no-op.
    const covered = [...new Set(rows.map(r => r.theme))].sort();
    expect(covered).toEqual(FIRST_PARTY_THEMES);

    // The four Core semantic variants must resolve in every theme and both
    // schemes, whether or not that theme adds a component-local override.
    const missing = [];
    for (const theme of FIRST_PARTY_THEMES) {
      for (const mode of MODES) {
        for (const variant of ['info', 'success', 'warning', 'error']) {
          const hit = rows.some(
            r => r.theme === theme && r.mode === mode && r.variant === variant,
          );
          if (!hit) missing.push(`${theme}/${mode} variant:${variant}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('holds the neutral error badge above AA — the pair that regressed', () => {
    const pair = rows.find(
      r => r.theme === 'neutral' && r.mode === 'light' && r.variant === 'error',
    );
    expect(pair).toBeDefined();
    expect(pair.fg).toBe('#ffffff');
    expect(pair.ratio).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('meets WCAG AA (4.5:1) for every badge variant in both colour schemes', () => {
    const failures = rows
      .filter(r => r.ratio < AA_NORMAL)
      .map(r => `${label(r)} — ${r.fg} on ${r.bg} = ${r.ratio.toFixed(2)}:1`);

    const unexpected = failures.filter(
      f => !KNOWN_GAPS.includes(f.split(' — ')[0]),
    );
    expect(unexpected).toEqual([]);
  });

  it('keeps the known-gap list exact, so a fixed pair cannot linger', () => {
    const failing = rows
      .filter(r => r.ratio < AA_NORMAL)
      .map(label)
      .sort();
    expect(failing).toEqual(KNOWN_GAPS);
  });
});
