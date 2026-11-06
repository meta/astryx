// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, beforeAll} from 'vitest';
import {defineTheme, generateOnMediaCSS} from './defineTheme';
import {
  defaultOnDarkTokens,
  defaultOnLightTokens,
  resolveOnMedia,
} from './onMediaTokens';

describe('onMediaTokens', () => {
  describe('defaultOnDarkTokens', () => {
    it('sets color-scheme to dark', () => {
      expect(defaultOnDarkTokens['color-scheme']).toBe('dark');
    });

    it('provides text primary as on-dark color', () => {
      expect(defaultOnDarkTokens['--color-text-primary']).toBe(
        'var(--color-on-dark)',
      );
    });

    it('provides icon primary as on-dark color', () => {
      expect(defaultOnDarkTokens['--color-icon-primary']).toBe(
        'var(--color-on-dark)',
      );
    });

    it('collapses accent to on-dark color', () => {
      expect(defaultOnDarkTokens['--color-accent']).toBe(
        'var(--color-on-dark)',
      );
    });
  });

  describe('defaultOnLightTokens', () => {
    it('sets color-scheme to light', () => {
      expect(defaultOnLightTokens['color-scheme']).toBe('light');
    });

    it('provides text primary as on-light color', () => {
      expect(defaultOnLightTokens['--color-text-primary']).toBe(
        'var(--color-on-light)',
      );
    });
  });

  describe('resolveOnMedia', () => {
    it('returns defaults when no user overrides', () => {
      const result = resolveOnMedia('dark');
      expect(result.tokens).toEqual(defaultOnDarkTokens);
      expect(result.components).toBeUndefined();
    });

    it('merges user token overrides with defaults', () => {
      const result = resolveOnMedia('dark', {
        tokens: {'--color-accent': '#90CAF9'},
      });
      expect(result.tokens['--color-accent']).toBe('#90CAF9');
      expect(result.tokens['--color-text-primary']).toBe(
        'var(--color-on-dark)',
      );
    });

    it('resolves [light, dark] tuple tokens', () => {
      const result = resolveOnMedia('dark', {
        tokens: {'--color-accent': ['#AAA', '#BBB']},
      });
      expect(result.tokens['--color-accent']).toBe('light-dark(#AAA, #BBB)');
    });

    it('passes through component overrides', () => {
      const components = {
        button: {
          'variant:ghost': {borderWidth: '1px'},
        },
      };
      const result = resolveOnMedia('dark', {components});
      expect(result.components).toBe(components);
    });

    it('returns light defaults for surface=light', () => {
      const result = resolveOnMedia('light');
      expect(result.tokens).toEqual(defaultOnLightTokens);
    });
  });
});

describe('defineTheme with onDark/onLight', () => {
  it('stores resolved onDark on the theme', () => {
    const theme = defineTheme({
      name: 'test',
      onDark: {
        tokens: {'--color-accent': '#90CAF9'},
      },
    });
    expect(theme.__onDark).toBeDefined();
    expect(theme.__onDark!.tokens['--color-accent']).toBe('#90CAF9');
    expect(theme.__onDark!.tokens['--color-text-primary']).toBe(
      'var(--color-on-dark)',
    );
  });

  it('stores resolved onLight on the theme', () => {
    const theme = defineTheme({
      name: 'test',
      onLight: {
        tokens: {'--color-accent': '#333'},
      },
    });
    expect(theme.__onLight).toBeDefined();
    expect(theme.__onLight!.tokens['--color-accent']).toBe('#333');
  });

  it('generates defaults even without explicit onDark/onLight', () => {
    const theme = defineTheme({name: 'test'});
    expect(theme.__onDark).toBeDefined();
    expect(theme.__onLight).toBeDefined();
    expect(theme.__onDark!.tokens['color-scheme']).toBe('dark');
    expect(theme.__onLight!.tokens['color-scheme']).toBe('light');
  });

  it('stores component overrides on onDark', () => {
    const theme = defineTheme({
      name: 'test',
      onDark: {
        components: {
          button: {'variant:ghost': {borderWidth: '1px'}},
        },
      },
    });
    expect(theme.__onDark!.components).toBeDefined();
    expect(theme.__onDark!.components!.button['variant:ghost']).toEqual({
      borderWidth: '1px',
    });
  });
});

