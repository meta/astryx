// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file controlEdge.contrast.source-build.test.mjs
 * @input Uses Babel and the StyleX plugin as the package stylesheet compiles
 *   it, the RadioIndicator, CheckboxIndicator and Switch sources, and Core's
 *   default color tokens
 * @output Verifies that the unchecked radio and checkbox edge and the off
 *   switch track's edge read at 3:1 against the surface in Core's default
 *   light and dark colors (WCAG 1.4.11 non-text contrast)
 * @position Regression test for the compiled CSS of the empty-state edges
 */

import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {transformAsync} from '@babel/core';
import stylexBabelPlugin from '@stylexjs/babel-plugin';
import {describe, expect, it} from 'vitest';
import stylexResolution from '../../../../scripts/stylex-module-resolution.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** @param {string} fileName relative to this folder */
async function compiledCss(fileName) {
  const file = path.join(__dirname, fileName);
  const result = await transformAsync(await fs.readFile(file, 'utf8'), {
    babelrc: false,
    configFile: false,
    filename: file,
    presets: [
      [
        require.resolve('@babel/preset-typescript'),
        {isTSX: true, allExtensions: true},
      ],
      [require.resolve('@babel/preset-react'), {runtime: 'automatic'}],
    ],
    plugins: [
      [
        stylexBabelPlugin,
        {
          dev: false,
          runtimeInjection: false,
          genConditionalClasses: true,
          treeshakeCompensation: true,
          unstable_moduleResolution: stylexResolution.stylexModuleResolution,
        },
      ],
    ],
  });
  return stylexBabelPlugin.processStylexRules(
    result?.metadata?.stylex ?? [],
    false,
  );
}

/** Core's default value of each color token, as [light, dark] hex. */
async function defaultTokens() {
  const source = await fs.readFile(
    path.join(__dirname, '../theme/tokens.stylex.ts'),
    'utf8',
  );
  /** @type {Record<string, [string, string]>} */
  const tokens = {};
  for (const m of source.matchAll(
    /'(--color-[\w-]+)': 'light-dark\((#[0-9A-Fa-f]{6}), (#[0-9A-Fa-f]{6})\)'/g,
  )) {
    tokens[m[1]] = [m[2], m[3]];
  }
  return tokens;
}

/** @param {string} hex @returns {number[]} */
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

/** @param {number[]} c */
function luminance(c) {
  const [r, g, b] = c.map(v => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** @param {number[]} a @param {number[]} b */
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Resolves a compiled color value made of var() and srgb color-mix().
 * @param {string} value
 * @param {Record<string, [string, string]>} tokens
 * @param {0 | 1} mode 0 light, 1 dark
 * @returns {number[]}
 */
function resolveColor(value, tokens, mode) {
  const v = value.trim();
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  if (ref) {
    const token = tokens[ref[1]];
    if (!token) throw new Error(`no default for ${ref[1]}`);
    return rgb(token[mode]);
  }
  const mix = v.match(/^color-mix\(in srgb,\s*(.+)\)$/);
  if (mix) {
    // Split the two colors at the top-level comma.
    let depth = 0;
    let cut = -1;
    for (let i = 0; i < mix[1].length; i++) {
      const ch = mix[1][i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ',' && depth === 0) {
        cut = i;
        break;
      }
    }
    const first = mix[1].slice(0, cut);
    const second = mix[1].slice(cut + 1).trim();
    const share = second.match(/^(.*\))\s+(\d+(?:\.\d+)?)%$/);
    const [secondColor, weight] = share
      ? [share[1], Number(share[2]) / 100]
      : [second, 0.5];
    const a = resolveColor(first, tokens, mode);
    const b = resolveColor(secondColor, tokens, mode);
    return a.map((x, i) => x * (1 - weight) + b[i] * weight);
  }
  throw new Error(`unsupported color: ${v}`);
}

/**
 * The resting declarations of a property whose value reads a token, outside
 * hover and forced-colors rules.
 * @param {string} css
 * @param {string} property
 */
function restingValues(css, property) {
  const values = [];
  for (const m of css.matchAll(
    new RegExp(`(@media[^{]*\\{)?[^{}]*\\{${property}:([^;}]+)[;}]`, 'g'),
  )) {
    const [, media, value] = m;
    if (media || !value.includes('var(--color-')) continue;
    values.push(value);
  }
  return values;
}

describe('the empty-state edges of radios, checkboxes and switches', async () => {
  const tokens = await defaultTokens();
  const surface = tokens['--color-background-surface'];

  for (const [name, file] of [
    ['unchecked radio', 'RadioIndicator.tsx'],
    ['unchecked checkbox', 'CheckboxIndicator.tsx'],
  ]) {
    it(`the ${name} edge reads at 3:1 on the surface in light and dark`, async () => {
      const css = await compiledCss(file);
      const edges = restingValues(css, 'border-color').filter(value =>
        value.includes('--color-border-emphasized'),
      );
      expect(edges.length).toBeGreaterThan(0);
      for (const value of edges) {
        for (const mode of /** @type {const} */ ([0, 1])) {
          const edge = resolveColor(value, tokens, mode);
          expect(contrast(edge, rgb(surface[mode]))).toBeGreaterThanOrEqual(3);
        }
      }
    });
  }

  it('the off switch track carries an edge that reads at 3:1 on the surface', async () => {
    const css = await compiledCss('../Switch/Switch.tsx');
    const rings = restingValues(css, 'box-shadow')
      .map(value => value.match(/^inset 0 0 0 1px (.+)$/)?.[1])
      .filter(Boolean);
    expect(rings.length).toBeGreaterThan(0);
    for (const value of rings) {
      for (const mode of /** @type {const} */ ([0, 1])) {
        const edge = resolveColor(/** @type {string} */ (value), tokens, mode);
        expect(contrast(edge, rgb(surface[mode]))).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
