// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Exhaustive tests for Neutral's selected palette-reference projection.
 * @input Theme source references, committed full-palette literals, and outputs.
 * @output Proof that generation is deterministic and check mode fails on drift.
 * @position Regression coverage for generate-neutral-palette-refs.mjs.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {
  countSelectedRefs,
  discoverSelectedRefs,
  generateNeutralPaletteRefs,
  parseFullPalette,
  renderSelectedRefs,
  syncOutputs,
} from './generate-neutral-palette-refs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FULL_PALETTE = `export const palette = {
  blue: {
    name: 'Blue',
    light: {25: '#112233', 80: '#445566'},
    dark: {25: '#778899', 80: '#aabbcc'},
  },
  neutral: {
    name: 'Neutral',
    light: {100: '#ffffff'},
    dark: {15: '#222222'},
  },
} as const;
`;

const THEME_SOURCE = `
const {blue, neutral} = neutralPaletteRefs;
export const theme = {
  first: blue.dark[80],
  direct: neutralPaletteRefs.blue.dark[25],
  unrelated: {blue: 1},
  second: blue.light[80],
  third: blue.light[25],
  repeated: blue.light[25],
  surface: neutral.light[100],
};
`;

describe('Neutral selected palette ref generation', () => {
  it('uses first-reference family and mode order with unique sorted stops', () => {
    const {content, selected} = renderSelectedRefs(THEME_SOURCE, FULL_PALETTE);

    expect(countSelectedRefs(selected)).toBe(5);
    expect(content.indexOf('blue: {')).toBeLessThan(
      content.indexOf('neutral: {'),
    );
    expect(content.indexOf('dark: {25:')).toBeLessThan(
      content.indexOf("light: {25: '#112233', 80: '#445566'}"),
    );
    expect(content.match(/25: '#112233'/gu)).toHaveLength(1);
  });

  it('rejects dynamic, missing, and invalid palette references', () => {
    const palette = parseFullPalette(FULL_PALETTE);
    expect(() =>
      discoverSelectedRefs(
        `const {blue} = neutralPaletteRefs; blue.light[stop];`,
        palette,
      ),
    ).toThrow('literal numeric stops');
    expect(() =>
      discoverSelectedRefs(
        `const {blue} = neutralPaletteRefs; blue[mode][25];`,
        palette,
      ),
    ).toThrow('family.light[25] or family.dark[25]');
    expect(() =>
      discoverSelectedRefs(
        `const {blue} = neutralPaletteRefs; const blueLight = blue.light; blueLight[25];`,
        palette,
      ),
    ).toThrow('unsupported alias or escape');
    expect(() =>
      discoverSelectedRefs(
        `const {blue} = neutralPaletteRefs; const b = blue; b.light[25];`,
        palette,
      ),
    ).toThrow('unsupported alias or escape');
    expect(() =>
      discoverSelectedRefs(
        `const blueLight = neutralPaletteRefs.blue.light; blueLight[25];`,
        palette,
      ),
    ).toThrow('unsupported alias or escape');
    expect(() =>
      discoverSelectedRefs(
        `const {blue} = neutralPaletteRefs; blue.light[30];`,
        palette,
      ),
    ).toThrow('blue.light[30] is missing or invalid');
    expect(() =>
      discoverSelectedRefs(
        `const {missing} = neutralPaletteRefs; missing.light[25];`,
        palette,
      ),
    ).toThrow('missing.light[25] is missing or invalid');
  });

  it('rejects malformed theme and full-palette TypeScript', () => {
    expect(() =>
      parseFullPalette(
        `export const palette = {blue: {light: {25: '#112233' 80: '#445566'}}} as const;`,
      ),
    ).toThrow('neutralPalettes.generated.ts:1:');
    expect(() =>
      discoverSelectedRefs(
        `const {blue} = neutralPaletteRefs; const values = [blue.light[25] blue.light[80]];`,
        parseFullPalette(FULL_PALETTE),
      ),
    ).toThrow('neutralTheme.ts:1:');
  });

  it('writes every output and check mode reports missing or stale bytes', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-neutral-refs-'));
    const first = path.join(root, 'first.ts');
    const second = path.join(root, 'nested', 'second.ts');
    try {
      expect(
        syncOutputs('expected\n', [first, second], {check: false}),
      ).toEqual([]);
      expect(syncOutputs('expected\n', [first, second], {check: true})).toEqual(
        [],
      );

      fs.appendFileSync(first, 'stale\n');
      fs.rmSync(second);
      expect(syncOutputs('expected\n', [first, second], {check: true})).toEqual(
        [
          {output: first, reason: 'differs'},
          {output: second, reason: 'is missing'},
        ],
      );
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

  it('projects exactly the 95 stops used by Neutral into both committed copies', () => {
    const result = generateNeutralPaletteRefs({root: ROOT, check: true});
    expect(result.problems).toEqual([]);
    expect(countSelectedRefs(result.selected)).toBe(95);
    for (const output of result.outputs) {
      expect(fs.readFileSync(output, 'utf-8')).toBe(result.content);
    }
  });
});
