// Copyright (c) Meta Platforms, Inc. and affiliates.

import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {generateThemeCSS} from '@astryxdesign/core/theme';
import {palette as butterModePalettes} from './butterPalettes.generated';
import {butterTheme} from './butterTheme';

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

const source = readFileSync(
  new URL('./butterTheme.ts', import.meta.url),
  'utf8',
);
const maintainedThemeSource = source.slice(
  0,
  source.indexOf('/**\n * Frozen released compatibility palettes'),
);

describe('butter touch + narrow type pin', () => {
  it('floors body to 16px and holds Display 1 at its desktop size', () => {
    const rule = butterTheme.__adaptationRules?.[0];

    expect(butterTheme.__adaptations.rules).toHaveLength(1);
    expect(rule?.when).toEqual({pointer: 'coarse', width: {below: 'lg'}});
    expect(rule?.query).toBe('(width < 1024px) and (pointer: coarse)');
    expect(rule?.tokens['--font-size-base']).toBe('1rem');
    expect(rule?.tokens['--font-size-lg']).toBe('1.25rem');
    expect(rule?.tokens['--font-size-5xl']).toBe('3.3125rem');
    expect(butterTheme.tokens['--font-size-base']).toBe('0.875rem');
    expect(butterTheme.tokens['--font-size-5xl']).toBe('3.3125rem');
    expect(generateThemeCSS(butterTheme).component).toContain(
      '@media (width < 1024px) and (pointer: coarse)',
    );
  });
});

describe('butter input status roles', () => {
  it('keeps bright per-input status rims and glyphs on the border and icon roles', () => {
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

    const {green, red, yellow} = butterModePalettes;
    for (const input of inputs) {
      const component = butterTheme.components![input];
      expect(component['status:success']).toMatchObject({
        '--color-border-success': `light-dark(${green.light[55]}, ${green.light[70]})`,
        '--color-icon-success': `light-dark(${green.light[55]}, ${green.light[70]})`,
      });
      expect(component['status:warning']).toMatchObject({
        '--color-border-warning': `light-dark(${yellow.light[55]}, ${yellow.light[80]})`,
        '--color-icon-warning': `light-dark(${yellow.light[55]}, ${yellow.light[80]})`,
      });
      expect(component['status:error']).toMatchObject({
        '--color-border-error': red.light[60],
        '--color-icon-error': red.light[60],
      });
    }
  });
});

describe('butter secondary ComplexSelector', () => {
  it('keeps the hover fill off a disabled trigger in either form', () => {
    expect(generateThemeCSS(butterTheme).component).toMatch(
      /:hover:not\(:has\(> ?:is\(:disabled, ?\[aria-disabled="true"\]\)\)\)/,
    );
  });
});

describe('butter color token mapping completeness', () => {
  it('does not redefine the data-visualization color system', () => {
    expect(
      Object.keys(butterTheme.tokens).filter(name =>
        name.startsWith('--color-data-'),
      ),
    ).toEqual([]);
  });

  it('keeps every root color value concrete', () => {
    for (const [name, value] of Object.entries(butterTheme.tokens)) {
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
    expect(maintainedThemeSource).not.toMatch(
      /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsl[a]?\(|\boklch\(|\bblack\b|\bwhite\b/i,
    );
  });

  it('keeps maintained component text pairings at normal-text AA', () => {
    const {accent, neutral, red, yellow} = butterModePalettes;
    const pairs = [
      ['info status', neutral.light[15], accent.light[55]],
      ['error status', neutral.light[15], red.light[60]],
      ['neutral badge', accent.light[35], yellow.light[90]],
      ['light top nav', accent.light[40], neutral.light[95]],
      ['selected light top nav', accent.light[35], neutral.light[95]],
    ] as const;

    for (const [name, foreground, background] of pairs) {
      expect(contrast(foreground, background), name).toBeGreaterThanOrEqual(
        4.5,
      );
    }

    expect(butterTheme.components?.badge).toMatchObject({
      'variant:info': {
        backgroundColor: accent.light[55],
        color: neutral.light[15],
      },
      'variant:neutral': {
        backgroundColor: yellow.light[90],
        color: accent.light[35],
      },
      'variant:error': {
        backgroundColor: red.light[60],
        color: neutral.light[15],
      },
    });
    expect(butterTheme.components?.banner).toMatchObject({
      'status:info': {
        '--color-info-muted': accent.light[55],
        '--color-on-info-muted': neutral.light[15],
      },
      'status:error': {
        '--color-error-muted': red.light[60],
        '--color-on-error-muted': neutral.light[15],
      },
    });
    expect(
      butterTheme.components?.['field-status']?.['type:error'],
    ).toMatchObject({backgroundColor: red.light[60], color: neutral.light[15]});
    expect(butterTheme.components?.['top-nav-item']).toMatchObject({
      base: {
        color: `light-dark(${accent.light[40]}, ${yellow.dark[90]}cc)`,
      },
      selected: {
        color: `light-dark(${accent.light[35]}, ${yellow.dark[90]})`,
      },
    });
  });
});
