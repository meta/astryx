// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {resolveThemeTokens} from '@astryxdesign/core/theme';
import {palette as glassModePalettes} from './glassPalettes.generated';
import {glassTheme} from './glassTheme';

const hues = [
  'blue',
  'cyan',
  'gray',
  'green',
  'orange',
  'pink',
  'purple',
  'red',
  'teal',
  'yellow',
] as const;

type Hue = (typeof hues)[number];

const surfaces = ['body', 'surface', 'card', 'popover', 'muted'] as const;

type RGBA = {r: number; g: number; b: number; a: number};

function parseHex(color: string): RGBA {
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(color);
  if (!match) {
    throw new Error(`Expected a hex color, received ${color}`);
  }
  const [r, g, b] = [0, 2, 4].map(index =>
    Number.parseInt(match[1].slice(index, index + 2), 16),
  );
  const a = match[2] ? Number.parseInt(match[2], 16) / 255 : 1;
  return {r, g, b, a};
}

/** Paints `layers`, listed from the topmost down, over an opaque base. */
function flatten(layers: readonly string[]): RGBA {
  const [base, ...above] = [...layers].reverse().map(parseHex);
  if (base.a !== 1) {
    throw new Error('The lowest layer must be opaque.');
  }
  return above.reduce(
    (backdrop, layer) => ({
      r: layer.r * layer.a + backdrop.r * (1 - layer.a),
      g: layer.g * layer.a + backdrop.g * (1 - layer.a),
      b: layer.b * layer.a + backdrop.b * (1 - layer.a),
      a: 1,
    }),
    base,
  );
}

function luminance({r, g, b}: RGBA): number {
  const [red, green, blue] = [r, g, b].map(channel => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** WCAG 2.2 contrast of `foreground` over `layers`, topmost layer first. */
function contrast(foreground: string, layers: readonly string[]): number {
  const backdrop = flatten(layers);
  const fore = flatten([foreground, ...layers]);
  const [lighter, darker] = [luminance(fore), luminance(backdrop)].sort(
    (left, right) => right - left,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

const tokens = resolveThemeTokens(glassTheme, {mode: 'dark'});
const navy = glassModePalettes.neutral.dark;

function token(name: string): string {
  const value = tokens[name];
  if (typeof value !== 'string') {
    throw new Error(`${name} is not set`);
  }
  return value;
}

/** A hex color at the start of a gradient: `linear-gradient(155deg, #… 0%`. */
function gradientStart(value: unknown): string {
  const match = /linear-gradient\(155deg, (#[0-9a-f]{6,8}) 0%/i.exec(
    String(value),
  );
  if (!match) {
    throw new Error(`Expected a corner tint, received ${String(value)}`);
  }
  return match[1];
}

type Rules = Record<string, Record<string, string>>;

const components = glassTheme.components as Record<string, Rules>;
const card = components.card;

/** The control edge each field shell, checkbox, and radio box paints. */
const controlEdges = ['field', 'checkbox-indicator', 'radio-indicator'].map(
  target => components[target].base['--color-border-emphasized'],
);

/** The layers at a card's top-left corner, where its tint is strongest. */
function cardCorner(variant: 'base' | `variant:${Hue}`): string[] {
  return [
    gradientStart(card[variant].backgroundImage),
    token('--color-background-card'),
  ];
}

describe('glass theme', () => {
  it('renders the same colors and shadows in light and dark mode', () => {
    const light = resolveThemeTokens(glassTheme, {mode: 'light'});
    const names = Object.keys(tokens).filter(
      name => name.startsWith('--color-') || name.startsWith('--shadow-'),
    );
    expect(names.length).toBeGreaterThan(100);
    for (const name of names) {
      expect(light[name], name).toBe(tokens[name]);
    }
  });

  it('maps its navy surface ladder to the palette', () => {
    expect(token('--color-background-body')).toBe(navy[5]);
    expect(token('--color-background-surface')).toBe(navy[5]);
    expect(token('--color-background-card')).toBe(navy[15]);
    expect(token('--color-background-popover')).toBe(navy[20]);
    expect(token('--color-background-muted')).toBe(navy[20]);
    expect(token('--color-text-primary')).toBe(navy[95]);
    expect(token('--color-text-secondary')).toBe(navy[75]);
  });

  it('keeps every root color a palette value', () => {
    const stops = new Set<string>(
      Object.values(glassModePalettes).flatMap(family =>
        Object.values(family.dark),
      ),
    );
    for (const [name, value] of Object.entries(glassTheme.tokens)) {
      if (!name.startsWith('--color-') || name.startsWith('--color-syntax-')) {
        continue;
      }
      expect(value, name).toMatch(/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i);
      expect(stops.has(String(value).slice(0, 7)), name).toBe(true);
    }
  });

  describe.each(surfaces)('on the %s surface', surface => {
    const layers = [token(`--color-background-${surface}`)];

    it.each([
      '--color-text-primary',
      '--color-text-secondary',
      '--color-text-accent',
      '--color-icon-primary',
      '--color-icon-secondary',
    ])('%s meets 4.5:1', foreground => {
      expect(contrast(token(foreground), layers)).toBeGreaterThanOrEqual(4.5);
    });

    it('the focus ring meets 3:1', () => {
      expect(contrast(token('--color-accent'), layers)).toBeGreaterThanOrEqual(
        3,
      );
    });

    it('a control edge meets 3:1', () => {
      for (const edge of controlEdges) {
        expect(contrast(edge, layers)).toBeGreaterThanOrEqual(3);
      }
    });
  });

  it('draws the focus ring in the accent color', () => {
    expect(tokens['--focus-outline-color']).toBe(token('--color-accent'));
  });

  it('text on the accent fill meets 4.5:1', () => {
    expect(
      contrast(token('--color-on-accent'), [token('--color-accent')]),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('text and the focus ring read on a plain card corner', () => {
    const corner = cardCorner('base');
    expect(
      contrast(token('--color-text-primary'), corner),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(token('--color-text-secondary'), corner),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('--color-accent'), corner)).toBeGreaterThanOrEqual(3);
  });

  describe.each(hues)('the %s hue', hue => {
    const rule = card[`variant:${hue}`];
    const corner = cardCorner(`variant:${hue}`);

    it('reads as text on its tint over every surface', () => {
      for (const surface of surfaces) {
        expect(
          contrast(token(`--color-text-${hue}`), [
            token(`--color-background-${hue}`),
            token(`--color-background-${surface}`),
          ]),
          surface,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    it('a hued card keeps its text at 4.5:1', () => {
      for (const foreground of [
        token('--color-text-primary'),
        token('--color-text-secondary'),
        rule['--color-text-accent'],
      ]) {
        expect(contrast(foreground, corner), foreground).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    });

    it('a hued card keeps its accent, focus ring, and control edges at 3:1', () => {
      expect(
        contrast(rule['--color-accent'], corner),
        'accent',
      ).toBeGreaterThanOrEqual(3);
      for (const edge of controlEdges) {
        expect(contrast(edge, corner), 'control edge').toBeGreaterThanOrEqual(
          3,
        );
      }
    });

    it('its border meets 3:1 against the page and the card', () => {
      for (const layers of [
        [token('--color-background-body')],
        [token('--color-background-card')],
        corner,
      ]) {
        expect(
          contrast(token(`--color-border-${hue}`), layers),
        ).toBeGreaterThanOrEqual(3);
      }
    });
  });
});
