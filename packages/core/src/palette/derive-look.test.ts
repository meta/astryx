// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file derive-look.test.ts
 * @input deriveCodeColors and deriveStatusColors asked for one mode, on a
 *   palette grown from the look's and the status roles' seeds
 * @output Proof that every derived token holds both modes, the mode the
 *   caller does not draw taking the drawn mode's stop
 * @position Behavior tests for Core's palette derivations. The CLI runs a
 *   generated copy of this module, which its own tests cover.
 */

import {describe, expect, it} from 'vitest';
import {
  deriveCodeColors,
  deriveStatusColors,
  lookSeeds,
  statusSeeds,
} from './derive-look';
import {generatePaletteSet} from './generator';

type Mode = 'light' | 'dark';

const MODES: ReadonlyArray<Mode> = ['light', 'dark'];
const page: Record<Mode, string[]> = {
  light: ['#f2f2f2', '#ffffff'],
  dark: ['#1a1a1a', '#242424'],
};
const white = {stop: 100, color: '#ffffff', family: 'white'};
const black = {stop: 0, color: '#000000', family: 'black'};

/** A palette grown from seeds, keyed by family id, and its stops. */
function grow(seeds: Record<string, string>) {
  const set = generatePaletteSet({
    recipe: 'astryx-oklch-v2',
    vibrancy: 50,
    families: [
      {id: 'neutral', seed: '#777777', kind: 'neutral'},
      ...Object.entries(seeds).map(([id, seed]) => ({id, seed})),
    ],
  });
  const palette = Object.fromEntries(
    set.families.map(family => [
      family.id,
      {
        light: Object.fromEntries(Object.entries(family.light?.colors ?? {})),
        dark: Object.fromEntries(Object.entries(family.dark?.colors ?? {})),
      },
    ]),
  );
  const stops = Object.keys(set.families[0]?.light?.colors ?? {}).map(Number);
  return {palette, stops};
}

describe('a derivation asked for one mode', () => {
  // A derived token types both modes as present, so a mode the caller does
  // not draw takes the drawn mode's stop.
  it('fills both modes of every code color from the drawn mode', () => {
    const {palette, stops} = grow(lookSeeds('#5b3cc4'));
    for (const mode of MODES) {
      const {tokens} = deriveCodeColors({
        palette,
        stops,
        modes: [mode],
        grounds: m => page[m],
        codeGround: () => null,
      });
      expect(Object.keys(tokens).length).toBeGreaterThan(0);
      for (const token of Object.values(tokens)) {
        expect(token[mode]).toBeDefined();
        expect(token.light).toEqual(token.dark);
      }
    }
  });

  it('fills both modes of every status color from the drawn mode', () => {
    const {palette, stops} = grow(
      statusSeeds(
        {
          info: '#0074e2',
          success: '#198100',
          warning: '#ffce2f',
          danger: '#c9303a',
        },
        '#0052cc',
      ),
    );
    for (const mode of MODES) {
      const {tokens} = deriveStatusColors({
        palette,
        stops,
        modes: [mode],
        roles: ['info', 'success', 'warning', 'danger'],
        grounds: m => page[m],
        inks: () => [white, black],
        accent: () => '#0052cc',
      });
      expect(tokens['--color-on-warning']).toBeDefined();
      for (const token of Object.values(tokens)) {
        expect(token[mode]).toBeDefined();
        expect(token.light).toEqual(token.dark);
      }
    }
  });
});
