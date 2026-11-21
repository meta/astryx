// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {parseStyleKey, themeProps} from '@astryxdesign/core/utils';
import {
  defineTheme,
  generateOnMediaCSS,
  generateThemeCSS,
  generateAdaptationCSS,
  generateThemeRules,
  generateThemeRulesSplit,
  THEME_SUB_LAYER_ORDER,
} from '@astryxdesign/core/theme';

const theme = defineTheme({
  name: 'public-helper-contract',
  components: {
    button: {
      'variant:primary': {color: 'red'},
    },
  },
  onDark: {
    components: {
      button: {
        'variant:primary': {color: 'pink'},
      },
    },
  },
});

const selector = '.astryx-button[data-variant="primary"]';

describe('public theme helper selector contract', () => {
  it('keeps canonical data attributes without bare compatibility classes', () => {
    expect(themeProps('button', {variant: 'primary', size: 'sm'})).toEqual({
      className: 'astryx-button',
      'data-variant': 'primary',
      'data-size': 'sm',
    });
  });

  it('returns reflected data-attribute suffixes from parseStyleKey', () => {
    expect(parseStyleKey('variant:primary+size:sm')).toBe(
      '[data-variant="primary"][data-size="sm"]',
    );
  });

  it('keeps generator containers while changing component selector bytes', () => {
    const rules = generateThemeRules(theme);
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.join('\n')).toContain(selector);
    expect(rules.join('\n')).not.toContain('.astryx-button.primary');

    const split = generateThemeRulesSplit(theme);
    expect(Object.keys(split).sort()).toEqual(['component', 'prose']);
    expect(split.component.join('\n')).toContain(selector);
    expect(split.prose.join('\n')).not.toContain(selector);

    const media = generateOnMediaCSS(theme);
    expect(media).toContain(selector);
    expect(media).not.toContain('.astryx-button.primary');

    const css = generateThemeCSS(theme);
    expect(Object.keys(css).sort()).toEqual(['component', 'prose']);
    expect(css.component).toContain(selector);
    expect(css.component).not.toContain('.astryx-button.primary');
    expect(css.prose).not.toContain(selector);
  });
  // The layered outputs the CLI's theme build reads from a project's Core
  // (architecture:theme-compilation INV22), beside the ones above.
  it('returns the shared-element parts apart only when asked for the layered output', () => {
    const parted = defineTheme({
      name: 'public-helper-layered',
      components: {
        button: {'variant:primary': {color: 'red'}},
        'toggle-button': {base: {color: 'blue'}},
      },
      onDark: {components: {'toggle-button': {base: {color: 'white'}}}},
    });
    expect(THEME_SUB_LAYER_ORDER).toBe('@layer components, parts;');

    const split = generateThemeRulesSplit(parted, undefined, {layered: true});
    expect(Object.keys(split).sort()).toEqual(['component', 'parts', 'prose']);
    expect(split.parts?.join('\n')).toContain('.astryx-toggle-button');
    expect(split.component.join('\n')).not.toContain('.astryx-toggle-button');

    const media = generateOnMediaCSS(parted, undefined, {layered: true});
    expect(Object.keys(media).sort()).toEqual(['component', 'parts']);
    expect(media.parts).toContain('.astryx-toggle-button');

    expect(Object.keys(generateAdaptationCSS(parted)).sort()).toEqual([
      'component',
      'prose',
    ]);
    expect(
      Object.keys(
        generateAdaptationCSS(parted, undefined, {layered: true}),
      ).sort(),
    ).toEqual(['component', 'parts', 'prose']);
  });
});
