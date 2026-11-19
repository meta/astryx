// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {palette as y2kModePalettes} from './y2kPalettes.generated';
import {y2kPalettes} from './y2kPalettes';

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

describe('Y2K palette artifact', () => {
  it('contains complete monotonic light and dark ramps', () => {
    expect(new Set(Object.keys(y2kModePalettes))).toEqual(new Set(families));
    for (const familyName of families) {
      const family = y2kModePalettes[familyName];
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

  it('keeps Y2K signature colors exact', () => {
    expect(y2kModePalettes.accent.light[80]).toBe('#cccffa');
    expect(y2kModePalettes.green.light[80]).toBe('#c5e17a');
    expect(y2kModePalettes.green.dark[80]).toBe('#c5e17a');
    expect(y2kModePalettes.blue.light[20]).toBe('#003454');
    expect(y2kModePalettes.blue.light[75]).toBe('#70c1ff');
    expect(y2kModePalettes.blue.light[85]).toBe('#addbff');
  });

  it('matches the complete released legacy object', () => {
    expect(y2kPalettes).toMatchSnapshot();
  });
});
