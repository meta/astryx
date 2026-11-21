// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  dataTokenDefaults,
  defineTheme,
  tokenDefaults,
} from '@astryxdesign/core/theme';
import {
  getChartColors,
  getChartColorsFromResolver,
  type SequentialHue,
  type TokenResolver,
} from './getChartColors';

// A fake resolver with a hand-picked greyscale ramp so interpolated values are
// easy to verify by hand: 0x00, 0x40, 0x80, 0xC0, 0xFF from step 5 → 1.
const RAMP: Record<string, string> = {
  '--color-data-gray-5': '#000000',
  '--color-data-gray-4': '#404040',
  '--color-data-gray-3': '#808080',
  '--color-data-gray-2': '#C0C0C0',
  '--color-data-gray-1': '#FFFFFF',
};

const resolve: TokenResolver = name => RAMP[name] ?? `resolved(${name})`;

describe('getChartColorsFromResolver', () => {
  it('returns exact token stops when n <= ramp length', () => {
    const colors = getChartColorsFromResolver(resolve);
    expect(colors.sequential.gray(5)).toEqual([
      '#000000',
      '#404040',
      '#808080',
      '#C0C0C0',
      '#FFFFFF',
    ]);
  });

  it('interpolates between stops when n > ramp length', () => {
    const colors = getChartColorsFromResolver(resolve);
    // n=9 over 5 stops: odd indices land halfway between adjacent stops.
    expect(colors.sequential.gray(9)).toEqual([
      '#000000',
      '#202020',
      '#404040',
      '#606060',
      '#808080',
      '#A0A0A0',
      '#C0C0C0',
      '#E0E0E0',
      '#FFFFFF',
    ]);
  });

  it('falls back to the nearer endpoint when interpolating non-hex stops', () => {
    const colors = getChartColorsFromResolver(name =>
      name === '--color-data-gray-5' ? 'var(--custom)' : (RAMP[name] ?? ''),
    );
    const nine = colors.sequential.gray(9);
    // The unparseable first stop is preserved verbatim at its slot and as the
    // nearer endpoint of the first interpolated position.
    expect(nine[0]).toBe('var(--custom)');
    expect(nine[1]).toBe('#404040');
  });

  describe('alpha', () => {
    it('applies opacity to a hex color', () => {
      const colors = getChartColorsFromResolver(resolve);
      expect(colors.alpha('#0064E0', 0.2)).toBe('rgba(0, 100, 224, 0.2)');
    });

    it('applies opacity to bare hex without the leading # (pre-#3739 behavior)', () => {
      const colors = getChartColorsFromResolver(resolve);
      expect(colors.alpha('0064E0', 0.2)).toBe('rgba(0, 100, 224, 0.2)');
    });

    it('applies opacity to rgba() input, overriding its alpha', () => {
      const colors = getChartColorsFromResolver(resolve);
      expect(colors.alpha('rgba(0, 100, 224, 0.9)', 0.2)).toBe(
        'rgba(0, 100, 224, 0.2)',
      );
    });

    it('clamps out-of-range opacity and defaults non-finite opacity to 1', () => {
      const colors = getChartColorsFromResolver(resolve);
      expect(colors.alpha('#000000', 2)).toBe('#000000');
      expect(colors.alpha('#000000', -1)).toBe('rgba(0, 0, 0, 0)');
      expect(colors.alpha('#000000', NaN)).toBe('#000000');
    });

    it('preserves unparseable input unchanged', () => {
      const colors = getChartColorsFromResolver(resolve);
      expect(colors.alpha('var(--color-accent)', 0.5)).toBe(
        'var(--color-accent)',
      );
    });
  });
});

// Resolves every token to its own name, so each color names its source token.
const byName: TokenResolver = name => name;

// The ten categorical data tokens, in the palette's declaration order.
const CATEGORICAL = [
  '--color-data-categorical-blue',
  '--color-data-categorical-orange',
  '--color-data-categorical-purple',
  '--color-data-categorical-green',
  '--color-data-categorical-pink',
  '--color-data-categorical-cyan',
  '--color-data-categorical-red',
  '--color-data-categorical-teal',
  '--color-data-categorical-brown',
  '--color-data-categorical-indigo',
];

