// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {palette as butterModePalettes} from './butterPalettes.generated';
import {butterPalettes} from './butterTheme';

const stops = [
  0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95,
  100,
] as const;
const families = [
  'neutral',
  'accent',
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

const relativeLuminance = (hex: string): number => {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map(channel => Number.parseInt(channel, 16) / 255)
    .map(channel =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};

describe('butter palette artifact', () => {
  it('contains complete monotonic light and dark ramps', () => {
    expect(new Set(Object.keys(butterModePalettes))).toEqual(new Set(families));
    for (const familyName of families) {
      const family = butterModePalettes[familyName];
      for (const mode of ['light', 'dark'] as const) {
        const values = stops.map(stop => family[mode][stop]);
        expect(values.every(value => /^#[0-9a-f]{6}$/i.test(value))).toBe(true);
        expect(values[0]).toBe('#000000');
        expect(values.at(-1)).toBe('#ffffff');
        const luminance = values.map(relativeLuminance);
        expect(
          luminance.every(
            (value, index) => index === 0 || value > luminance[index - 1],
          ),
        ).toBe(true);
      }
    }
  });

  it('keeps Butter signature colors and warm surfaces exact', () => {
    expect(butterModePalettes.accent.light[40]).toBe('#225bff');
    expect(butterModePalettes.yellow.dark[90]).toBe('#fdee8c');
    expect(butterModePalettes.neutral.light[95]).toBe('#fdfbe4');
    expect(butterModePalettes.neutral.dark[10]).toBe('#261a13');
  });

  it('matches the complete released legacy object', () => {
    expect(butterPalettes).toMatchSnapshot();
  });
});
