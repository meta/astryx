// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {relativeLuminance, compositeOver, contrastRatio} from './contrast';
import {parseColor} from '../utils/color';
import {resolveThemeToken} from './tokens';
import {defineTheme, type DefinedTheme} from './defineTheme';

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance({r: 0, g: 0, b: 0, a: 1})).toBe(0);
    expect(relativeLuminance({r: 255, g: 255, b: 255, a: 1})).toBeCloseTo(
      1,
      10,
    );
  });

  it('weights channels per WCAG (green brightest, blue darkest)', () => {
    const red = relativeLuminance({r: 255, g: 0, b: 0, a: 1});
    const green = relativeLuminance({r: 0, g: 255, b: 0, a: 1});
    const blue = relativeLuminance({r: 0, g: 0, b: 255, a: 1});
    expect(red).toBeCloseTo(0.2126, 4);
    expect(green).toBeCloseTo(0.7152, 4);
    expect(blue).toBeCloseTo(0.0722, 4);
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for identical colors', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#3B82F6', '#3B82F6')).toBe(1);
  });

  it('is symmetric in fg/bg for opaque colors', () => {
    expect(contrastRatio('#0064E0', '#FCFDFE')).toBeCloseTo(
      contrastRatio('#FCFDFE', '#0064E0'),
      10,
    );
  });

  it('matches the canonical 4.5:1 boundary gray (#767676 on white)', () => {
    const ratio = contrastRatio('#767676', '#FFFFFF');
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(ratio).toBeLessThan(4.6);
  });

  it('composites a translucent foreground over the background', () => {
    // 50% black over white paints as mid-gray, not black.
    const composited = contrastRatio('rgba(0, 0, 0, 0.5)', '#FFFFFF');
    expect(composited).toBeLessThan(contrastRatio('#000000', '#FFFFFF'));
    expect(composited).toBeCloseTo(
      contrastRatio('rgb(127.5, 127.5, 127.5)', '#FFFFFF'),
      10,
    );
  });

  it('rejects a translucent background', () => {
    expect(() => contrastRatio('#000000', '#FFFFFF80')).toThrow(
      /background must be opaque/,
    );
  });

  it('rejects unparseable colors', () => {
    expect(() => contrastRatio('var(--color-accent)', '#FFFFFF')).toThrow(
      /could not parse foreground/,
    );
    expect(() => contrastRatio('#000000', 'oklch(0.5 0.1 200)')).toThrow(
      /could not parse background/,
    );
  });
});

describe('compositeOver', () => {
  it('returns the foreground when opaque and the backdrop at alpha 0', () => {
    const fg = parseColor('#123456');
    const bg = parseColor('#FFFFFF');
    if (fg === null || bg === null) {
      throw new Error('fixture colors must parse');
    }
    expect(compositeOver(fg, bg)).toEqual({...fg, a: 1});
    expect(compositeOver({...fg, a: 0}, bg)).toEqual({...bg, a: 1});
  });

  it('blends in gamma-encoded sRGB space like CSS', () => {
    const fg = parseColor('rgba(0, 0, 0, 0.5)');
    const bg = parseColor('#FFFFFF');
    if (fg === null || bg === null) {
      throw new Error('fixture colors must parse');
    }
    const out = compositeOver(fg, bg);
    expect(out.r).toBeCloseTo(127.5, 5);
    expect(out.g).toBeCloseTo(127.5, 5);
    expect(out.b).toBeCloseTo(127.5, 5);
    expect(out.a).toBe(1);
  });
});

describe('the stock accent pair', () => {
  // --color-on-accent is the label on every --color-accent fill, such as a
  // primary Button's, which is normal-size text (WCAG 1.4.3: 4.5:1).
  it.each(['light', 'dark'] as const)('meets 4.5:1 in the %s theme', mode => {
    const accent = resolveThemeToken(null, '--color-accent', {mode});
    const onAccent = resolveThemeToken(null, '--color-on-accent', {mode});
    expect(contrastRatio(onAccent, accent)).toBeGreaterThanOrEqual(4.5);
  });
});

// architecture:theme-tokens INV13: a form control's edge is often the only cue
// to where the control is, so --color-border-control meets 3:1 (WCAG 1.4.11)
// against the surface and the page body.
describe('the form-control edge (--color-border-control)', () => {
  const MODES = ['light', 'dark'] as const;
  const AGAINST = [
    '--color-background-surface',
    '--color-background-body',
  ] as const;

  function expectControlEdge(theme: DefinedTheme | null, label: string): void {
    for (const mode of MODES) {
      const edge = resolveThemeToken(theme, '--color-border-control', {mode});
      for (const background of AGAINST) {
        const against = resolveThemeToken(theme, background, {mode});
        const ratio = edge === '' ? 0 : contrastRatio(edge, against);
        expect(
          ratio,
          `${label} ${mode}: ${edge || '(unset)'} on ${background} ${against}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  }

  it("meets 3:1 in Core's defaults", () => {
    expectControlEdge(null, 'Core');
  });

  // The first-party theme templates live in the CLI, outside Core's
  // type-checked sources, so they load at run time.
  const TEMPLATES = '../../../cli/assets/templates/themes';
  it.each([
    'butter',
    'chocolate',
    'gothic',
    'matcha',
    'neutral',
    'stone',
    'y2k',
  ])('meets 3:1 in the %s theme template', async name => {
    const module = (await import(
      /* @vite-ignore */ `${TEMPLATES}/${name}/${name}Theme.ts`
    )) as Record<string, DefinedTheme>;
    expectControlEdge(module[`${name}Theme`], name);
  });

  it.each([
    {accent: '#0064E0'},
    {accent: '#B7410E', neutralStyle: 'warm'},
    {accent: '#B7410E', neutralStyle: 'warm', contrast: 'high'},
    {neutralStyle: 'neutral'},
  ] as const)('meets 3:1 in a generated theme (%o)', color => {
    expectControlEdge(defineTheme({name: 'generated', color}), 'generated');
  });
});
