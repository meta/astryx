// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Pale semantic surface contrast guard.
 *
 * Banner, FieldStatus, and ChatComposer pair each `--color-*-muted` surface
 * with its matching `--color-on-*-muted` content role. This resolves the global
 * pairs used by FieldStatus and ChatComposer separately from the effective
 * Banner pairs after Banner-local token overrides, and requires normal-size
 * text contrast in both colour schemes.
 *
 * @input The seven first-party theme objects and their Banner overrides.
 * @output Fails when a global or Banner pale semantic pair drops below 4.5:1.
 * @position Repo-level guard, sibling of the other scripts/check-*.
 */

import {describe, expect, it} from 'vitest';
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
const VARIANTS = ['info', 'success', 'warning', 'error'];
const AA_NORMAL = 4.5;
const SURFACE_TOKENS = [
  '--color-background-card',
  '--color-background-surface',
  '--color-background-body',
];

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

function resolve(value, theme, modeIndex, seen = new Set()) {
  if (Array.isArray(value)) {
    return resolve(value[modeIndex], theme, modeIndex, seen);
  }
  if (typeof value !== 'string') return null;
  const v = value.trim();

  if (v.startsWith('light-dark(')) {
    const args = splitArgs(v.slice('light-dark('.length, -1));
    return resolve(args[modeIndex], theme, modeIndex, seen);
  }

  if (v.startsWith('var(')) {
    const [name, fallback] = splitArgs(v.slice('var('.length, -1));
    if (seen.has(name)) return null;
    const next = theme.localTokens?.[name] ?? theme.tokens?.[name];
    if (next == null) {
      return fallback ? resolve(fallback, theme, modeIndex, seen) : null;
    }
    return resolve(next, theme, modeIndex, new Set([...seen, name]));
  }

  return /^#[0-9a-f]{3,8}$/i.test(v) ? v : null;
}

function parseHex(hex) {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
  const n = i => parseInt(h.slice(i, i + 2), 16);
  return {r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1};
}

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

function surfaceOf(theme, modeIndex) {
  for (const token of SURFACE_TOKENS) {
    const hex = resolve(theme.tokens?.[token], theme, modeIndex);
    if (hex) {
      const parsed = parseHex(hex);
      if (parsed.a >= 1) return parsed;
    }
  }
  return modeIndex === 0
    ? {r: 255, g: 255, b: 255, a: 1}
    : {r: 0, g: 0, b: 0, a: 1};
}

function measurePair(themeName, theme, scope, variant, modeIndex) {
  const bgHex = resolve(`var(--color-${variant}-muted)`, theme, modeIndex);
  const fgHex = resolve(`var(--color-on-${variant}-muted)`, theme, modeIndex);
  if (!bgHex || !fgHex) {
    return {
      theme: themeName,
      scope,
      mode: MODES[modeIndex],
      variant,
      fg: fgHex,
      bg: bgHex,
      ratio: null,
    };
  }

  const surface = surfaceOf(theme, modeIndex);
  const bg = flatten(parseHex(bgHex), surface);
  const fg = flatten(parseHex(fgHex), bg);
  return {
    theme: themeName,
    scope,
    mode: MODES[modeIndex],
    variant,
    fg: fgHex,
    bg: bgHex,
    ratio: contrast(fg, bg),
  };
}

function mutedPairs() {
  const rows = [];
  for (const [themeName, theme] of Object.entries(THEMES)) {
    for (const variant of VARIANTS) {
      const override = theme.components?.banner?.[`status:${variant}`] ?? {};
      const bannerTokens = {
        ...theme.tokens,
        ...Object.fromEntries(
          Object.entries(override).filter(([key]) => key.startsWith('--')),
        ),
      };
      const bannerTheme = {...theme, tokens: bannerTokens};

      for (let modeIndex = 0; modeIndex < MODES.length; modeIndex++) {
        rows.push(
          measurePair(themeName, theme, 'global', variant, modeIndex),
          measurePair(themeName, bannerTheme, 'banner', variant, modeIndex),
        );
      }
    }
  }
  return rows;
}

describe('pale semantic surface content contrast', () => {
  const rows = mutedPairs();
  const label = row =>
    `${row.theme}/${row.mode}/${row.scope} status:${row.variant}`;

  it('resolves global and Banner pairs in every first-party theme and mode', () => {
    const missing = rows.filter(row => row.ratio == null).map(label);
    expect(missing).toEqual([]);
    expect(rows).toHaveLength(
      Object.keys(THEMES).length * MODES.length * VARIANTS.length * 2,
    );
  });

  it('keeps every pair at normal-text AA without an allowlist', () => {
    const failures = rows
      .filter(row => row.ratio != null && row.ratio < AA_NORMAL)
      .map(
        row => `${label(row)} ${row.ratio.toFixed(2)}:1 ${row.fg} on ${row.bg}`,
      );
    expect(failures).toEqual([]);
  });
});
