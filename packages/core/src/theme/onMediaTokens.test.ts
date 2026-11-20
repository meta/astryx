// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, beforeAll} from 'vitest';
import {defineTheme} from './defineTheme';
import {generateOnMediaCSS} from './generateThemeRules';
import {
  defaultOnDarkTokens,
  defaultOnLightTokens,
  resolveOnMedia,
} from './onMediaTokens';

/**
 * Inverted surfaces that keep one side in both page modes, so a test about
 * other rules sees no dark-page scoping (INV21 has its own tests).
 */
const KEEPS_SIDE = {
  '--color-background-inverted': '#0a1317',
  '--color-background-error-inverted': '#a8071e',
};

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
      tokens: KEEPS_SIDE,
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
      tokens: KEEPS_SIDE,
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
      tokens: KEEPS_SIDE,
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

/** Declarations of each top-level media block, by surface. */
function mediaDeclarations(css: string, surface: 'dark' | 'light') {
  const declared: Record<string, string> = {};
  const unscoped = css.split(/\n@media /)[0];
  for (const match of unscoped.matchAll(
    new RegExp(`\\[data-astryx-media="${surface}"\\] \\{([^}]*)\\}`, 'g'),
  )) {
    for (const line of match[1].split(';')) {
      const colon = line.indexOf(':');
      if (colon > 0) {
        declared[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
      }
    }
  }
  return declared;
}

/**
 * The value a surface declares for `name` when exactly the media queries that
 * `matches` accepts apply: the last declaration in source order whose
 * enclosing queries all match.
 */
function surfaceValueWhen(
  css: string,
  surface: 'dark' | 'light',
  name: string,
  matches: (query: string) => boolean,
): string | undefined {
  const target = `[data-astryx-media="${surface}"]`;
  const queries: (string | null)[] = [];
  let value: string | undefined;
  let start = 0;
  for (let index = 0; index < css.length; index++) {
    const char = css[index];
    if (char === '{') {
      const prelude = css.slice(start, index).trim();
      if (prelude.startsWith('@media ')) {
        queries.push(prelude.slice('@media '.length));
      } else if (prelude.endsWith(target)) {
        const end = css.indexOf('}', index);
        const applies = queries.every(
          query => query === null || matches(query),
        );
        if (applies) {
          for (const line of css.slice(index + 1, end).split(';')) {
            const colon = line.indexOf(':');
            if (colon > 0 && line.slice(0, colon).trim() === name) {
              value = line.slice(colon + 1).trim();
            }
          }
        }
        index = end;
      } else {
        queries.push(null);
      }
      start = index + 1;
    } else if (char === '}') {
      queries.pop();
      start = index + 1;
    } else if (char === ';' && queries.length === 0) {
      start = index + 1;
    }
  }
  return value;
}

describe('generateOnMediaCSS scheme-dependent replays', () => {
  const theme = defineTheme({
    name: 'media-scheme-replay',
    tokens: {
      '--color-text-secondary': ['#555555', '#aaaaaa'],
      '--color-border': 'var(--color-text-secondary)',
      '--color-on-dark': '#ffffff',
      '--spacing-4': '16px',
    },
  });
  const css = generateOnMediaCSS(theme);

  it('re-declares each scheme-dependent root token with its root value', () => {
    for (const surface of ['dark', 'light'] as const) {
      const declared = mediaDeclarations(css, surface);
      expect(declared['--color-text-secondary']).toBe(
        theme.tokens['--color-text-secondary'],
      );
      expect(declared['--color-border']).toBe('var(--color-text-secondary)');
    }
  });

  it('declares secondary text and icon on each surface, so a value an app maps on the theme root does not reach it', () => {
    const mapped = defineTheme({
      name: 'media-scheme-replay-secondary',
      tokens: {
        '--color-text-secondary': ['#555555', '#aaaaaa'],
        '--color-icon-secondary': ['#666666', '#999999'],
      },
    });
    const mappedCss = generateOnMediaCSS(mapped);
    for (const surface of ['dark', 'light'] as const) {
      const declared = mediaDeclarations(mappedCss, surface);
      expect(declared['--color-text-secondary']).toBe(
        mapped.tokens['--color-text-secondary'],
      );
      expect(declared['--color-icon-secondary']).toBe(
        mapped.tokens['--color-icon-secondary'],
      );
    }
  });

  it('does not re-declare a token whose value ignores the scheme', () => {
    const declared = mediaDeclarations(css, 'dark');
    expect(declared).not.toHaveProperty('--spacing-4');
    expect(declared).not.toHaveProperty('--color-on-dark');
  });

  it('keeps the surface tokens over the root values', () => {
    expect(mediaDeclarations(css, 'dark')['--color-accent']).toBe(
      'var(--color-on-dark)',
    );
    expect(mediaDeclarations(css, 'light')['--color-text-primary']).toBe(
      'var(--color-on-light)',
    );
  });

  it("keeps the root's value for a reference to a token the surface declares", () => {
    const referring = defineTheme({
      name: 'media-scheme-replay-reference',
      tokens: {
        '--color-accent': ['#111111', '#eeeeee'],
        '--color-border-emphasized': 'var(--color-accent)',
      },
    });
    const declared = mediaDeclarations(generateOnMediaCSS(referring), 'dark');
    // The dark surface declares its own accent. Without lowering, the root
    // resolves the reference, so the surface shows the root's accent.
    expect(declared['--color-accent']).toBe('var(--color-on-dark)');
    expect(declared['--color-border-emphasized']).toBe(
      referring.tokens['--color-accent'],
    );
  });

  it('restates a reference under an adaptation that changes the surface token', () => {
    const adapted = defineTheme({
      name: 'media-scheme-replay-adapted-reference',
      tokens: {
        '--color-accent': ['#111111', '#eeeeee'],
        '--color-border-emphasized': 'var(--color-accent)',
      },
      adaptations: {
        rules: [
          {
            when: {contrast: 'more'},
            value: {tokens: {'--color-accent': '#ff0000'}},
          },
        ],
      },
    });
    const adaptedCss = generateOnMediaCSS(adapted);
    const query = adaptedCss.slice(adaptedCss.indexOf('\n@media '));
    // Without lowering, the root resolves the reference to the adapted accent
    // under the query, and the surface inherits that value.
    expect(query).toContain('--color-border-emphasized: #ff0000;');
  });

  it('does not re-declare a reference to a surface token the theme leaves unset', () => {
    const referring = defineTheme({
      name: 'media-scheme-replay-unset-reference',
      tokens: {'--color-border-emphasized': 'var(--color-accent)'},
    });
    // The accent comes from an ancestor theme or Core, so the surface keeps
    // inheriting the value the root resolved.
    expect(
      mediaDeclarations(generateOnMediaCSS(referring), 'dark'),
    ).not.toHaveProperty('--color-border-emphasized');
  });

  it('re-declares a token that an adaptation makes scheme-dependent', () => {
    const adapted = defineTheme({
      name: 'media-scheme-replay-adapted-dependence',
      tokens: {
        '--color-text-secondary': '#555555',
        '--color-border': 'var(--color-text-secondary)',
      },
      adaptations: {
        rules: [
          {
            when: {contrast: 'more'},
            value: {tokens: {'--color-text-secondary': ['#000000', '#ffffff']}},
          },
        ],
      },
    });
    const adaptedCss = generateOnMediaCSS(adapted);
    expect(mediaDeclarations(adaptedCss, 'dark')).not.toHaveProperty(
      '--color-border',
    );
    const query = adaptedCss.slice(adaptedCss.indexOf('\n@media '));
    expect(query).toContain('--color-border: var(--color-text-secondary);');
  });

  it('writes no core default the theme leaves unset', () => {
    expect(mediaDeclarations(css, 'dark')).not.toHaveProperty(
      '--color-background-surface',
    );
  });

  it('resolves a reference on a surface as the root does when two adaptation rules match', () => {
    const overlapping = defineTheme({
      name: 'media-scheme-replay-overlapping-rules',
      tokens: {
        '--color-accent': ['#111111', '#eeeeee'],
        '--color-border-emphasized': 'var(--color-text-secondary)',
        '--color-text-secondary': ['#555555', '#aaaaaa'],
      },
      adaptations: {
        rules: [
          {
            when: {contrast: 'more'},
            value: {tokens: {'--color-accent': '#ff0000'}},
          },
          {
            when: {width: {below: 'lg'}},
            value: {
              tokens: {'--color-border-emphasized': 'var(--color-accent)'},
            },
          },
        ],
      },
    });
    const overlappingCss = generateOnMediaCSS(overlapping);
    const contrast = (query: string) => query.includes('prefers-contrast');
    const narrow = (query: string) => query.includes('width');
    const valueWhen = (matches: (query: string) => boolean) =>
      surfaceValueWhen(
        overlappingCss,
        'dark',
        '--color-border-emphasized',
        matches,
      );
    // One rule alone: the surface re-declares the value the root resolves.
    expect(valueWhen(contrast)).toBe('var(--color-text-secondary)');
    expect(valueWhen(narrow)).toBe(overlapping.tokens['--color-accent']);
    // Both rules: the root resolves the reference to the first rule's accent.
    // The surface must not restate the base accent over it.
    expect(['inherit', '#ff0000']).toContain(
      valueWhen(query => contrast(query) || narrow(query)),
    );
  });

  it('does not re-declare a token that depends on the scheme only through a token the theme leaves unset', () => {
    const referring = defineTheme({
      name: 'media-scheme-replay-core-reference',
      tokens: {'--color-border-emphasized': 'var(--color-text-secondary)'},
    });
    // Core resolves the secondary text color on the page root, so a surface
    // re-declaration changes nothing after lowering. It only lets a value set
    // between the theme root and the surface reach the surface.
    expect(
      mediaDeclarations(generateOnMediaCSS(referring), 'dark'),
    ).not.toHaveProperty('--color-border-emphasized');
  });

  it("takes the theme's value for a reference to a token that ignores the scheme", () => {
    const mixed = defineTheme({
      name: 'media-scheme-replay-constant-reference',
      tokens: {
        '--color-text-secondary': ['#555555', '#aaaaaa'],
        '--color-background-muted': '#00ff00',
        '--color-border':
          'color-mix(in srgb, var(--color-text-secondary) 50%, var(--color-background-muted))',
      },
    });
    // The surface does not re-declare the muted background, so the theme's
    // value keeps the root's result for a value set between the root and the
    // surface. The secondary text stays a reference: the surface re-declares
    // it under its own scheme.
    for (const surface of ['dark', 'light'] as const) {
      const declared = mediaDeclarations(generateOnMediaCSS(mixed), surface);
      expect(declared).not.toHaveProperty('--color-background-muted');
      expect(declared['--color-border']).toBe(
        'color-mix(in srgb, var(--color-text-secondary) 50%, #00ff00)',
      );
    }
  });

  it("refers to the theme root's alias of a token the theme leaves unset", () => {
    const coreMixed = defineTheme({
      name: 'media-scheme-replay-core-mix',
      tokens: {
        '--color-text-secondary': ['#555555', '#aaaaaa'],
        '--color-border':
          'color-mix(in srgb, var(--color-text-secondary) 50%, var(--color-background-muted))',
      },
    });
    const css = generateOnMediaCSS(coreMixed);
    // The theme root resolves the alias, as it resolves the token for every
    // other descendant, so a value set between the root and the surface does
    // not reach the surface.
    expect(css).toContain(
      '--_theme-root-color-background-muted: var(--color-background-muted);',
    );
    for (const surface of ['dark', 'light'] as const) {
      const declared = mediaDeclarations(css, surface);
      expect(declared['--color-border']).toBe(
        'color-mix(in srgb, var(--color-text-secondary) 50%, var(--_theme-root-color-background-muted))',
      );
      expect(declared).not.toHaveProperty(
        '--_theme-root-color-background-muted',
      );
    }
  });

  it("refers to the root's alias of a theme token the surface cannot re-declare", () => {
    const chained = defineTheme({
      name: 'media-scheme-replay-chain',
      tokens: {
        '--color-text-secondary': ['#555555', '#aaaaaa'],
        // Refers to the surface's own accent, which the theme leaves unset, so
        // the surface does not re-declare it.
        '--color-border-emphasized':
          'color-mix(in srgb, var(--color-text-secondary) 50%, var(--color-accent))',
        '--color-border': 'var(--color-border-emphasized)',
      },
    });
    const css = generateOnMediaCSS(chained);
    expect(css).toContain(
      '--_theme-root-color-border-emphasized: var(--color-border-emphasized);',
    );
    for (const surface of ['dark', 'light'] as const) {
      const declared = mediaDeclarations(css, surface);
      expect(declared).not.toHaveProperty('--color-border-emphasized');
      expect(declared['--color-border']).toBe(
        'var(--_theme-root-color-border-emphasized)',
      );
    }
  });

  it('aliases a reference however its var() call is spelled', () => {
    for (const call of [
      'var( --color-background-muted)',
      'VAR(--color-background-muted)',
    ]) {
      const spelled = defineTheme({
        name: 'media-scheme-replay-alias-spelling',
        tokens: {
          '--color-text-secondary': ['#555555', '#aaaaaa'],
          '--color-border': `color-mix(in srgb, var(--color-text-secondary) 50%, ${call})`,
        },
      });
      const css = generateOnMediaCSS(spelled);
      expect(css).toContain(
        '--_theme-root-color-background-muted: var(--color-background-muted);',
      );
      expect(mediaDeclarations(css, 'dark')['--color-border']).toBe(
        'color-mix(in srgb, var(--color-text-secondary) 50%, var(--_theme-root-color-background-muted))',
      );
    }
  });

  it('aliases references to a token a rule makes the surface inherit', () => {
    const inheriting = defineTheme({
      name: 'media-scheme-replay-rule-inherit',
      tokens: {
        '--color-border-emphasized': ['#111111', '#eeeeee'],
        '--color-border':
          'color-mix(in srgb, var(--color-border-emphasized) 50%, #ffffff)',
      },
      adaptations: {
        rules: [
          {
            when: {width: {below: 'lg'}},
            // The surface's own accent is unset in the theme, so under this
            // rule the surface cannot re-declare the emphasized border.
            value: {
              tokens: {'--color-border-emphasized': 'var(--color-accent)'},
            },
          },
        ],
      },
    });
    const css = generateOnMediaCSS(inheriting);
    const narrow = (query: string) => query.includes('width');
    expect(
      surfaceValueWhen(css, 'dark', '--color-border-emphasized', narrow),
    ).toBe('inherit');
    expect(surfaceValueWhen(css, 'dark', '--color-border', narrow)).toBe(
      'color-mix(in srgb, var(--_theme-root-color-border-emphasized) 50%, #ffffff)',
    );
    expect(surfaceValueWhen(css, 'dark', '--color-border', () => false)).toBe(
      'color-mix(in srgb, var(--color-border-emphasized) 50%, #ffffff)',
    );
  });

  it('aliases references to a token two overlapping rules make the surface inherit', () => {
    const overlapping = defineTheme({
      name: 'media-scheme-replay-overlap-inherit',
      tokens: {
        '--color-accent': ['#111111', '#eeeeee'],
        '--color-border-emphasized': 'var(--color-text-secondary)',
        '--color-text-secondary': ['#555555', '#aaaaaa'],
        '--color-border': 'var(--color-border-emphasized)',
      },
      adaptations: {
        rules: [
          {
            when: {contrast: 'more'},
            value: {tokens: {'--color-accent': '#ff0000'}},
          },
          {
            when: {width: {below: 'lg'}},
            value: {
              tokens: {'--color-border-emphasized': 'var(--color-accent)'},
            },
          },
        ],
      },
    });
    const css = generateOnMediaCSS(overlapping);
    const both = (query: string) =>
      query.includes('prefers-contrast') || query.includes('width');
    const emphasized = surfaceValueWhen(
      css,
      'dark',
      '--color-border-emphasized',
      both,
    );
    expect(emphasized).toBe('inherit');
    expect(surfaceValueWhen(css, 'dark', '--color-border', both)).toBe(
      'var(--_theme-root-color-border-emphasized)',
    );
  });

  it("keeps a reference's fallback on the root alias", () => {
    const withFallback = defineTheme({
      name: 'media-scheme-replay-alias-fallback',
      tokens: {
        '--color-text-secondary': ['#555555', '#aaaaaa'],
        '--color-border':
          'color-mix(in srgb, var(--color-text-secondary) 50%, var(--brand-muted, #00c000))',
      },
    });
    const css = generateOnMediaCSS(withFallback);
    expect(css).toContain('--_theme-root-brand-muted: var(--brand-muted);');
    // Where the token is unset, the root alias is invalid and the surface
    // takes the same fallback the root takes.
    for (const surface of ['dark', 'light'] as const) {
      expect(mediaDeclarations(css, surface)['--color-border']).toBe(
        'color-mix(in srgb, var(--color-text-secondary) 50%, var(--_theme-root-brand-muted, #00c000))',
      );
    }
  });

  it('declares no root alias for a theme whose surface values refer only to its own tokens', () => {
    const own = defineTheme({
      name: 'media-scheme-replay-own-mix',
      tokens: {
        '--color-text-secondary': ['#555555', '#aaaaaa'],
        '--color-background-muted': '#00ff00',
        '--color-border':
          'color-mix(in srgb, var(--color-text-secondary) 50%, var(--color-background-muted))',
      },
    });
    expect(generateOnMediaCSS(own)).not.toContain('--_theme-root-');
  });

  it('restates an adaptation value over the base replay under its query', () => {
    const adapted = defineTheme({
      name: 'media-scheme-replay-adapted',
      tokens: {'--color-text-secondary': ['#555555', '#aaaaaa']},
      adaptations: {
        rules: [
          {
            when: {contrast: 'more'},
            value: {tokens: {'--color-text-secondary': '#000000'}},
          },
        ],
      },
    });
    const adaptedCss = generateOnMediaCSS(adapted);
    const query = adaptedCss.slice(adaptedCss.indexOf('\n@media '));
    expect(query).toContain('--color-text-secondary: #000000;');
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

describe('generateOnMediaCSS restatements on a surface a dark page flips', () => {
  // An inverted fill, dark on a light page and light on a dark page, flips a
  // toast card: the card names the dark side for a light page and takes the
  // light side on a dark page. The light side holds its own border; the dark
  // side re-declares the border, and a rule changes the accent it reads.
  const flipping = defineTheme({
    name: 'media-scheme-replay-flip',
    tokens: {
      '--color-background-inverted': ['#0a1317', '#f4f0e8'],
      '--color-on-dark': ['#ffffff', '#ffffff'],
      '--color-on-light': ['#111111', '#111111'],
      '--color-accent': ['#111111', '#eeeeee'],
      '--color-border-emphasized': 'var(--color-accent)',
      '--color-border': 'var(--color-accent)',
    },
    onLight: {tokens: {'--color-border-emphasized': '#333333'}},
    adaptations: {
      rules: [
        {
          when: {contrast: 'more'},
          value: {tokens: {'--color-accent': '#ff0000'}},
        },
      ],
    },
  });
  const css = generateOnMediaCSS(flipping);
  const query = css.slice(css.indexOf('\n@media '));
  const rulesWith = (declaration: string) =>
    [...query.matchAll(/([^{};]+)\{([^{}]*)\}/g)]
      .filter(match => match[2].includes(declaration))
      .map(match => match[1].trim());

  it("keeps the light side's own border on a card a dark page flips to light", () => {
    // The dark side restates the border under the rule, on a selector that
    // also matches the flipped card. Its light dark-page copy, written later,
    // restores the light side's own value there.
    const rules = [...query.matchAll(/([^{};]+)\{([^{}]*)\}/g)];
    const darkRestated = rules.findIndex(
      match =>
        match[1].trim() === '[data-astryx-media="dark"]' &&
        match[2].includes('--color-border-emphasized: #ff0000;'),
    );
    const lightKept = rules.findIndex(
      match =>
        match[1].includes('[data-astryx-media-dark-page="light"]') &&
        match[2].includes('--color-border-emphasized: #333333;'),
    );
    expect(darkRestated).toBeGreaterThanOrEqual(0);
    expect(lightKept).toBeGreaterThan(darkRestated);
  });

  it('restates a value both sides re-declare on the card a dark page flips', () => {
    expect(
      rulesWith('--color-border: #ff0000;').some(selector =>
        selector.includes('[data-astryx-media-dark-page="light"]'),
      ),
    ).toBe(true);
  });
});

describe('generateOnMediaCSS restatements only the other side writes on a flipped card', () => {
  // The dark side holds the emphasized border and restates the muted fill
  // under the rule; the light side holds the plain border and restates
  // nothing. On a dark page the flipped card shows the light side, so its
  // dark-page copy writes the light side's value for the muted fill.
  const theme = defineTheme({
    name: 'media-scheme-replay-flip-other',
    tokens: {
      '--color-background-inverted': ['#0a1317', '#f4f0e8'],
      '--color-on-dark': ['#ffffff', '#ffffff'],
      '--color-on-light': ['#111111', '#111111'],
      '--color-border-emphasized': ['#777777', '#888888'],
      '--color-border': ['#999999', '#666666'],
      '--color-background-muted':
        'color-mix(in srgb, var(--color-border-emphasized) 50%, var(--color-border))',
    },
    onDark: {tokens: {'--color-border-emphasized': '#cccccc'}},
    onLight: {tokens: {'--color-border': '#333333'}},
    adaptations: {
      rules: [
        {
          when: {width: {below: 'lg'}},
          value: {
            tokens: {
              '--color-border-emphasized': 'light-dark(#ff0000, #aa0000)',
            },
          },
        },
      ],
    },
  });
  const css = generateOnMediaCSS(theme);
  const query = css.slice(css.indexOf('\n@media '));
  const rules = [...query.matchAll(/([^{};]+)\{([^{}]*)\}/g)];

  it("restores the light side's muted fill on a card a dark page flips to light", () => {
    const darkRestated = rules.findIndex(
      match =>
        match[1].trim() === '[data-astryx-media="dark"]' &&
        match[2].includes('--color-background-muted:'),
    );
    const lightCopy = rules.findIndex(
      match =>
        match[1].includes('[data-astryx-media-dark-page="light"]') &&
        match[2].includes('--color-background-muted:'),
    );
    expect(darkRestated).toBeGreaterThanOrEqual(0);
    expect(lightCopy).toBeGreaterThan(darkRestated);
  });
});

describe('generateOnMediaCSS reads light-dark() and var() names in any spelling', () => {
  it('re-declares a token whose value writes LIGHT-DARK() in capitals', () => {
    const css = generateOnMediaCSS(
      defineTheme({
        name: 'media-scheme-replay-case',
        tokens: {'--color-text-secondary': 'LIGHT-DARK(#555555, #aaaaaa)'},
      }),
    );
    expect(mediaDeclarations(css, 'dark')['--color-text-secondary']).toBe(
      'LIGHT-DARK(#555555, #aaaaaa)',
    );
  });

  it('refers to the root alias of a token a value names with a CSS escape', () => {
    // `\65 ` is `e`, so the reference names --color-background-muted, a Core
    // default the theme leaves unset.
    const css = generateOnMediaCSS(
      defineTheme({
        name: 'media-scheme-replay-escape',
        tokens: {
          '--color-text-secondary': ['#555555', '#aaaaaa'],
          '--color-border':
            'color-mix(in srgb, var(--color-text-secondary) 50%, var(--color-background-mut\\65 d))',
        },
      }),
    );
    const border = mediaDeclarations(css, 'dark')['--color-border'];
    expect(border).toContain('var(--_theme-root-color-background-muted)');
    expect(css).toContain('--_theme-root-color-background-muted:');
  });
});

describe('generateOnMediaCSS overlapping rules on a card a dark page flips', () => {
  // Two width rules match together. One changes the emphasized border, which
  // the dark side holds; the other makes the plain border refer to it. On a
  // dark page the flipped card shows the light side, so the overlap block's
  // light copy writes the light side's border under both rules, not its base.
  const theme = defineTheme({
    name: 'media-scheme-replay-flip-overlap',
    tokens: {
      '--color-background-inverted': ['#0a1317', '#f4f0e8'],
      '--color-on-dark': ['#ffffff', '#ffffff'],
      '--color-on-light': ['#111111', '#111111'],
      '--color-border-emphasized': ['#777777', '#888888'],
      '--color-border': ['#123456', '#456789'],
    },
    onDark: {tokens: {'--color-border-emphasized': '#cccccc'}},
    adaptations: {
      rules: [
        {
          when: {width: {below: 'xl'}},
          value: {
            tokens: {
              '--color-border-emphasized': 'light-dark(#ff0000, #aa0000)',
            },
          },
        },
        {
          when: {width: {below: 'lg'}},
          value: {tokens: {'--color-border': 'var(--color-border-emphasized)'}},
        },
      ],
    },
  });
  const css = generateOnMediaCSS(theme);

  it("writes the light side's border under both rules, not its base", () => {
    const nested = css.slice(css.lastIndexOf('\n@media (width < 1280px) {'));
    const lightCopies = [...nested.matchAll(/([^{};]+)\{([^{}]*)\}/g)].filter(
      match => match[1].includes('[data-astryx-media-dark-page="light"]'),
    );
    const borders = lightCopies.flatMap(
      match => /--color-border:\s*([^;]+);/.exec(match[2])?.slice(1, 2) ?? [],
    );
    expect(borders.length).toBeGreaterThan(0);
    for (const value of borders) {
      expect(value.trim()).not.toBe('light-dark(#123456, #456789)');
    }
  });
});