describe('generateOnMediaCSS', () => {
  it('emits @scope with [data-astryx-media] token rules', () => {
    const theme = defineTheme({name: 'test'});
    const css = generateOnMediaCSS(theme);
    expect(css).toContain('@scope ([data-astryx-theme="test"])');
    // Same scope boundary as main theme
    expect(css).toContain('to ([data-astryx-theme])');
    expect(css).toContain('[data-astryx-media="dark"]');
    expect(css).toContain('color-scheme: dark');
    expect(css).toContain('var(--color-on-dark)');
    expect(css).not.toContain('--color-text-info: var(--color-text-blue);');
  });

  it('emits light media rules', () => {
    const theme = defineTheme({name: 'test'});
    const css = generateOnMediaCSS(theme);
    expect(css).toContain('[data-astryx-media="light"]');
    expect(css).toContain('color-scheme: light');
  });

  it('keeps concrete root roles while rebinding default aliases on media surfaces', () => {
    const concrete = defineTheme({
      name: 'status-role-media',
      tokens: {
        '--color-text-blue': '#0074E2',
        '--color-text-info': '#6D9CFE',
      },
      onDark: {tokens: {'--color-text-blue': '#FFFFFF'}},
    });
    const concreteCss = generateOnMediaCSS(concrete);

    expect(concreteCss).toContain('--color-text-blue: #FFFFFF;');
    expect(concreteCss).not.toContain(
      '--color-text-info: var(--color-text-blue);',
    );

    const canonical = defineTheme({
      name: 'status-role-media-alias',
      tokens: {
        '--color-text-blue': '#0074E2',
        '--color-text-info': 'var(--color-text-blue)',
      },
      onDark: {
        tokens: {
          '--color-text-blue': '#FFFFFF',
        },
      },
    });
    const canonicalCss = generateOnMediaCSS(canonical);

    expect(canonicalCss).toContain('--color-text-blue: #FFFFFF;');
    expect(canonicalCss).toContain(
      '--color-text-info: var(--color-text-blue);',
    );
  });

  it.each([
    'VAR( /*x*/ --color-text-blue ) !important',
    'v\\61r(--color-text-blue)',
    'var( --color-text-blue )',
    'var(--color-text-blue) !important',
  ])('rebinds a semantically equivalent authored root alias: %s', info => {
    const theme = defineTheme({
      name: 'status-role-media-equivalent-alias',
      tokens: {
        '--color-text-blue': '#0074E2',
        '--color-text-info': info,
      },
      onDark: {
        tokens: {
          '--color-text-blue': '#FFFFFF',
        },
      },
    });

    expect(generateOnMediaCSS(theme)).toContain(
      '--color-text-info: var(--color-text-blue);',
    );
  });

  it('does not let a media alias override an adaptation-authored role', () => {
    const theme = defineTheme({
      name: 'status-role-media-adaptation',
      adaptations: {
        rules: [
          {
            when: {contrast: 'more'},
            value: {tokens: {'--color-text-info': '#123456'}},
          },
        ],
      },
      onDark: {
        tokens: {
          '--color-text-blue': '#FFFFFF',
        },
      },
    });
    const css = generateOnMediaCSS(theme);

    expect(css).toContain('--color-text-blue: #FFFFFF;');
    expect(css).toContain('--color-text-info: var(--color-text-blue);');
    expect(css).toContain('--color-text-info: inherit;');
    expect(css.lastIndexOf('--color-text-info: inherit;')).toBeGreaterThan(
      css.lastIndexOf('--color-text-info: var(--color-text-blue);'),
    );
  });

  it('inherits non-default adaptation roles instead of re-resolving them locally', () => {
    const theme = defineTheme({
      name: 'status-role-media-inherit',
      tokens: {'--color-text-purple': '#123456'},
      adaptations: {
        rules: [
          {
            when: {contrast: 'more'},
            value: {
              tokens: {'--color-text-info': 'var(--color-text-purple)'},
            },
          },
        ],
      },
      onDark: {
        tokens: {
          '--color-text-purple': '#ffffff',
          '--color-text-blue': '#ffffff',
        },
      },
    });
    const css = generateOnMediaCSS(theme);

    expect(css).toContain('--color-text-info: inherit;');
    expect(css).not.toContain('--color-text-info: var(--color-text-purple);');
  });

  it('avoids a descendant-local cycle while replaying an adaptation role', () => {
    const theme = defineTheme({
      name: 'status-role-media-replay-cycle',
      adaptations: {
        rules: [
          {
            when: {contrast: 'more'},
            value: {
              tokens: {'--color-text-info': 'var(--color-text-blue)'},
            },
          },
        ],
      },
      onDark: {tokens: {'--color-text-blue': 'var(--color-text-info)'}},
    });
    const css = generateOnMediaCSS(theme);
    const darkBlocks = Array.from(
      css.matchAll(/\[data-astryx-media="dark"\] \{([\s\S]*?)\n\s*\}/g),
      match => match[1],
    );

    expect(darkBlocks.length).toBeGreaterThan(0);
    for (const block of darkBlocks) {
      expect(block).not.toContain('--color-text-info: var(--color-text-blue);');
      expect(block).not.toContain('--color-text-info: var(--color-text-blue);');
    }
  });

  it('uses inheritance when multiple local role replays would form a cycle', () => {
    const theme = defineTheme({
      name: 'status-role-multi-replay-cycle',
      adaptations: {
        rules: [
          {
            when: {contrast: 'more'},
            value: {
              tokens: {
                '--color-text-info': 'var(--color-on-info-muted)',
                '--color-on-info-muted': 'var(--color-text-green)',
              },
            },
          },
        ],
      },
      onDark: {
        tokens: {
          '--color-text-blue': '#ffffff',
          '--color-text-green': 'var(--color-text-info)',
        },
      },
    });
    const css = generateOnMediaCSS(theme);
    const alias = '--color-on-info-muted: var(--color-text-blue);';
    const restoration = '--color-on-info-muted: inherit;';
    expect(css).toContain(alias);
    expect(css).toContain(restoration);
    expect(css.lastIndexOf(restoration)).toBeGreaterThan(
      css.lastIndexOf(alias),
    );
  });

  it('stringifies a legacy non-string media status source without throwing', () => {
    const theme = defineTheme({
      name: 'legacy-media-status-source',
      onDark: {tokens: {'--color-text-blue': null as never}},
    });

    expect(() => generateOnMediaCSS(theme)).not.toThrow();
    expect(generateOnMediaCSS(theme)).toContain('--color-text-blue: null;');
  });

  it('emits component override rules', () => {
    const theme = defineTheme({
      name: 'test',
      onDark: {
        components: {
          button: {
            'variant:secondary': {
              backgroundColor: 'color-mix(in srgb, white 20%, transparent)',
            },
          },
        },
      },
    });
    const css = generateOnMediaCSS(theme);
    expect(css).toContain(
      ':is([data-astryx-media="dark"]) :is(.astryx-button[data-variant="secondary"])',
    );
    expect(css).toContain(
      'background-color: color-mix(in srgb, white 20%, transparent)',
    );
  });

  it('emits pseudo-class rules for on-media components', () => {
    const theme = defineTheme({
      name: 'test',
      onDark: {
        components: {
          button: {
            base: {
              color: 'white',
              ':hover': {color: 'rgba(255,255,255,0.8)'},
            },
          },
        },
      },
    });
    const css = generateOnMediaCSS(theme);
    expect(css).toContain(
      ':is([data-astryx-media="dark"]) :is(.astryx-button):hover',
    );
    expect(css).toContain('color: rgba(255,255,255,0.8)');
  });
});

