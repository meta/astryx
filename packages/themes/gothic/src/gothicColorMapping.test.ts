// Copyright (c) Meta Platforms, Inc. and affiliates.

import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {gothicTheme} from './gothicTheme';

const source = readFileSync(
  new URL('./gothicTheme.ts', import.meta.url),
  'utf8',
);

const maintainedThemeSource = source.slice(
  0,
  source.indexOf('/**\n * Frozen released compatibility palettes'),
);

describe('gothic color token mapping completeness', () => {
  it('does not redefine the data-visualization color system', () => {
    expect(
      Object.keys(gothicTheme.tokens).filter(name =>
        name.startsWith('--color-data-'),
      ),
    ).toEqual([]);
  });

  it('keeps every root color value concrete', () => {
    for (const [name, value] of Object.entries(gothicTheme.tokens)) {
      if (!name.startsWith('--color-')) {
        continue;
      }
      expect(typeof value, name).toBe('string');
      expect(value, name).toMatch(
        /^(?:transparent|#[0-9a-f]{6}(?:[0-9a-f]{2})?)$/i,
      );
    }
  });

  it('uses no one-off color literals in the maintained theme source', () => {
    expect(maintainedThemeSource).not.toMatch(
      /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsl[a]?\(|\boklch\(|\bblack\b|\bwhite\b/i,
    );
  });
});
