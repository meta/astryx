// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {resolveThemeTokens} from '@astryxdesign/core/theme';
import {palette as gothicModePalettes} from './gothicPalettes.generated';
import {gothicTheme} from './gothicTheme';

const categoricalFamilies = [
  'blue',
  'cyan',
  'green',
  'orange',
  'pink',
  'purple',
  'red',
  'teal',
  'yellow',
] as const;

function linearize(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
}

function luminance(color: string): number {
  const [red, green, blue] = [1, 3, 5].map(index =>
    Number.parseInt(color.slice(index, index + 2), 16),
  );
  return (
    0.2126 * linearize(red) +
    0.7152 * linearize(green) +
    0.0722 * linearize(blue)
  );
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
    (left, right) => right - left,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

describe('gothic palette mapping', () => {
  it('keeps the theme dark-only and maps its neutral surface ladder', () => {
    const tokens = resolveThemeTokens(gothicTheme, {mode: 'dark'});
    const neutral = gothicModePalettes.neutral.dark;

    expect(tokens['--color-background-body']).toBe(neutral[10]);
    expect(tokens['--color-background-surface']).toBe(neutral[10]);
    expect(tokens['--color-background-card']).toBe(neutral[15]);
    expect(tokens['--color-background-popover']).toBe(neutral[20]);
    expect(tokens['--color-text-primary']).toBe(neutral[95]);
    expect(tokens['--color-text-secondary']).toBe(neutral[75]);
  });

  it('maps syntax roles to reviewed jewel-tone anchors with AA comments', () => {
    const tokens = resolveThemeTokens(gothicTheme, {mode: 'dark'});
    expect(tokens).toMatchObject({
      '--color-syntax-keyword': gothicModePalettes.purple.dark[80],
      '--color-syntax-string': gothicModePalettes.green.dark[70],
      '--color-syntax-comment': gothicModePalettes.neutral.dark[65],
      '--color-syntax-number': gothicModePalettes.yellow.dark[70],
      '--color-syntax-function': gothicModePalettes.blue.dark[65],
      '--color-syntax-type': gothicModePalettes.purple.dark[80],
      '--color-syntax-constant': gothicModePalettes.yellow.dark[65],
      '--color-syntax-tag': gothicModePalettes.pink.dark[65],
      '--color-syntax-attribute': gothicModePalettes.yellow.dark[70],
      '--color-syntax-property': gothicModePalettes.teal.dark[70],
      '--color-syntax-added-marker': gothicModePalettes.green.dark[70],
      '--color-syntax-removed-marker': gothicModePalettes.pink.dark[65],
    });
    expect(
      contrast(
        gothicModePalettes.neutral.dark[65],
        gothicModePalettes.neutral.dark[10],
      ),
      'syntax comment text',
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('maps every categorical role to the reviewed pattern with AA text', () => {
    const tokens = resolveThemeTokens(gothicTheme, {mode: 'dark'});
    for (const family of categoricalFamilies) {
      const ramp = gothicModePalettes[family].dark;
      const textStop = family === 'pink' || family === 'yellow' ? 15 : 20;
      expect(tokens[`--color-background-${family}`]).toBe(ramp[75]);
      expect(tokens[`--color-border-${family}`]).toBe(ramp[60]);
      expect(tokens[`--color-icon-${family}`]).toBe(ramp[30]);
      expect(tokens[`--color-text-${family}`]).toBe(ramp[textStop]);
      expect(
        contrast(ramp[textStop], ramp[75]),
        `${family} categorical text`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
