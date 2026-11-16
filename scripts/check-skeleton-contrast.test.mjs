// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Skeleton placeholder visibility guard.
 *
 * Skeleton paints `--color-skeleton` and pulses its opacity up to 0.925.
 * At that peak the placeholder must read against the page and the surfaces
 * it sits on: at least 1.2:1 against `--color-background-body`,
 * `--color-background-surface` and `--color-background-card`, in both
 * colour schemes, for every first-party theme.
 *
 * @input The seven first-party theme objects.
 * @output Fails when a theme's skeleton at the pulse peak drops below 1.2:1
 *   against its page or a surface.
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
/** The highest opacity Skeleton's pulse reaches. */
const PULSE_PEAK = 0.925;
const MIN_RATIO = 1.2;
const BACKGROUNDS = [
  '--color-background-body',
  '--color-background-surface',
  '--color-background-card',
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

function rows() {
  const out = [];
  for (const [themeName, theme] of Object.entries(THEMES))
    for (let modeIndex = 0; modeIndex < MODES.length; modeIndex++) {
      const skeleton = resolve(
        theme.tokens?.['--color-skeleton'],
        theme,
        modeIndex,
      );
      for (const token of BACKGROUNDS) {
        const background = resolve(theme.tokens?.[token], theme, modeIndex);
        const row = {
          theme: themeName,
          mode: MODES[modeIndex],
          token,
          skeleton,
          background,
          ratio: null,
        };
        if (skeleton && background) {
          const bg = parseHex(background);
          const peak = flatten({...parseHex(skeleton), a: PULSE_PEAK}, bg);
          row.ratio = contrast(peak, bg);
        }
        out.push(row);
      }
    }
  return out;
}

describe('skeleton placeholder visibility', () => {
  const all = rows();
  const label = row => `${row.theme}/${row.mode} skeleton on ${row.token}`;

  it('resolves the skeleton and every background in every first-party theme and mode', () => {
    expect(all.filter(row => row.ratio == null).map(label)).toEqual([]);
    expect(all).toHaveLength(
      Object.keys(THEMES).length * MODES.length * BACKGROUNDS.length,
    );
  });

  it('reads at the pulse peak against the page and each surface', () => {
    const failures = all
      .filter(row => row.ratio != null && row.ratio < MIN_RATIO)
      .map(
        row =>
          `${label(row)} ${row.ratio.toFixed(2)}:1 (${row.skeleton} on ${row.background})`,
      );
    expect(failures).toEqual([]);
  });
});
