// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  colorStep,
  coreFilledStatePaints,
  deriveFilledStatePaints,
  statePaintFor,
  VISIBLE_STEP,
} from './filledStatePaint';
import {composite, contrastRatio, parseConcreteColor} from './statusColor';
import {defineTheme} from './defineTheme';
import {generateAdaptationCSS, generateThemeRules} from './generateThemeRules';

const rgb = (hex: string) => parseConcreteColor(hex)!;

describe('filledStatePaint', () => {
  it("holds Core's own paints in filledStatePaint.stylex.ts", () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'filledStatePaint.stylex.ts'),
      'utf8',
    );
    const written = Object.fromEntries(
      [...source.matchAll(/'(--_button-[\w-]+)':\s*'([^']+)'/g)].map(m => [
        m[1],
        m[2],
      ]),
    );
    expect(written).toEqual(Object.fromEntries(coreFilledStatePaints()));
  });

  it('tints away from the label where that shows, keeping 4.5:1', () => {
    // A mid blue under white text darkens.
    const fill = rgb('#0064e0');
    const label = rgb('#ffffff');
    const paint = statePaintFor(fill, label, 'hover')!;
    expect(paint).toMatchObject({r: 0, g: 0, b: 0});
    const over = composite(paint, fill);
    expect(colorStep(over, fill)).toBeGreaterThan(VISIBLE_STEP);
    expect(contrastRatio(label, over)).toBeGreaterThan(
      contrastRatio(label, fill),
    );
  });

  it('tints toward the label on a fill already at the far end', () => {
    // A near-black fill under white text cannot darken visibly: it lightens.
    const fill = rgb('#111111');
    const label = rgb('#ffffff');
    for (const state of ['hover', 'pressed'] as const) {
      const paint = statePaintFor(fill, label, state)!;
      expect(paint).toMatchObject({r: 255, g: 255, b: 255});
      const over = composite(paint, fill);
      expect(colorStep(over, fill)).toBeGreaterThan(VISIBLE_STEP);
      expect(contrastRatio(label, over)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('tints a near-white fill under dark text toward the label, as a dark-mode primary is', () => {
    // Neutral's dark primary: a near-white fill with near-black text. A tint
    // away from the label cannot show on it, so the paint tints toward the
    // label, which darkens it.
    const fill = rgb('#ededed');
    const label = rgb('#111111');
    for (const state of ['hover', 'pressed'] as const) {
      const paint = statePaintFor(fill, label, state)!;
      expect(paint).toMatchObject({r: 17, g: 17, b: 17});
      const over = composite(paint, fill);
      expect(colorStep(over, fill)).toBeGreaterThan(VISIBLE_STEP);
      expect(contrastRatio(label, over)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('paints its own tint where the shared overlay drops the label under 4.5:1', () => {
    // White text on #767676 reads at 4.54:1; a lightening overlay drops it.
    const paints = Object.fromEntries(
      deriveFilledStatePaints({
        '--color-accent': '#767676',
        '--color-on-accent': '#ffffff',
        '--color-overlay-hover': '#FFFFFF26',
        '--color-overlay-pressed': '#FFFFFF40',
      }),
    );
    expect(paints['--_button-primary-hover']).not.toContain('var(');
    expect(paints['--_button-primary-pressed']).not.toContain('var(');
  });

  it('measures the label a theme generates for its error fill', () => {
    // A theme that sets only its error fill gets a generated label for it.
    // The paint is measured on that label, not on Core's default.
    const theme = defineTheme({
      name: 'error-only',
      tokens: {'--color-error': '#E04040'},
    });
    const css = generateThemeRules(theme).join('\n');
    const label = /--color-on-error: (light-dark\([^;]+\)|[^;]+);/.exec(
      css,
    )?.[1];
    expect(label).toBeDefined();
    const paints = Object.fromEntries(
      deriveFilledStatePaints({
        '--color-error': '#E04040',
        '--color-on-error': label!,
      }),
    );
    for (const name of [
      '--_button-destructive-hover',
      '--_button-destructive-pressed',
    ]) {
      expect(css).toContain(`${name}: ${paints[name]};`);
    }
  });

  it("measures a theme's own button rule fill and label", () => {
    const tokens = {
      '--color-accent': '#111111',
      '--color-on-accent': '#ffffff',
      '--color-overlay-hover': '#FFFFFF26',
      '--color-overlay-pressed': '#FFFFFF40',
    };
    const plain = Object.fromEntries(deriveFilledStatePaints(tokens));
    const ruled = Object.fromEntries(
      deriveFilledStatePaints(
        tokens,
        {},
        {
          'variant:primary': {backgroundColor: '#767676'},
        },
      ),
    );
    expect(ruled['--_button-primary-hover']).not.toBe(
      plain['--_button-primary-hover'],
    );
  });

  it('keeps the label readable where no tint both shows and reads', () => {
    // A black fill under a mid-grey label (4.62:1): a tint toward the label
    // that shows drops it under 4.5:1, and black cannot darken. The paint
    // keeps the label readable instead.
    const fill = rgb('#000000');
    const label = rgb('#767676');
    for (const state of ['hover', 'pressed'] as const) {
      const paint = statePaintFor(fill, label, state)!;
      expect(
        contrastRatio(label, composite(paint, fill)),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the shared overlay for a fill it cannot measure', () => {
    const paints = Object.fromEntries(
      deriveFilledStatePaints({
        '--color-accent': 'oklch(50% 0.2 250)',
        '--color-overlay-hover': '#FFFFFF26',
        '--color-overlay-pressed': '#FFFFFF40',
      }),
    );
    expect(paints['--_button-primary-hover']).toBe(
      'light-dark(#FFFFFF26, #FFFFFF26)',
    );
    expect(paints['--_button-primary-pressed']).toBe(
      'light-dark(#FFFFFF40, #FFFFFF40)',
    );
  });

  it('measures again in an adaptation that re-points a colour it reads', () => {
    const theme = defineTheme({
      name: 'stronger-overlay',
      tokens: {'--color-accent': '#767676', '--color-on-accent': '#ffffff'},
      adaptations: {
        rules: [
          {
            when: {contrast: 'more'},
            value: {
              tokens: {
                '--color-overlay-hover': '#FFFFFF40',
                '--color-overlay-pressed': '#FFFFFF60',
              },
            },
          },
        ],
      },
    });
    const {prose, component} = generateAdaptationCSS(theme);
    const adaptation = `${prose}\n${component}`;
    expect(adaptation).toContain('--_button-primary-hover');
    expect(adaptation).not.toMatch(
      /--_button-primary-hover: light-dark\(#FFFFFF40/,
    );
  });

  it('writes nothing for a theme that sets no colour it reads', () => {
    expect(deriveFilledStatePaints({'--radius-element': '4px'})).toEqual([]);
  });
});
