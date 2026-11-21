// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Filled buttons keep their label readable and change visibly on hover
 *   and on press, with no theme and in every official theme
 * @input Core's built theme compilation (filledStatePaint) and the official
 *   themes' token maps and button rules
 * @output A failure for each theme (or Core alone), mode and filled variant
 *   whose label reads under 4.5:1 at rest, hovered or pressed, or whose hover
 *   or press does not visibly change the fill
 * @position Theme guard beside the text contrast checks
 *
 * A filled variant paints the tint Core derives for its own fill and label;
 * a theme's button rule for the overlay tokens wins. A change is visible when the fill's red, green and blue move by more
 * than 24 in total; a press must move twice as far.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {FIRST_PARTY_THEMES, splitArgs} from './lib/theme-contrast.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORE_DIST = path.join(ROOT, 'packages/core/dist/theme');
const BUTTON_SOURCE = path.join(ROOT, 'packages/core/src/Button/Button.tsx');

/**
 * The overlay paint each Button variant declares in Button.tsx's `variants`
 * styles, by variant and state, as the variable name it reads; undefined when
 * the variant declares none.
 */
function declaredPaints() {
  const source = fs.readFileSync(BUTTON_SOURCE, 'utf8');
  const start = source.indexOf('const variants = stylex.create({');
  const block = source.slice(start, source.indexOf('\n});', start));
  const out = {};
  for (const m of block.matchAll(/^  (\w+): \{\n([\s\S]*?)^  \},/gm)) {
    const [, variant, body] = m;
    out[variant] = {};
    for (const state of ['hover', 'pressed']) {
      const d = new RegExp(
        `\\[colorVars\\['--color-overlay-${state}'\\] as string\\]:\\s*filledStatePaintVars\\['([^']+)'\\]`,
      ).exec(body);
      out[variant][state] = d?.[1];
    }
  }
  return out;
}
const {
  FILLED_VARIANTS,
  VISIBLE_STEP,
  colorStep,
  deriveFilledStatePaints,
  coreFilledStatePaints,
} = await import(path.join(CORE_DIST, 'filledStatePaint.js'));
const {resolveModes} = await import(
  path.join(CORE_DIST, 'statusRoleDerivation.js')
);
const {composite, contrastRatio, parseConcreteColor} = await import(
  path.join(CORE_DIST, 'statusColor.js')
);

const MODES = ['light', 'dark'];

/** A token map as Core reads it: a `[light, dark]` pair as `light-dark()`. */
const asTokens = map =>
  Object.fromEntries(
    Object.entries(map ?? {}).map(([k, v]) => [
      k,
      Array.isArray(v) ? `light-dark(${v[0]}, ${v[1]})` : v,
    ]),
  );

/** One half of a `light-dark()` value. */
const half = (value, mode) => {
  const text = String(value).trim();
  if (!text.startsWith('light-dark(')) {
    return text;
  }
  return splitArgs(text.slice('light-dark('.length, -1))[
    mode === 'light' ? 0 : 1
  ];
};

function measurements() {
  const rows = [];
  const themes = {
    'Core with no theme': {tokens: {}},
    ...FIRST_PARTY_THEMES,
  };
  for (const [themeName, theme] of Object.entries(themes)) {
    const tokens = asTokens(theme.tokens);
    const localTokens = asTokens(theme.localTokens);
    const button = theme.components?.button;
    const paints = Object.fromEntries(
      theme === themes['Core with no theme']
        ? coreFilledStatePaints()
        : deriveFilledStatePaints(tokens, localTokens, button),
    );
    for (const [variant, core] of Object.entries(FILLED_VARIANTS)) {
      const rule = {...button?.base, ...button?.[`variant:${variant}`]};
      const own = {
        '--zz-fill':
          rule.backgroundColor === 'transparent'
            ? '#00000000'
            : (rule.backgroundColor ?? `var(${core.fill})`),
        '--zz-label': rule.color ?? `var(${core.label})`,
        '--zz-hover-fill': rule[':hover']?.backgroundColor ?? '#00000000',
      };
      const resolved = resolveModes({...localTokens, ...tokens, ...own});
      for (const mode of MODES) {
        const at = name => parseConcreteColor(resolved[mode][name]);
        const page = at('--color-background-body');
        const fill = composite(at('--zz-fill'), page);
        const label = at('--zz-label');
        const where = `${themeName} ${mode} ${variant} button`;
        rows.push({
          where: `${where} at rest`,
          ratio: contrastRatio(label, fill),
        });
        for (const state of ['hover', 'pressed']) {
          const token = `--color-overlay-${state}`;
          const value = rule[token] ?? paints[`--_button-${variant}-${state}`];
          const raw = half(value, mode);
          const paint = raw.startsWith('var(')
            ? at(raw.slice(4, -1))
            : parseConcreteColor(raw);
          // A mouse press is also a hover; a touch press is not.
          const hovered = composite(at('--zz-hover-fill'), fill);
          const unders =
            state === 'hover'
              ? [['', hovered]]
              : [
                  ['', fill],
                  [' with the mouse', hovered],
                ];
          for (const [how, under] of unders) {
            const over = composite(paint, under);
            rows.push({
              where: `${where} ${state}${how}`,
              ratio: contrastRatio(label, over),
              step: colorStep(over, fill),
              need: state === 'hover' ? VISIBLE_STEP : 2 * VISIBLE_STEP,
            });
          }
        }
      }
    }
  }
  return rows;
}

describe('filled button states', () => {
  const rows = measurements();

  it("paint each filled variant's hover and press with its own derived paint", () => {
    const declared = declaredPaints();
    const wrong = [];
    for (const variant of Object.keys(FILLED_VARIANTS))
      for (const state of ['hover', 'pressed']) {
        const want = `--_button-${variant}-${state}`;
        const got = declared[variant]?.[state];
        if (got !== want)
          wrong.push(`${variant} ${state}: ${got ?? 'no overlay paint'}`);
      }
    expect(wrong).toEqual([]);
  });

  it('keep the label at 4.5:1 at rest, hovered and pressed', () => {
    expect(
      rows
        .filter(row => !(row.ratio >= 4.5))
        .map(row => `${row.where}: ${row.ratio.toFixed(2)}:1`),
    ).toEqual([]);
  });

  it('change the fill visibly on hover and on press', () => {
    expect(
      rows
        .filter(row => row.step !== undefined && !(row.step > row.need))
        .map(row => `${row.where}: moves ${row.step.toFixed(0)}`),
    ).toEqual([]);
  });
});
