// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Syntax punctuation contrast guard.
 *
 * `--color-syntax-punctuation` renders brackets, commas, semicolons and
 * operators in every code sample — normal text, held to WCAG 2.1 AA's 4.5:1,
 * not the lower bar a genuinely disabled control is exempt from. Each theme
 * defines its own syntax palette via `defineSyntaxTheme`, so the pair that
 * actually ships (punctuation foreground against the syntax background) has
 * to be resolved through the theme's `light-dark()`/`var()` tokens, the same
 * as check-badge-contrast.test.mjs resolves the badge label/fill pair.
 *
 * @input The seven first-party theme objects.
 * @output Fails when a theme's punctuation/background pair drops below 4.5:1
 *   in either colour scheme.
 * @position Repo-level guard, sibling of the other scripts/check-*.
 * @see https://github.com/meta/astryx/issues/5386
 */

import {describe, it, expect} from 'vitest';
import {butterTheme} from '../packages/themes/butter/src/butterTheme.ts';
import {chocolateTheme} from '../packages/themes/chocolate/src/chocolateTheme.ts';
import {gothicTheme} from '../packages/themes/gothic/src/gothicTheme.ts';
import {matchaTheme} from '../packages/themes/matcha/src/matchaTheme.ts';
import {neutralTheme} from '../packages/themes/neutral/src/neutralTheme.ts';
import {stoneTheme} from '../packages/themes/stone/src/stoneTheme.ts';
import {y2kTheme} from '../packages/themes/y2k/src/y2kTheme.ts';

const THEMES = {
  butter: butterTheme,
  chocolate: chocolateTheme,
  gothic: gothicTheme,
  matcha: matchaTheme,
  neutral: neutralTheme,
  stone: stoneTheme,
  y2k: y2kTheme,
};

const MODES = ['light', 'dark'];
/** WCAG 2.1 AA, normal-size text. */
const AA_NORMAL = 4.5;

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
    const next = theme.tokens?.[name];
    if (next == null) {
      return fallback ? resolve(fallback, theme, modeIndex, seen) : null;
    }
    return resolve(next, theme, modeIndex, new Set([...seen, name]));
  }

  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;

  // Every value this file resolves today is hex, at every step: authored
  // literals, and var() indirection through other --color-* tokens (which
  // are hex too). A colour in oklch()/hsl()/rgb() would silently fall
  // through to null here otherwise, and the only visible symptom would be
  // `rows` coming up short with no clue why. Fail loud with the actual
  // unresolvable value instead.
  throw new Error(
    `check-syntax-punctuation-contrast: cannot resolve "${v}" to a hex ` +
      `colour. Only hex literals, light-dark(), and var() indirection are ` +
      `supported — add a case here if a theme starts using a different ` +
      `colour syntax.`,
  );
}

/** `#rgb` / `#rrggbb` / `#rrggbbaa` -> `{r, g, b, a}` in 0-255 / 0-1. */
function parseHex(hex) {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
  const n = i => parseInt(h.slice(i, i + 2), 16);
  return {r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1};
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

/**
 * Every resolvable punctuation/background pair, as
 * `{theme, mode, fg, bg, ratio}`.
 */
function punctuationPairs() {
  const rows = [];
  for (const [themeName, theme] of Object.entries(THEMES)) {
    for (let modeIndex = 0; modeIndex < MODES.length; modeIndex++) {
      const fgHex = resolve(
        theme.tokens?.['--color-syntax-punctuation'],
        theme,
        modeIndex,
      );
      const bgHex = resolve(
        theme.tokens?.['--color-syntax-background'],
        theme,
        modeIndex,
      );
      if (!fgHex || !bgHex) continue; // not expressible as a flat pair
      rows.push({
        theme: themeName,
        mode: MODES[modeIndex],
        fg: fgHex,
        bg: bgHex,
        ratio: contrast(parseHex(fgHex), parseHex(bgHex)),
      });
    }
  }
  return rows;
}

const ALL_THEMES = Object.keys(THEMES);

describe('Syntax punctuation contrast', () => {
  const rows = punctuationPairs();
  const label = r => `${r.theme}/${r.mode}`;

  it('resolves a punctuation/background pair for every theme, both schemes', () => {
    // Guards the resolver itself: a refactor that silently stops resolving
    // would otherwise turn this whole file into a no-op.
    const covered = [...new Set(rows.map(r => r.theme))].sort();
    expect(covered).toEqual([...ALL_THEMES].sort());
    expect(rows).toHaveLength(ALL_THEMES.length * MODES.length);
  });

  it('meets WCAG AA (4.5:1) for every theme in both colour schemes', () => {
    const failures = rows
      .filter(r => r.ratio < AA_NORMAL)
      .map(r => `${label(r)} — ${r.fg} on ${r.bg} = ${r.ratio.toFixed(2)}:1`);
    expect(failures).toEqual([]);
  });
});
