// Copyright (c) Meta Platforms, Inc. and affiliates.

import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {matchaTheme} from './matchaTheme';

const source = readFileSync(
  new URL('./matchaTheme.ts', import.meta.url),
  'utf8',
);

describe('matcha color token mapping completeness', () => {
  it('does not redefine the data-visualization color system', () => {
    expect(
      Object.keys(matchaTheme.tokens).filter(name =>
        name.startsWith('--color-data-'),
      ),
    ).toEqual([]);
  });

  it('keeps every root color value concrete', () => {
    for (const [name, value] of Object.entries(matchaTheme.tokens)) {
      if (!name.startsWith('--color-')) {
        continue;
      }
      expect(typeof value, name).toBe('string');
      expect(value, name).toMatch(
        /^(?:transparent|#[0-9a-f]{6}(?:[0-9a-f]{2})?|light-dark\(#[0-9a-f]{6}(?:[0-9a-f]{2})?, #[0-9a-f]{6}(?:[0-9a-f]{2})?\)|color-mix\(.+\)|var\(.+\))$/i,
      );
    }
  });

  it('imports only the selected runtime palette projection', () => {
    const relativeImports = [...source.matchAll(/from ['"](\.[^'"]+)['"]/g)]
      .map(match => match[1])
      .sort();
    expect(relativeImports).toEqual([
      './icons',
      './matchaPaletteRefs.generated',
    ]);
  });

  it('uses no one-off color literals in the maintained theme source', () => {
    expect(source).not.toMatch(
      /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsl[a]?\(|\boklch\(|\bblack\b|\bwhite\b/i,
    );
  });
});
