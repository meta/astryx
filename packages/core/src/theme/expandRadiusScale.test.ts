// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {defineTheme} from './defineTheme';
import {expandRadiusScale} from './expandRadiusScale';
import {generateThemeRules} from './generateThemeRules';
import {resolveThemeTokens} from './tokens';
import {radiusDefaults} from './tokens.stylex';

describe('expandRadiusScale', () => {
  it('generates default scale', () => {
    const tokens = expandRadiusScale({base: 4, multiplier: 1});
    expect(tokens['--radius-none']).toBe('0px');
    expect(tokens['--radius-inner']).toBe('4px');
    expect(tokens['--radius-element']).toBe('8px');
    expect(tokens['--radius-container']).toBe('12px');
    expect(tokens['--radius-page']).toBe('28px');
    expect(tokens).not.toHaveProperty('--radius-chat');
    expect(tokens['--radius-full']).toBe('9999px');
  });

  it('applies multiplier', () => {
    const tokens = expandRadiusScale({base: 4, multiplier: 1.5});
    expect(tokens['--radius-inner']).toBe('6px');
    expect(tokens['--radius-element']).toBe('12px');
    expect(tokens['--radius-container']).toBe('18px');
    expect(tokens['--radius-page']).toBe('42px');
  });

  it('multiplier 0 produces all zeros', () => {
    const tokens = expandRadiusScale({base: 4, multiplier: 0});
    expect(tokens['--radius-none']).toBe('0px');
    expect(tokens['--radius-inner']).toBe('0px');
    expect(tokens['--radius-element']).toBe('0px');
    expect(tokens['--radius-container']).toBe('0px');
    expect(tokens['--radius-page']).toBe('0px');
    expect(tokens['--radius-full']).toBe('9999px');
  });

  it('fixed tokens are unaffected by multiplier', () => {
    const tokens = expandRadiusScale({base: 4, multiplier: 2});
    expect(tokens['--radius-none']).toBe('0px');
    expect(tokens['--radius-full']).toBe('9999px');
  });

  it('rounds fractional results to nearest integer', () => {
    const tokens = expandRadiusScale({base: 3, multiplier: 1.3});
    // 3 * 1 * 1.3 = 3.9 → 4px
    expect(tokens['--radius-inner']).toBe('4px');
    // 3 * 2 * 1.3 = 7.8 → 8px
    expect(tokens['--radius-element']).toBe('8px');
  });

  it('works with non-standard base', () => {
    const tokens = expandRadiusScale({base: 6, multiplier: 1});
    expect(tokens['--radius-inner']).toBe('6px');
    expect(tokens['--radius-element']).toBe('12px');
    expect(tokens['--radius-container']).toBe('18px');
    expect(tokens['--radius-page']).toBe('42px');
  });
});

describe('--radius-chat', () => {
  const css = (config: Parameters<typeof defineTheme>[0]) =>
    generateThemeRules(defineTheme(config)).join('\n');

  it('defaults to the container radius', () => {
    expect(radiusDefaults['--radius-chat']).toBe('var(--radius-container)');
    expect(
      resolveThemeTokens(defineTheme({name: 'ChatPlain'}), {mode: 'light'}),
    ).toMatchObject({'--radius-chat': '12px'});
  });

  it('is declared again in a theme scope that sets --radius-container, so a nested theme follows its own value', () => {
    const theme = defineTheme({
      name: 'ChatContainer',
      tokens: {'--radius-container': '18px'},
    });
    expect(css(theme)).toContain('--radius-chat: var(--radius-container);');
    expect(resolveThemeTokens(theme, {mode: 'light'})).toMatchObject({
      '--radius-chat': '18px',
    });
  });

  it('follows the container of a radius scale, and a container the theme sets over the scale', () => {
    const scaled = defineTheme({
      name: 'ChatScale',
      radius: {base: 4, multiplier: 1.5},
    });
    expect(css(scaled)).toContain('--radius-chat: var(--radius-container);');
    expect(resolveThemeTokens(scaled, {mode: 'light'})).toMatchObject({
      '--radius-chat': '18px',
    });

    const container = defineTheme({
      name: 'ChatScaleContainer',
      radius: {base: 4, multiplier: 1.35},
      tokens: {'--radius-container': '8px'},
    });
    expect(css(container)).toContain('--radius-chat: var(--radius-container);');
    expect(resolveThemeTokens(container, {mode: 'light'})).toMatchObject({
      '--radius-container': '8px',
      '--radius-chat': '8px',
    });
  });

  it('keeps a value the theme sets or inherits, and is not declared by a theme with no radius', () => {
    const base = defineTheme({
      name: 'ChatPinned',
      tokens: {'--radius-container': '12px', '--radius-chat': '28px'},
    });
    expect(css(base)).not.toContain('--radius-chat: var(--radius-container);');

    const child = defineTheme({
      name: 'ChatPinnedChild',
      extends: base,
      tokens: {'--radius-container': '8px'},
    });
    expect(css(child)).toContain('--radius-chat: 28px;');
    expect(css(child)).not.toContain('--radius-chat: var(--radius-container);');
    expect(resolveThemeTokens(child, {mode: 'light'})).toMatchObject({
      '--radius-chat': '28px',
    });

    expect(css({name: 'ChatNoRadius'})).not.toContain('--radius-chat');
  });
});
