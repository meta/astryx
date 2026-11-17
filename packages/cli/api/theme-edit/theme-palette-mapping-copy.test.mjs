// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The theme editor's palette mapping and the copy of it Core ships
 * (generated into the CLI from packages/core/src/palette) give the same
 * tokens, lifted text and contrast checks for the same color settings.
 * @input Seeded random color settings, extreme seeds and vibrancies, on a
 *   light-page and a dark-page base.
 * @output Proof that `paletteMapping` and the generated `mapPalette` agree.
 * @position api/theme-edit — tests; the guard while the editor keeps its own
 *   mapping
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {paletteMapping} from './_palette.mjs';
import {alphaOf, parseColor} from './_color.mjs';
import {quoteCommandArgument} from '../../foundation/env/package-manager.mjs';
import {generateTonalPalette} from '../theme/palette/generate/generator.mjs';
import {
  PALETTE_DIALS,
  hex,
  mapPalette,
  planPaletteRequest,
} from '../theme/palette/generate/mapping.mjs';
import {P} from './_tables.mjs';

/** @type {string} */
let dir;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-palette-copy-'));
});
afterAll(() => fs.rmSync(dir, {recursive: true, force: true}));

const BASES = {
  'a light page': {
    light: {
      '--color-background-surface': '#ffffff',
      '--color-background-body': '#f4f5f7',
      '--color-background-card': '#ffffff',
      '--color-text-secondary': '#5b6470',
      '--color-overlay-hover': '#0000000d',
    },
    dark: {
      '--color-background-surface': '#1d2024',
      '--color-background-body': '#121417',
      '--color-background-card': '#1d2024',
      '--color-text-secondary': '#a3abb5',
      '--color-overlay-hover': '#ffffff0d',
    },
  },
  'a dark page in light mode': {
    light: {
      '--color-background-surface': '#1b1b1b',
      '--color-background-body': '#111111',
      '--color-background-card': '#1b1b1b',
      '--color-text-secondary': '#b9b9b9',
    },
    dark: {
      '--color-background-surface': '#1b1b1b',
      '--color-background-body': '#111111',
      '--color-background-card': '#1b1b1b',
      '--color-text-secondary': '#b9b9b9',
    },
  },
};

/** Every color token the mapping may set, as a theme's token list has them. */
const TOKENS = Object.fromEntries(
  [
    ...[
      'background-body',
      'background-surface',
      'background-card',
      'background-popover',
      'background-muted',
      'background-inverted',
      'text-primary',
      'text-secondary',
      'text-disabled',
      'icon-primary',
      'icon-secondary',
      'icon-disabled',
      'border',
      'border-emphasized',
      'skeleton',
      'on-dark',
      'on-light',
      'overlay-hover',
      'overlay-pressed',
      'accent',
      'on-accent',
      'text-accent',
      'icon-accent',
      'accent-muted',
      'neutral',
    ].map(t => `--color-${t}`),
    '--focus-outline-color',
    ...['success', 'warning', 'error', 'info'].flatMap(w => [
      `--color-${w}`,
      `--color-on-${w}`,
      `--color-text-${w}`,
      `--color-icon-${w}`,
      `--color-${w}-muted`,
      `--color-on-${w}-muted`,
      `--color-border-${w}`,
    ]),
  ].map(t => [t, '']),
);

/** @param {Record<string, string>} c @param {any} base */
function both(c, base) {
  const settings = Object.entries(c).map(([thing, value]) => ({
    source: /** @type {const} */ ('dial'),
    thing,
    value,
  }));
  const editor = /** @type {any} */ (
    paletteMapping(dir, 'x', {settings}, base, TOKENS)
  );
  const reader = {
    rgb: (/** @type {unknown} */ v) =>
      /** @type {[number, number, number] | null} */ (parseColor(v)),
    alpha: (/** @type {unknown} */ v) => alphaOf(v),
  };
  const context = {
    base,
    has: (/** @type {string} */ t) => Object.hasOwn(TOKENS, t),
    reader,
    setLine: (
      /** @type {string} */ thing,
      /** @type {string} */ value,
      /** @type {string | undefined} */ mode,
    ) =>
      `${P} set x ${thing} ${quoteCommandArgument(value)}${mode ? ` --mode ${mode}` : ''}`,
  };
  const dials = PALETTE_DIALS.filter(d => c[d]).map(id => ({
    id,
    seed: hex(/** @type {number[]} */ (parseColor(c[id]))),
  }));
  const plan = /** @type {any} */ (
    planPaletteRequest(
      dials,
      {
        recipe: 'astryx-oklch-v2',
        vibrancy: c.vibrancy != null ? Number(c.vibrancy) : undefined,
      },
      context,
    )
  );
  const copy = mapPalette(
    generateTonalPalette(plan.config),
    dials,
    plan.fills,
    context,
  );
  /** @param {any} m */
  const shown = m => ({
    tokens: m.tokens,
    lift: m.lift,
    contrast: m.contrast,
    exact: m.exact,
    unread: m.unread,
  });
  return {editor: shown(editor), copy: shown(copy)};
}

describe("Core's palette mapping", () => {
  /** @type {Array<Record<string, string>>} */
  const cases = [];
  let seed = 20261117;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const color = () =>
    `#${Math.floor(random() * 0xffffff)
      .toString(16)
      .padStart(6, '0')}`;
  for (let i = 0; i < 30; i++) {
    /** @type {Record<string, string>} */
    const c = {};
    for (const d of PALETTE_DIALS) if (random() < 0.6) c[d] = color();
    if (!Object.keys(c).length) c.accent = color();
    if (random() < 0.4) c.vibrancy = String(Math.floor(random() * 101));
    cases.push(c);
  }
  for (const s of ['#000000', '#ffffff', '#ff0000', '#ffff00', '#808080'])
    cases.push(Object.fromEntries(PALETTE_DIALS.map(d => [d, s])));
  cases.push({accent: '#5b3cc4'}, {accent: '#0d6efd', neutral: '#6c757d'});

  for (const [name, base] of Object.entries(BASES))
    it(`gives the editor's tokens, lifted text and checks on ${name}`, () => {
      for (const c of cases) {
        const {editor, copy} = both(c, base);
        expect(copy, JSON.stringify(c)).toEqual(editor);
      }
    });
});