const HUES: SequentialHue[] = [
  'blue',
  'shamrock',
  'orange',
  'pink',
  'purple',
  'red',
  'teal',
  'yellow',
  'gray',
];

const GRAY_1 = '--color-data-gray-1';

const steps = (hue: SequentialHue, ...stepNumbers: number[]): string[] =>
  stepNumbers.map(step => `--color-data-${hue}-${step}`);

describe('token names', () => {
  it('never reads a token name outside the token vocabulary', () => {
    const requested = new Set<string>();
    const colors = getChartColorsFromResolver(name => {
      requested.add(name);
      return name;
    });
    colors.categorical(CATEGORICAL.length);
    for (const hue of Object.keys(colors.sequential) as SequentialHue[]) {
      colors.sequential[hue](5);
    }
    colors.diverging.positiveNegative(11);
    colors.diverging.coldHot(11);

    const vocabulary = new Set([
      ...Object.keys(tokenDefaults),
      ...Object.keys(dataTokenDefaults),
    ]);
    expect([...requested].filter(name => !vocabulary.has(name))).toEqual([]);
  });
});

describe('categorical', () => {
  it('returns the palette slots in order, as a prefix for smaller counts', () => {
    const colors = getChartColorsFromResolver(byName);
    expect(colors.categorical(10)).toEqual(CATEGORICAL);
    expect(colors.categorical(3)).toEqual(CATEGORICAL.slice(0, 3));
  });

  it('wraps past the tenth slot back to the first', () => {
    const colors = getChartColorsFromResolver(byName);
    expect(colors.categorical(23)).toEqual([
      ...CATEGORICAL,
      ...CATEGORICAL,
      ...CATEGORICAL.slice(0, 3),
    ]);
  });
});

describe('sequential', () => {
  it.each(HUES)('reads the %s ramp from step 5 to step 1', hue => {
    const colors = getChartColorsFromResolver(byName);
    expect(colors.sequential[hue](5)).toEqual(steps(hue, 5, 4, 3, 2, 1));
  });

  it('picks the nearest evenly spaced stops for fewer colors, and the middle stop for one', () => {
    const {sequential} = getChartColorsFromResolver(byName);
    expect(sequential.blue(1)).toEqual(steps('blue', 3));
    expect(sequential.blue(2)).toEqual(steps('blue', 5, 1));
    expect(sequential.blue(3)).toEqual(steps('blue', 5, 3, 1));
    expect(sequential.blue(4)).toEqual(steps('blue', 5, 4, 2, 1));
  });
});

describe('diverging', () => {
  // Each side takes floor(n / 2) colors, sampled like a sequential ramp: the
  // first hue runs from step 5 to step 1, the second from step 1 to step 5,
  // and an odd count puts gray-1 in the center.
  it.each([
    [1, [GRAY_1]],
    [2, [...steps('blue', 3), ...steps('red', 3)]],
    [3, [...steps('blue', 3), GRAY_1, ...steps('red', 3)]],
    [4, [...steps('blue', 5, 1), ...steps('red', 1, 5)]],
    [5, [...steps('blue', 5, 1), GRAY_1, ...steps('red', 1, 5)]],
    [6, [...steps('blue', 5, 3, 1), ...steps('red', 1, 3, 5)]],
    [7, [...steps('blue', 5, 3, 1), GRAY_1, ...steps('red', 1, 3, 5)]],
    [8, [...steps('blue', 5, 4, 2, 1), ...steps('red', 1, 2, 4, 5)]],
    [10, [...steps('blue', 5, 4, 3, 2, 1), ...steps('red', 1, 2, 3, 4, 5)]],
    [
      11,
      [...steps('blue', 5, 4, 3, 2, 1), GRAY_1, ...steps('red', 1, 2, 3, 4, 5)],
    ],
  ])('coldHot(%i) runs from blue to red', (n, expected) => {
    const colors = getChartColorsFromResolver(byName);
    expect(colors.diverging.coldHot(n)).toEqual(expected);
  });

  it('positiveNegative runs from shamrock to red', () => {
    const {diverging} = getChartColorsFromResolver(byName);
    expect(diverging.positiveNegative(5)).toEqual([
      ...steps('shamrock', 5, 1),
      GRAY_1,
      ...steps('red', 1, 5),
    ]);
  });

  it('custom uses the given hues, and a midpoint replaces gray-1 in the center', () => {
    const {custom} = getChartColorsFromResolver(byName).diverging;
    expect(custom('purple', 'teal', 5)).toEqual([
      ...steps('purple', 5, 1),
      GRAY_1,
      ...steps('teal', 1, 5),
    ]);
    expect(custom('purple', 'teal', 5, '#ABCDEF')).toEqual([
      ...steps('purple', 5, 1),
      '#ABCDEF',
      ...steps('teal', 1, 5),
    ]);
    expect(custom('purple', 'teal', 1, '#ABCDEF')).toEqual(['#ABCDEF']);
    expect(custom('purple', 'teal', 4, '#ABCDEF')).toEqual([
      ...steps('purple', 5, 1),
      ...steps('teal', 1, 5),
    ]);
  });
});

