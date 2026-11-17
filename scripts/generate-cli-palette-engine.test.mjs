// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the CLI's generated copy of the tonal palette engine.
 * @input Core's palette source and the committed CLI copy.
 * @output Proof that the committed copy is byte-identical to what Core's
 *   source generates, and that the copy and Core give the same palettes.
 * @position Drift guard for generate-cli-palette-engine.mjs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import * as core from '../packages/core/src/palette/generator';
import * as cli from '../packages/cli/api/theme/palette/generate/generator.mjs';
import {renderCliPaletteEngine} from './generate-cli-palette-engine.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe("the CLI's palette engine", () => {
  it("is byte-identical to what Core's source generates", async () => {
    const files = await renderCliPaletteEngine();
    expect(Object.keys(files).length).toBe(4);
    for (const [file, text] of Object.entries(files)) {
      expect(fs.readFileSync(path.join(ROOT, file), 'utf8'), file).toBe(text);
    }
  }, 60_000);

  it('gives the same palettes as Core for official configs and random, extreme and malformed requests', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const hex = () =>
      `#${Math.floor(random() * 0xffffff)
        .toString(16)
        .padStart(6, '0')}`;
    /** @type {unknown[]} */
    const requests = [
      'butter',
      'gothic',
      'matcha',
      'neutral',
      'stone',
      'y2k',
    ].map(theme =>
      JSON.parse(
        fs.readFileSync(
          path.join(ROOT, `packages/themes/${theme}/palette.config.json`),
          'utf8',
        ),
      ),
    );
    for (let i = 0; i < 200; i++) {
      const families = Array.from(
        {length: 1 + Math.floor(random() * 6)},
        (_, k) => ({id: `f${k}`, seed: hex()}),
      );
      if (random() < 0.5) {
        families.push({id: 'neutral', seed: hex(), kind: 'neutral'});
      }
      requests.push({
        recipe: random() < 0.5 ? 'astryx-oklch-v1' : 'astryx-oklch-v2',
        vibrancy: Math.floor(random() * 101),
        modeStrategy: ['light-only', 'dark-only', 'light-and-dark'][
          Math.floor(random() * 3)
        ],
        families,
      });
    }
    for (const value of [
      '#000000',
      '#ffffff',
      '#ff0000',
      '#0000ff',
      '#fefefe',
      'abc',
    ])
      for (const recipe of [undefined, 'astryx-oklch-v1', 'astryx-oklch-v2'])
        for (const vibrancy of [0, 100]) {
          requests.push({
            ...(recipe ? {recipe} : {}),
            vibrancy,
            families: [
              {id: 'x', seed: value},
              {id: 'neutral', seed: value, kind: 'neutral'},
            ],
          });
        }
    requests.push(
      {families: []},
      {families: [{id: 'black', seed: '#123456'}]},
      {recipe: 'astryx-oklch-v9', families: [{id: 'x', seed: '#123456'}]},
      {families: [{id: 'x', seed: 'not a color'}]},
    );
    /** @param {(input: any) => unknown} run @param {unknown} request */
    const outcome = (run, request) => {
      try {
        return JSON.stringify(run(structuredClone(request)));
      } catch (error) {
        return `error: ${/** @type {Error} */ (error).message}`;
      }
    };
    for (const request of requests) {
      expect(outcome(cli.generateTonalPalette, request)).toBe(
        outcome(core.generateTonalPalette, request),
      );
    }
  });
});
