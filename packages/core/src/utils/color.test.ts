// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  parseHex,
  parseRgb,
  parseColor,
  formatHex,
  formatColor,
  toGLFloats,
} from './color';

describe('parseHex', () => {
  it('parses #rrggbb', () => {
    expect(parseHex('#0064E0')).toEqual({r: 0, g: 100, b: 224, a: 1});
  });

  it('parses without a leading #', () => {
    expect(parseHex('0064E0')).toEqual({r: 0, g: 100, b: 224, a: 1});
  });

  it('expands #rgb shorthand', () => {
    expect(parseHex('#abc')).toEqual({r: 0xaa, g: 0xbb, b: 0xcc, a: 1});
  });

  it('parses #rrggbbaa alpha', () => {
    expect(parseHex('#00000080')).toEqual({r: 0, g: 0, b: 0, a: 128 / 255});
  });

  it('expands #rgba shorthand alpha', () => {
    expect(parseHex('#f008')).toEqual({
      r: 0xff,
      g: 0,
      b: 0,
      a: 0x88 / 255,
    });
  });

  it('returns null for non-hex input', () => {
    expect(parseHex('rgb(0,0,0)')).toBeNull();
    expect(parseHex('#12')).toBeNull();
    expect(parseHex('#zzzzzz')).toBeNull();
    // @ts-expect-error runtime guard for non-string input
    expect(parseHex(null)).toBeNull();
  });
});

describe('parseRgb', () => {
  it('parses comma-separated rgb()', () => {
    expect(parseRgb('rgb(0, 100, 224)')).toEqual({
      r: 0,
      g: 100,
      b: 224,
      a: 1,
    });
  });

  it('parses rgba() with alpha', () => {
    expect(parseRgb('rgba(0, 0, 0, 0.5)')).toEqual({r: 0, g: 0, b: 0, a: 0.5});
  });

  it('parses space-separated with slash alpha', () => {
    expect(parseRgb('rgb(0 100 224 / 0.25)')).toEqual({
      r: 0,
      g: 100,
      b: 224,
      a: 0.25,
    });
  });

  it('parses percentage channels', () => {
    expect(parseRgb('rgb(100%, 0%, 0%)')).toEqual({
      r: 255,
      g: 0,
      b: 0,
      a: 1,
    });
  });

  it('clamps alpha and channels into range', () => {
    expect(parseRgb('rgba(300, -20, 10, 2)')).toEqual({
      r: 255,
      g: 0,
      b: 10,
      a: 1,
    });
  });

  it('returns null when it cannot parse', () => {
    expect(parseRgb('rgb(0, 0)')).toBeNull();
    expect(parseRgb('#000000')).toBeNull();
  });
});

describe('parseColor', () => {
  it('routes hex and rgb strings to the right parser', () => {
    expect(parseColor('#FFFFFF')).toEqual({r: 255, g: 255, b: 255, a: 1});
    expect(parseColor('rgb(1, 2, 3)')).toEqual({r: 1, g: 2, b: 3, a: 1});
  });

  it('resolves the named colors used in token expressions', () => {
    expect(parseColor('transparent')).toEqual({r: 0, g: 0, b: 0, a: 0});
    expect(parseColor('BLACK')).toEqual({r: 0, g: 0, b: 0, a: 1});
    expect(parseColor('white')).toEqual({r: 255, g: 255, b: 255, a: 1});
  });

  it('returns null for unsupported colors so callers can preserve them', () => {
    expect(parseColor('var(--color-accent)')).toBeNull();
    expect(parseColor('oklch(0.5 0.1 200)')).toBeNull();
    expect(parseColor('rebeccapurple')).toBeNull();
  });

  it('returns null for names the prototype chain answers', () => {
    expect(parseColor('constructor')).toBeNull();
    expect(parseColor('__proto__')).toBeNull();
    expect(parseColor('CONSTRUCTOR')).toBeNull();
  });

  it('keeps the composed callers null-safe for those names', () => {
    // The charts/lab helpers compose `parseColor(color) ?? parseHex(color)`
    // and hand the result to formatColor; a truthy non-RGBA answer reaches
    // it as undefined channels.
    const rgba = parseColor('constructor') ?? parseHex('constructor');
    expect(rgba).toBeNull();
  });
});

describe('formatHex', () => {
  it('formats channels as uppercase #RRGGBB', () => {
    expect(formatHex(0, 100, 224)).toBe('#0064E0');
  });

  it('rounds and clamps out-of-range channels', () => {
    expect(formatHex(-5, 300, 127.6)).toBe('#00FF80');
  });
});

