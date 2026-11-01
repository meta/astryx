// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Neutral form-control boundary contrast guard.
 *
 * Default field shells and unchecked selection controls use
 * `--color-border-emphasized` as the boundary required to identify the
 * control. This verifies every Neutral control target in light and dark mode
 * against WCAG 2.2 SC 1.4.11 without an allowlist.
 */

import {describe, expect, it} from 'vitest';
import {neutralTheme} from '../packages/themes/neutral/src/neutralTheme.ts';

const MODES = ['light', 'dark'];
const TARGETS = [
  'text-input',
  'text-area',
  'number-input',
  'date-input',
  'date-range-input',
  'date-time-input',
  'time-input',
  'selector',
  'multi-selector',
  'complex-selector',
  'typeahead',
  'tokenizer',
  'file-input',
  'input-group-text',
  'checkbox-indicator',
  'radio-indicator',
];
const NON_TEXT_MIN = 3;

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

function resolve(value, modeIndex, seen = new Set()) {
  if (Array.isArray(value)) return resolve(value[modeIndex], modeIndex, seen);
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (v.startsWith('light-dark(')) {
    const args = splitArgs(v.slice('light-dark('.length, -1));
    return resolve(args[modeIndex], modeIndex, seen);
  }
  if (v.startsWith('var(')) {
    const [name, fallback] = splitArgs(v.slice('var('.length, -1));
    if (seen.has(name)) return null;
    const next =
      neutralTheme.localTokens?.[name] ?? neutralTheme.tokens?.[name];
    if (next == null)
      return fallback ? resolve(fallback, modeIndex, seen) : null;
    return resolve(next, modeIndex, new Set([...seen, name]));
  }
  return /^#[0-9a-f]{3,8}$/i.test(v) ? v : null;
}

function rgb(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map(c => c + c).join('');
  return [0, 2, 4].map(index => parseInt(h.slice(index, index + 2), 16));
}

function luminance([r, g, b]) {
  const lin = channel => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(rgb(a)), luminance(rgb(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function rows() {
  const out = [];
  for (const target of TARGETS) {
    const base = neutralTheme.components?.[target]?.base ?? {};
    for (let modeIndex = 0; modeIndex < MODES.length; modeIndex++) {
      const border = resolve(
        base.borderColor ?? 'var(--color-border-emphasized)',
        modeIndex,
      );
      const surface = resolve(
        base.backgroundColor ?? 'var(--color-background-surface)',
        modeIndex,
      );
      out.push({
        target,
        mode: MODES[modeIndex],
        border,
        surface,
        ratio: border && surface ? contrast(border, surface) : null,
      });
    }
  }
  return out;
}

describe('Neutral default form-control boundary contrast', () => {
  const results = rows();
  const label = row => `${row.mode} ${row.target}`;

  it('resolves all supported control targets in both modes', () => {
    expect(results.filter(row => row.ratio == null).map(label)).toEqual([]);
    expect(results).toHaveLength(MODES.length * TARGETS.length);
  });

  it('meets WCAG 1.4.11 without an allowlist', () => {
    const failures = results
      .filter(row => row.ratio != null && row.ratio < NON_TEXT_MIN)
      .map(
        row =>
          `${label(row)} ${row.ratio.toFixed(2)}:1 ${row.border} on ${row.surface}`,
      );
    expect(failures).toEqual([]);
  });
});