describe('semantic and structural', () => {
  it('maps the semantic roles to data tokens', () => {
    expect(getChartColorsFromResolver(byName).semantic).toEqual({
      positive: '--color-data-categorical-green',
      negative: '--color-data-categorical-red',
      warning: '--color-data-categorical-orange',
      neutral: '--color-data-neutral',
    });
  });

  it('maps the chrome roles to core border and text tokens', () => {
    expect(getChartColorsFromResolver(byName).structural).toEqual({
      axis: '--color-border-emphasized',
      grid: '--color-border',
      tick: '--color-border-emphasized',
      label: '--color-text-secondary',
    });
  });
});

describe('resolver values', () => {
  it('returns resolved values verbatim, without normalizing or dropping them', () => {
    const values: Record<string, string> = {
      '--color-data-categorical-blue': '#0171e3',
      '--color-data-categorical-orange': 'rgb(235 110 0)',
      '--color-data-categorical-purple': 'var(--brand-purple)',
      '--color-data-categorical-green': 'light-dark(#0B991F, #0B991F)',
      '--color-data-teal-3': 'oklch(70% 0.1 190)',
      '--color-border': 'rgba(5, 54, 89, 0.1)',
    };
    const colors = getChartColorsFromResolver(name => values[name] ?? '');
    expect(colors.categorical(5)).toEqual([
      '#0171e3',
      'rgb(235 110 0)',
      'var(--brand-purple)',
      'light-dark(#0B991F, #0B991F)',
      '',
    ]);
    expect(colors.semantic.positive).toBe('light-dark(#0B991F, #0B991F)');
    expect(colors.structural.grid).toBe('rgba(5, 54, 89, 0.1)');
    expect(colors.sequential.teal(1)).toEqual(['oklch(70% 0.1 190)']);
  });
});

describe('getChartColors', () => {
  const theme = defineTheme({
    name: 'chart-colors-test',
    tokens: {
      '--color-data-categorical-blue': 'light-dark(#111111, #222222)',
      '--color-data-red-5': ['#333333', '#444444'],
    },
  });

  it('resolves theme values for the requested mode, light by default', () => {
    expect(getChartColors(theme).categorical(1)).toEqual(['#111111']);
    expect(getChartColors(theme, 'light').categorical(1)).toEqual(['#111111']);
    expect(getChartColors(theme, 'dark').categorical(1)).toEqual(['#222222']);
    expect(getChartColors(theme, 'light').sequential.red(5)[0]).toBe('#333333');
    expect(getChartColors(theme, 'dark').sequential.red(5)[0]).toBe('#444444');
  });

  it('falls back to the default value of a data token the theme does not set', () => {
    // The palette default is light-dark(#8494A3, #8C939B).
    expect(getChartColors(theme, 'light').semantic.neutral).toBe('#8494A3');
    expect(getChartColors(theme, 'dark').semantic.neutral).toBe('#8C939B');
  });
});
