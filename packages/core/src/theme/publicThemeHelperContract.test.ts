// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {parseStyleKey, themeProps} from '@astryxdesign/core/utils';
import {
  defineTheme,
  generateOnMediaCSS,
  generateThemeCSS,
  generateThemeRules,
  generateThemeRulesSplit,
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
});
