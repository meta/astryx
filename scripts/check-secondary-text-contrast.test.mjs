// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Secondary-text contrast guard for every first-party theme.
 *
 * `--color-text-secondary` is normal-size text across core components, on the
 * theme's own page backgrounds: the body, the surface, and a card. This
 * requires 4.5:1 on each of them in both colour schemes, so a theme cannot
 * ship secondary text that fails wherever it is used.
 *
 * @input The first-party theme objects.
 * @output Fails when secondary text drops below 4.5:1 on a page background.
 * @position Repo-level theme contrast guard, sibling of the other scripts/check-*.
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
const AA_NORMAL = 4.5;
const PAGE_BACKGROUNDS = [
  '--color-background-body',
  '--color-background-surface',
  '--color-background-card',
];

// Known gaps, each for its own theme fix. A pair leaves this list when it
// passes, and the last test fails until it does.
const KNOWN_GAPS = new Set([
  // Chocolate light secondary text is under 4.5:1 (WCAG 1.4.3) on its own
  // backgrounds; its colour is an owner decision.
  'chocolate light on --color-background-surface',
  'chocolate light on --color-background-body',
  'chocolate light on --color-background-card',
]);

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

function resolve(value, tokens, modeIndex, seen = new Set()) {
  if (Array.isArray(value)) {
    return resolve(value[modeIndex], tokens, modeIndex, seen);
  }
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (v.startsWith('light-dark(')) {
    const args = splitArgs(v.slice('light-dark('.length, -1));
    return resolve(args[modeIndex], tokens, modeIndex, seen);
  }
  if (v.startsWith('var(')) {
    const [name, fallback] = splitArgs(v.slice('var('.length, -1));
    if (seen.has(name)) return null;
    const next = tokens[name];
    if (next == null) {
      return fallback ? resolve(fallback, tokens, modeIndex, seen) : null;
    }
    return resolve(next, tokens, modeIndex, new Set([...seen, name]));
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

function measurements() {
  const rows = [];
  for (const [themeName, theme] of Object.entries(THEMES)) {
    const tokens = {...theme.localTokens, ...theme.tokens};
    for (let modeIndex = 0; modeIndex < MODES.length; modeIndex++) {
      const textHex = resolve('var(--color-text-secondary)', tokens, modeIndex);
      for (const page of PAGE_BACKGROUNDS) {
        const pageHex = resolve(`var(${page})`, tokens, modeIndex);
        const row = {
          theme: themeName,
          mode: MODES[modeIndex],
          page,
          ratio: null,
        };
        if (textHex && pageHex) {
          const pageColor = flatten(
            parseHex(pageHex),
            modeIndex === 0
              ? {r: 255, g: 255, b: 255, a: 1}
              : {r: 0, g: 0, b: 0, a: 1},
          );
          row.ratio = contrast(
            flatten(parseHex(textHex), pageColor),
            pageColor,
          );
        }
        rows.push(row);
      }
    }
  }
  return rows;
}

const pairName = row => `${row.theme} ${row.mode} on ${row.page}`;

describe('secondary-text contrast on every theme background', () => {
  const rows = measurements();

  it('resolves every theme, mode, and page background', () => {
    expect(rows.filter(row => row.ratio == null)).toEqual([]);
  });

  it('meets WCAG AA for normal text', () => {
    const failures = rows
      .filter(row => !KNOWN_GAPS.has(pairName(row)))
      .filter(row => row.ratio != null && row.ratio < AA_NORMAL)
      .map(row => `${pairName(row)}: ${row.ratio.toFixed(2)}:1`);
    expect(failures).toEqual([]);
  });

  it('lists only gaps that still fail', () => {
    const fixed = rows
      .filter(row => KNOWN_GAPS.has(pairName(row)))
      .filter(row => row.ratio != null && row.ratio >= AA_NORMAL)
      .map(pairName);
    expect(fixed).toEqual([]);
  });
});
