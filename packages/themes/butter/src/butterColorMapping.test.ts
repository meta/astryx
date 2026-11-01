// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {resolveThemeTokens} from '@astryxdesign/core/theme';
import {palette as butterModePalettes} from './butterPalettes.generated';
import {butterTheme} from './butterTheme';

const categoricalFamilies = [
  'blue',
  'cyan',
  'orange',
  'pink',
  'purple',
  'red',
  'teal',
  'yellow',
] as const;

describe('butter palette mapping', () => {
  it('preserves the signature accents and warm body surfaces', () => {
    const light = resolveThemeTokens(butterTheme, {mode: 'light'});
    const dark = resolveThemeTokens(butterTheme, {mode: 'dark'});
    expect(light['--color-accent']).toBe(butterModePalettes.accent.light[40]);
    expect(dark['--color-accent']).toBe(butterModePalettes.yellow.dark[90]);
    expect(light['--color-background-body']).toBe(
      butterModePalettes.neutral.light[95],
    );
    expect(dark['--color-background-body']).toBe(
      butterModePalettes.neutral.dark[10],
    );
  });

  it.each(['light', 'dark'] as const)(
    'maps categorical roles to reviewed %s stops',
    mode => {
      const tokens = resolveThemeTokens(butterTheme, {mode});
      for (const family of categoricalFamilies) {
        const ramp = butterModePalettes[family][mode];
        const backgroundStop = family === 'yellow' ? 85 : 90;
        const borderStop = family === 'yellow' ? 70 : 80;
        const foregroundStop = 25;
        expect(tokens[`--color-background-${family}`]).toBe(
          ramp[backgroundStop],
        );
        expect(tokens[`--color-border-${family}`]).toBe(ramp[borderStop]);
        expect(tokens[`--color-icon-${family}`]).toBe(ramp[foregroundStop]);
        expect(tokens[`--color-text-${family}`]).toBe(ramp[foregroundStop]);
      }
    },
  );

  it('uses one smooth Green family for categorical and success roles', () => {
    const light = resolveThemeTokens(butterTheme, {mode: 'light'});
    const dark = resolveThemeTokens(butterTheme, {mode: 'dark'});
    expect(light['--color-success']).toBe(butterModePalettes.green.light[25]);
    expect(dark['--color-success']).toBe(butterModePalettes.green.dark[70]);
    expect(light['--color-background-green']).toBe(
      butterModePalettes.green.light[90],
    );
    expect(dark['--color-background-green']).toBe(
      butterModePalettes.green.dark[90],
    );
  });
});