describe('formatColor', () => {
  it('formats opaque colors as hex', () => {
    expect(formatColor({r: 0, g: 100, b: 224, a: 1})).toBe('#0064E0');
  });

  it('formats translucent colors as rgba()', () => {
    expect(formatColor({r: 0, g: 100, b: 224, a: 0.2})).toBe(
      'rgba(0, 100, 224, 0.2)',
    );
  });

  it('round-trips through parseColor', () => {
    const parsed = parseColor('rgba(10, 20, 30, 0.5)');
    expect(parsed).not.toBeNull();
    expect(formatColor(parsed!)).toBe('rgba(10, 20, 30, 0.5)');
  });
});

describe('toGLFloats', () => {
  const GL_FALLBACK: [number, number, number] = [0.5, 0.5, 0.5];

  it('converts RGBA channels to 0-1 floats, dropping alpha', () => {
    expect(toGLFloats({r: 0, g: 100, b: 224, a: 0.5})).toEqual([
      0,
      100 / 255,
      224 / 255,
    ]);
  });

  it('returns the neutral fallback for null so the GPU never gets NaN', () => {
    expect(toGLFloats(null)).toEqual(GL_FALLBACK);
  });

  it('clamps hand-constructed out-of-range channels', () => {
    expect(toGLFloats({r: 300, g: -5, b: 127.5, a: 1})).toEqual([
      1,
      0,
      127.5 / 255,
    ]);
  });

  it('returns the fallback for hand-constructed non-finite channels', () => {
    expect(toGLFloats({r: NaN, g: 0, b: 0, a: 1})).toEqual(GL_FALLBACK);
    expect(toGLFloats({r: 0, g: Infinity, b: 0, a: 1})).toEqual(GL_FALLBACK);
  });

  // Conformance table for the GL hex path (#3739): pins the behavior of the
  // previously duplicated `hexToGL` copies in charts/lab, standardized on the
  // robust charts implementation. Composed as `toGLFloats(parseHex(input))`,
  // exactly as the migrated call sites do.
  it.each([
    ['#rrggbb', '#0064E0', [0, 100 / 255, 224 / 255]],
    ['bare rrggbb (no #)', '0064E0', [0, 100 / 255, 224 / 255]],
    ['#rgb shorthand', '#f00', [1, 0, 0]],
    ['#rgba shorthand (alpha ignored)', '#f008', [1, 0, 0]],
    ['#rrggbbaa (alpha byte ignored)', '#00000080', [0, 0, 0]],
    ['surrounding whitespace', '  #ffffff  ', [1, 1, 1]],
    ['truncated hex → fallback', '#12', [0.5, 0.5, 0.5]],
    ['non-hex garbage → fallback', 'not-a-color', [0.5, 0.5, 0.5]],
    ['CSS variable → fallback', 'var(--color-accent)', [0.5, 0.5, 0.5]],
    [
      'rgb() string → fallback on the hex path',
      'rgb(255, 0, 0)',
      [0.5, 0.5, 0.5],
    ],
    ['empty string → fallback', '', [0.5, 0.5, 0.5]],
  ])('%s: %j → %j', (_label, input, expected) => {
    expect(toGLFloats(parseHex(input))).toEqual(expected);
  });

  it('composes with parseColor when the caller wants rgb()/named support', () => {
    expect(toGLFloats(parseColor('rgb(255, 0, 0)'))).toEqual([1, 0, 0]);
    expect(toGLFloats(parseColor('transparent'))).toEqual([0, 0, 0]);
  });
});

describe('alpha application (conformance for charts/lab `colors.alpha`)', () => {
  // The charts/lab `hexAlpha` helpers are rebuilt on parseColor + parseHex +
  // formatColor (#3739). These pin the composed behavior they rely on.
  const applyAlpha = (color: string, opacity: number): string => {
    const rgba = parseColor(color) ?? parseHex(color);
    return rgba === null ? color : formatColor({...rgba, a: opacity});
  };

  it('applies opacity to an opaque hex color', () => {
    expect(applyAlpha('#0064E0', 0.2)).toBe('rgba(0, 100, 224, 0.2)');
  });

  it('applies opacity to bare hex without the leading #', () => {
    expect(applyAlpha('0064E0', 0.2)).toBe('rgba(0, 100, 224, 0.2)');
  });

  it('opacity argument wins over an existing alpha byte', () => {
    expect(applyAlpha('#0064E080', 0.2)).toBe('rgba(0, 100, 224, 0.2)');
  });

  it('opacity argument wins over rgba() input alpha', () => {
    expect(applyAlpha('rgba(0, 100, 224, 0.9)', 0.2)).toBe(
      'rgba(0, 100, 224, 0.2)',
    );
  });

  it('full opacity serializes back to hex', () => {
    expect(applyAlpha('#0064E0', 1)).toBe('#0064E0');
  });

  it('unparseable input is preserved unchanged', () => {
    expect(applyAlpha('var(--color-accent)', 0.2)).toBe('var(--color-accent)');
  });

  it('preserves names the prototype chain answers', () => {
    expect(applyAlpha('constructor', 0.2)).toBe('constructor');
    expect(applyAlpha('__proto__', 1)).toBe('__proto__');
  });
});
