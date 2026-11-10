// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SegmentedControl unselected-label contrast guard.
 *
 * An unselected SegmentedControl label is `--color-text-secondary` on the
 * control's track, a `--color-neutral` fill. That fill is often translucent,
 * so the track takes the page behind it: AppShell's surface, the body, or a
 * Card. This flattens the track over each of those backgrounds and resolves
 * the label after the theme's own `segmented-control-item` overrides.
 *
 * @input The first-party theme objects and their `segmented-control-item`
 *   overrides.
 * @output Fails when an unselected label drops below 4.5:1 on any track.
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
  '--color-background-surface',
  '--color-background-body',
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

/** The theme's tokens with its `segmented-control-item` base overrides on top. */
function itemTokens(theme) {
  const base = theme.components?.['segmented-control-item']?.base ?? {};
  return {
    ...theme.localTokens,
    ...theme.tokens,
    ...Object.fromEntries(
      Object.entries(base).filter(([key]) => key.startsWith('--')),
    ),
  };
}

function measurements() {
  const rows = [];
  for (const [themeName, theme] of Object.entries(THEMES)) {
    const pageTokens = {...theme.localTokens, ...theme.tokens};
    const labelTokens = itemTokens(theme);
    for (let modeIndex = 0; modeIndex < MODES.length; modeIndex++) {
      const labelHex = resolve(
        'var(--color-text-secondary)',
        labelTokens,
        modeIndex,
      );
      const trackHex = resolve('var(--color-neutral)', pageTokens, modeIndex);
      for (const page of PAGE_BACKGROUNDS) {
        const pageHex = resolve(`var(${page})`, pageTokens, modeIndex);
        const row = {
          theme: themeName,
          mode: MODES[modeIndex],
          page,
          ratio: null,
        };
        if (labelHex && trackHex && pageHex) {
          const pageColor = flatten(
            parseHex(pageHex),
            modeIndex === 0
              ? {r: 255, g: 255, b: 255, a: 1}
              : {r: 0, g: 0, b: 0, a: 1},
          );
          const track = flatten(parseHex(trackHex), pageColor);
          row.ratio = contrast(flatten(parseHex(labelHex), track), track);
        }
        rows.push(row);
      }
    }
  }
  return rows;
}

// Known gaps, each for its own theme fix. A pair leaves this list when it
// passes, and the last test fails until it does.
const KNOWN_GAPS = new Set([
  // The track lifts the dark card under secondary text (5.99:1 on the card).
  'butter dark on --color-background-card',
  // Secondary text already falls under 4.5:1 on the plain page background.
  'chocolate light on --color-background-surface',
  'chocolate light on --color-background-body',
  'chocolate light on --color-background-card',
  'matcha light on --color-background-surface',
  'matcha light on --color-background-body',
  'matcha light on --color-background-card',
  'y2k light on --color-background-body',
]);

const pairName = row => `${row.theme} ${row.mode} on ${row.page}`;

describe('SegmentedControl unselected-label contrast', () => {
  const rows = measurements();

  it('resolves every theme, mode, and page background', () => {
    expect(rows.filter(row => row.ratio == null)).toEqual([]);
  });

  it('meets WCAG AA for normal text on the track over every page background', () => {
    const failures = rows
      .filter(row => !KNOWN_GAPS.has(pairName(row)))
      .filter(row => row.ratio != null && row.ratio < AA_NORMAL)
      .map(
        row =>
          `${row.theme} ${row.mode} on ${row.page}: ${row.ratio.toFixed(2)}:1`,
      );
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
