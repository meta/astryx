// Copyright (c) Meta Platforms, Inc. and affiliates.

import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {generateThemeCSS} from '@astryxdesign/core/theme';
import {palette as y2kModePalettes} from './y2kPalettes.generated';
import {y2kTheme} from './y2kTheme';

function luminance(color: string): number {
  const channels = [1, 3, 5]
    .map(index => Number.parseInt(color.slice(index, index + 2), 16) / 255)
    .map(channel =>
      channel <= 0.04045
        ? channel / 12.92
        : Math.pow((channel + 0.055) / 1.055, 2.4),
    );
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
    (left, right) => right - left,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

const source = readFileSync(new URL('./y2kTheme.ts', import.meta.url), 'utf8');

describe('y2k secondary ComplexSelector', () => {
  it('keeps the hover fill off a disabled trigger in either form', () => {
    expect(generateThemeCSS(y2kTheme).component).toMatch(
      /:hover:not\(:has\(> ?:is\(:disabled, ?\[aria-disabled="true"\]\)\)\)/,
    );
  });
});

describe('Y2K color token mapping completeness', () => {
  it('does not redefine the data-visualization color system', () => {
    expect(
      Object.keys(y2kTheme.tokens).filter(name =>
        name.startsWith('--color-data-'),
      ),
    ).toEqual([]);
  });

  it('keeps every root color value concrete', () => {
    for (const [name, value] of Object.entries(y2kTheme.tokens)) {
      if (!name.startsWith('--color-')) {
        continue;
      }
      expect(typeof value, name).toBe('string');
      expect(value, name).toMatch(
        /^(?:transparent|#[0-9a-f]{6}(?:[0-9a-f]{2})?|light-dark\(#[0-9a-f]{6}(?:[0-9a-f]{2})?, #[0-9a-f]{6}(?:[0-9a-f]{2})?\)|color-mix\(.+\)|var\(.+\))$/i,
      );
    }
  });

  it('uses no one-off color literals in the maintained theme source', () => {
    expect(source).not.toMatch(
      /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsl[a]?\(|\boklch\(|\bblack\b|\bwhite\b/i,
    );
  });

  it('keeps the necessary dark control outline above non-text contrast', () => {
    const outline = y2kModePalettes.neutral.dark[45];
    const surface = y2kModePalettes.neutral.dark[10];

    expect(y2kTheme.tokens['--color-border-emphasized']).toBe(
      `light-dark(${y2kModePalettes.neutral.light[20]}, ${outline})`,
    );
    expect(contrast(outline, surface)).toBeGreaterThanOrEqual(3);
  });
});
