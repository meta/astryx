// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {resolveThemeTokens} from '@astryxdesign/core/theme';
import {matchaPalettes} from './matchaPalettes';
import {matchaTheme} from './matchaTheme';

const categoricalFamilies = [
  'blue',
  'cyan',
  'green',
  'orange',
  'pink',
  'purple',
  'red',
  'teal',
] as const;

describe('matcha palette mapping', () => {
  it.each(['light', 'dark'] as const)(
    'maps the neutral surface ladder in %s mode',
    mode => {
      const tokens = resolveThemeTokens(matchaTheme, {mode});
      const ramp = matchaPalettes.neutral[mode];
      expect(tokens['--color-background-body']).toBe(
        ramp[mode === 'light' ? 95 : 5],
      );
      expect(tokens['--color-background-surface']).toBe(
        ramp[mode === 'light' ? 100 : 10],
      );
      expect(tokens['--color-background-card']).toBe(
        ramp[mode === 'light' ? 100 : 15],
      );
      expect(tokens['--color-text-primary']).toBe(
        ramp[mode === 'light' ? 20 : 75],
      );
      expect(tokens['--color-text-secondary']).toBe(
        ramp[mode === 'light' ? 40 : 60],
      );
    },
  );

  it.each(['light', 'dark'] as const)(
    'maps categorical roles to reviewed %s stops',
    mode => {
      const tokens = resolveThemeTokens(matchaTheme, {mode});
      for (const family of categoricalFamilies) {
        const ramp = matchaPalettes[family][mode];
        const backgroundStop =
          mode === 'light' || family === 'blue' || family === 'cyan' ? 50 : 70;
        expect(tokens[`--color-background-${family}`]).toBe(
          `${ramp[backgroundStop]}33`,
        );
        expect(tokens[`--color-border-${family}`]).toBe(
          ramp[mode === 'light' ? 50 : 70],
        );
        expect(tokens[`--color-icon-${family}`]).toBe(
          ramp[mode === 'light' ? 50 : 70],
        );
        expect(tokens[`--color-text-${family}`]).toBe(
          ramp[mode === 'light' ? 35 : 75],
        );
      }
    },
  );

  it('maps warning and syntax roles to the reviewed Tea Gold ramp', () => {
    const light = resolveThemeTokens(matchaTheme, {mode: 'light'});
    const dark = resolveThemeTokens(matchaTheme, {mode: 'dark'});
    expect(light['--color-warning']).toBe(matchaPalettes.yellow.light[80]);
    expect(dark['--color-warning']).toBe(matchaPalettes.yellow.dark[85]);
    expect(light['--color-syntax-number']).toBe(
      matchaPalettes.yellow.light[45],
    );
    expect(dark['--color-syntax-number']).toBe(matchaPalettes.yellow.dark[75]);
  });
});
