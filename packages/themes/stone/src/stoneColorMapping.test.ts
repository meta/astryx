// Copyright (c) Meta Platforms, Inc. and affiliates.

import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {stoneTheme} from './stoneTheme';

const source = readFileSync(
  new URL('./stoneTheme.ts', import.meta.url),
  'utf8',
);

const publicPaletteStart = source.indexOf('export const stonePalettes');
if (publicPaletteStart < 0) {
  throw new Error('stoneTheme.ts: stonePalettes export marker not found');
}
const maintainedThemeSource = source.slice(0, publicPaletteStart);

describe('stone color token mapping completeness', () => {
  it('maps every color token Stone owns through its reviewed palette', () => {
    expect(
      Object.keys(stoneTheme.tokens).filter(name =>
        name.startsWith('--color-data-'),
      ),
    ).toEqual([]);
  });

  it('keeps every resolved root color concrete', () => {
    for (const [name, value] of Object.entries(stoneTheme.tokens)) {
      if (!name.startsWith('--color-') || name.startsWith('--color-data-')) {
        continue;
      }
      expect(typeof value, name).toBe('string');
      expect(value, name).toMatch(
        /^(?:transparent|#[0-9a-f]{6}(?:[0-9a-f]{2})?|light-dark\(#[0-9a-f]{6}(?:[0-9a-f]{2})?, #[0-9a-f]{6}(?:[0-9a-f]{2})?\))$/i,
      );
    }
  });

  it('uses no one-off color literals in the maintained theme source', () => {
    expect(maintainedThemeSource).not.toMatch(
      /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsl[a]?\(|\boklch\(|\bblack\b|\bwhite\b/i,
    );
  });
});
