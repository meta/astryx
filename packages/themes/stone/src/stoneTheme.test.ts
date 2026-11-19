// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {generateThemeCSS, resolveThemeTokens} from '@astryxdesign/core/theme';
import {palette as stoneModePalettes} from './stonePalettes.generated';
import {stoneTheme} from './stoneTheme';

function channels(color: string): [number, number, number] {
  return [1, 3, 5].map(index =>
    Number.parseInt(color.slice(index, index + 2), 16),
  ) as [number, number, number];
}

function luminance(color: string): number {
  const [red, green, blue] = channels(color).map(channel => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
    (left, right) => right - left,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function blend(foreground: string, background: string, alpha: number): string {
  const front = channels(foreground);
  const back = channels(background);
  return `#${front
    .map((channel, index) =>
      Math.round(channel * alpha + back[index] * (1 - alpha))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

describe('stone touch + narrow type pin', () => {
  it('floors body to 16px and holds Display 1 at its desktop size', () => {
    const rule = stoneTheme.__adaptationRules?.[0];

    expect(stoneTheme.__adaptations.rules).toHaveLength(1);
    expect(rule?.when).toEqual({pointer: 'coarse', width: {below: 'lg'}});
    expect(rule?.query).toBe('(width < 1024px) and (pointer: coarse)');
    // Pinned ladder: base 16 (was 14), ratio 1.25 -> 1.2225, Display 1 pinned.
    expect(rule?.tokens['--font-size-base']).toBe('1rem');
    expect(rule?.tokens['--font-size-lg']).toBe('1.25rem');
    expect(rule?.tokens['--font-size-5xl']).toBe('3.3125rem');
    // Desktop scale is untouched.
    expect(stoneTheme.tokens['--font-size-base']).toBe('0.875rem');
    expect(stoneTheme.tokens['--font-size-5xl']).toBe('3.3125rem');
    expect(generateThemeCSS(stoneTheme).component).toContain(
      '@media (width < 1024px) and (pointer: coarse)',
    );
  });
});

describe('stone input status roles', () => {
  it('keeps soft per-input status rims and glyphs on the border and icon roles', () => {
    const inputs = [
      'text-input',
      'text-area',
      'number-input',
      'date-input',
      'time-input',
      'selector',
      'multi-selector',
      'typeahead',
      'tokenizer',
    ];

    const {green, red, yellow} = stoneModePalettes;
    for (const input of inputs) {
      const component = stoneTheme.components![input];
      expect(component['status:success']).toMatchObject({
        '--color-border-success': `light-dark(${green.light[55]}, ${green.dark[70]})`,
        '--color-icon-success': `light-dark(${green.light[55]}, ${green.dark[70]})`,
      });
      expect(component['status:warning']).toMatchObject({
        '--color-border-warning': `light-dark(${yellow.light[55]}, ${yellow.dark[70]})`,
        '--color-icon-warning': `light-dark(${yellow.light[55]}, ${yellow.dark[70]})`,
      });
      expect(component['status:error']).toMatchObject({
        '--color-border-error': `light-dark(${red.light[60]}, ${red.dark[70]})`,
        '--color-icon-error': `light-dark(${red.light[60]}, ${red.dark[70]})`,
      });
    }
  });
});

describe('stone strong status contrast', () => {
  it('pairs strong status fills with contrasting light and dark ink', () => {
    for (const token of [
      '--color-on-success',
      '--color-on-warning',
      '--color-on-error',
    ] as const) {
      expect(stoneTheme.tokens[token]).toBe(
        `light-dark(${stoneModePalettes.neutral.light[100]}, ${stoneModePalettes.neutral.dark[10]})`,
      );
    }
  });

  it('uses light ink on light-mode progress fills and dark ink on dark-mode ones', () => {
    const mark = stoneTheme.components!['progress-bar-mark'];
    const {blue, green, neutral, red, yellow} = stoneModePalettes;
    expect(mark['placement:fill+variant:accent']).toMatchObject({
      backgroundColor: `light-dark(${neutral.light[100]}, var(--color-on-light))`,
    });
    expect(contrast(neutral.light[100], blue.light[40])).toBeGreaterThanOrEqual(
      3,
    );
    expect(stoneTheme.tokens['--color-on-light']).toBe(
      `light-dark(${neutral.light[15]}, ${neutral.dark[15]})`,
    );
    expect(contrast(neutral.dark[15], blue.dark[80])).toBeGreaterThanOrEqual(3);
    // A status fill is the status color, so its mark is that status's
    // on-color: stop 100 in light mode and stop 10 in dark mode.
    const fills = {success: green, warning: yellow, error: red};
    for (const [variant, palette] of Object.entries(fills)) {
      expect(mark[`placement:fill+variant:${variant}`]).toMatchObject({
        backgroundColor: `var(--color-on-${variant})`,
      });
      expect(
        contrast(neutral.light[100], palette.light[30]),
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrast(neutral.dark[10], palette.dark[80]),
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps every progress fill at 3:1 on the skeleton track', () => {
    const fill = stoneTheme.components!['progress-bar-fill'];
    const {blue, green, neutral, red, yellow} = stoneModePalettes;
    expect(stoneTheme.components!['progress-bar-track'].base).toMatchObject({
      backgroundColor: 'var(--color-skeleton)',
    });
    expect(stoneTheme.tokens['--color-skeleton']).toBe(
      `light-dark(${neutral.light[85]}, ${neutral.dark[40]})`,
    );
    // Accent uses the blue family; each status fill takes the theme's status
    // role.
    expect(fill['variant:accent']).toMatchObject({
      backgroundColor: `light-dark(${blue.light[40]}, ${blue.dark[80]})`,
    });
    const tones = [
      {light: blue.light[40], dark: blue.dark[80]},
      ...(
        [
          ['success', green],
          ['warning', yellow],
          ['error', red],
        ] as const
      ).map(([variant, palette]) => {
        expect(fill[`variant:${variant}`]).toMatchObject({
          backgroundColor: `var(--color-${variant})`,
        });
        expect(stoneTheme.tokens[`--color-${variant}`]).toBe(
          `light-dark(${palette.light[30]}, ${palette.dark[80]})`,
        );
        return {light: palette.light[30], dark: palette.dark[80]};
      }),
    ];
    for (const tone of tones) {
      expect(contrast(tone.light, neutral.light[85])).toBeGreaterThanOrEqual(3);
      expect(contrast(tone.dark, neutral.dark[40])).toBeGreaterThanOrEqual(3);
      // Marks on a light-mode fill are light ink.
      expect(contrast(neutral.light[100], tone.light)).toBeGreaterThanOrEqual(
        3,
      );
    }
  });

  it.each(['neutral', 'disabled'])(
    'keeps a %s fill at 3:1 on the skeleton track: secondary text in light, stop 80 in dark',
    variant => {
      const {neutral} = stoneModePalettes;
      expect(
        stoneTheme.components!['progress-bar-fill'][`variant:${variant}`],
      ).toMatchObject({
        backgroundColor: `light-dark(var(--color-text-secondary), ${neutral.dark[80]})`,
      });
      // Secondary text in light mode is stop 40.
      expect(stoneTheme.tokens['--color-text-secondary']).toBe(
        `light-dark(${neutral.light[40]}, ${neutral.dark[70]})`,
      );
      expect(
        contrast(neutral.light[40], neutral.light[85]),
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrast(neutral.dark[80], neutral.dark[40]),
      ).toBeGreaterThanOrEqual(3);
    },
  );
});

describe('stone secondary ComplexSelector', () => {
  it('keeps the hover fill off a disabled trigger in either form', () => {
    expect(generateThemeCSS(stoneTheme).component).toMatch(
      /:hover:not\(:has\(> ?:is\(:disabled, ?\[aria-disabled="true"\]\)\)\)/,
    );
  });
});

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

describe('stone palette mapping', () => {
  it.each(['light', 'dark'] as const)(
    'resolves the neutral surface ladder from reviewed %s stops',
    mode => {
      const tokens = resolveThemeTokens(stoneTheme, {mode});
      const ramp = stoneModePalettes.neutral[mode];

      expect(tokens['--color-background-body']).toBe(
        ramp[mode === 'light' ? 95 : 5],
      );
      expect(tokens['--color-background-surface']).toBe(
        ramp[mode === 'light' ? 100 : 10],
      );
      expect(tokens['--color-background-card']).toBe(
        ramp[mode === 'light' ? 100 : 15],
      );
      expect(tokens['--color-background-popover']).toBe(
        ramp[mode === 'light' ? 100 : 20],
      );
      expect(tokens['--color-text-primary']).toBe(
        ramp[mode === 'light' ? 15 : 95],
      );
      expect(tokens['--color-text-secondary']).toBe(
        ramp[mode === 'light' ? 40 : 70],
      );
    },
  );

  it.each(['light', 'dark'] as const)(
    'keeps every categorical %s role on the same four-stop pattern',
    mode => {
      const tokens = resolveThemeTokens(stoneTheme, {mode});
      for (const family of categoricalFamilies) {
        const ramp = stoneModePalettes[family][mode];
        expect(tokens[`--color-background-${family}`]).toBe(
          ramp[mode === 'light' ? 90 : 35],
        );
        expect(tokens[`--color-border-${family}`]).toBe(
          ramp[mode === 'light' ? 85 : 25],
        );
        expect(tokens[`--color-icon-${family}`]).toBe(
          ramp[mode === 'light' ? 30 : 90],
        );
        expect(tokens[`--color-text-${family}`]).toBe(
          ramp[mode === 'light' ? 30 : 90],
        );
      }
    },
  );

  it('keeps light input rims and syntax attributes above their thresholds', () => {
    const {green, neutral, red, yellow} = stoneModePalettes;
    const surface = neutral.light[100];
    const syntaxBackground = neutral.light[95];
    const diffAlpha = 0x40 / 255;
    const addedRow = blend(green.light[90], syntaxBackground, diffAlpha);
    const removedRow = blend(red.light[90], syntaxBackground, diffAlpha);

    expect(contrast(green.light[55], surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(yellow.light[55], surface)).toBeGreaterThanOrEqual(3);
    for (const background of [syntaxBackground, addedRow, removedRow]) {
      expect(contrast(yellow.light[40], background)).toBeGreaterThanOrEqual(
        4.5,
      );
    }

    expect(stoneTheme.components?.['text-input']?.['status:success']).toEqual({
      '--color-border-success': `light-dark(${green.light[55]}, ${green.dark[70]})`,
      '--color-icon-success': `light-dark(${green.light[55]}, ${green.dark[70]})`,
    });
    expect(stoneTheme.components?.['text-input']?.['status:warning']).toEqual({
      '--color-border-warning': `light-dark(${yellow.light[55]}, ${yellow.dark[70]})`,
      '--color-icon-warning': `light-dark(${yellow.light[55]}, ${yellow.dark[70]})`,
    });
  });
});