describe('reset.css baseline media rules', () => {
  /**
   * Validates that reset.css provides the minimum baseline for
   * MediaTheme: a color-scheme flip on [data-astryx-media].
   *
   * Token overrides (text-primary, icon-primary, accent) are a
   * theme-level concern — themes handle those via generateOnMediaCSS.
   */
  let resetCSS: string;

  beforeAll(async () => {
    const fs = await import('fs');
    const path = await import('path');
    resetCSS = fs.readFileSync(
      path.resolve(__dirname, '../reset.css'),
      'utf-8',
    );
  });

  it('flips color-scheme on [data-astryx-media="dark"]', () => {
    const darkMatch = resetCSS.match(
      /:where\(\[data-astryx-media="dark"\]\)\s*\{([^}]+)\}/,
    );
    expect(darkMatch).not.toBeNull();
    expect(darkMatch![1]).toContain('color-scheme: dark');
  });

  it('flips color-scheme on [data-astryx-media="light"]', () => {
    const lightMatch = resetCSS.match(
      /:where\(\[data-astryx-media="light"\]\)\s*\{([^}]+)\}/,
    );
    expect(lightMatch).not.toBeNull();
    expect(lightMatch![1]).toContain('color-scheme: light');
  });

  it('does NOT include token overrides at baseline level', () => {
    const darkMatch = resetCSS.match(
      /:where\(\[data-astryx-media="dark"\]\)\s*\{([^}]+)\}/,
    );
    expect(darkMatch![1]).not.toContain('--color-text-primary');
    expect(darkMatch![1]).not.toContain('--color-icon-primary');
    expect(darkMatch![1]).not.toContain('--color-accent');
  });
});
