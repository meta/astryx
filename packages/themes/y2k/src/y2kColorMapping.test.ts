// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {resolveThemeTokens} from '@astryxdesign/core/theme';
import {palette as y2kModePalettes} from './y2kPalettes.generated';
import {y2kTheme} from './y2kTheme';

const categoricalFamilies = [
  'cyan',
  'green',
  'orange',
  'pink',
  'purple',
  'red',
  'teal',
  'yellow',
] as const;

describe('Y2K palette mapping', () => {
  it('preserves the periwinkle body and uses reviewed neutral surfaces', () => {
    const light = resolveThemeTokens(y2kTheme, {mode: 'light'});
    const dark = resolveThemeTokens(y2kTheme, {mode: 'dark'});
    expect(light['--color-background-body']).toBe(
      y2kModePalettes.accent.light[80],
    );
    expect(dark['--color-background-body']).toBe(
      y2kModePalettes.neutral.dark[5],
    );
    expect(light['--color-text-primary']).toBe(
      y2kModePalettes.neutral.light[15],
    );
    expect(dark['--color-text-primary']).toBe(y2kModePalettes.neutral.dark[95]);
  });

  it('maps neon Green and success to the shared Green family', () => {
    const light = resolveThemeTokens(y2kTheme, {mode: 'light'});
    const dark = resolveThemeTokens(y2kTheme, {mode: 'dark'});
    expect(light['--color-success']).toBe(y2kModePalettes.green.light[80]);
    expect(dark['--color-success']).toBe(y2kModePalettes.green.dark[80]);
    expect(light['--color-background-green']).toBe(
      y2kModePalettes.green.light[80],
    );
    expect(dark['--color-background-green']).toBe(
      y2kModePalettes.green.dark[80],
    );
  });

  it('keeps Blue airy while increasing its electric saturation', () => {
    const light = resolveThemeTokens(y2kTheme, {mode: 'light'});
    const dark = resolveThemeTokens(y2kTheme, {mode: 'dark'});
    expect(light['--color-background-blue']).toBe(
      y2kModePalettes.blue.light[85],
    );
    expect(dark['--color-background-blue']).toBe(y2kModePalettes.blue.dark[85]);
    expect(light['--color-border-blue']).toBe(y2kModePalettes.blue.light[75]);
    expect(dark['--color-text-blue']).toBe(y2kModePalettes.blue.dark[20]);
  });

  it.each(['light', 'dark'] as const)(
    'maps the remaining categorical roles to reviewed %s stops',
    mode => {
      const tokens = resolveThemeTokens(y2kTheme, {mode});
      for (const family of categoricalFamilies) {
        const ramp = y2kModePalettes[family][mode];
        expect(tokens[`--color-background-${family}`]).toMatch(
          /^#[0-9a-f]{6}$/i,
        );
        expect(tokens[`--color-border-${family}`]).toMatch(/^#[0-9a-f]{6}$/i);
        expect(tokens[`--color-icon-${family}`]).toMatch(/^#[0-9a-f]{6}$/i);
        expect(Object.values(ramp)).toContain(
          tokens[`--color-background-${family}`],
        );
        expect(Object.values(ramp)).toContain(tokens[`--color-text-${family}`]);
      }
    },
  );
});
