// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, expectTypeOf, vi} from 'vitest';
import type {IconRegistry} from '../Icon/globalIconRegistry';
import type {
  DefinedTheme,
  DefineThemeInput,
  ResolvedDefinedTheme,
} from './defineTheme';
import {
  defineTheme,
  generateThemeCSS,
  generateThemeRules,
  isDefinedTheme,
} from './defineTheme';
import {resolveThemeToken} from './tokens';

function generateThemeTestCSS(theme: Parameters<typeof generateThemeCSS>[0]) {
  const {prose, component} = generateThemeCSS(theme);
  return [prose, component].filter(Boolean).join('\n\n');
}
describe('defineTheme', () => {
  it('creates a theme with name', () => {
    const theme = defineTheme({name: 'test'});
    expect(theme.name).toBe('test');
  });

  it('stores only authored token overrides while CSS scopes derived role defaults', () => {
    const theme = defineTheme({
      name: 'custom',
      tokens: {
        '--color-text-blue': '#CC0000',
      },
    });
    expect(theme.tokens['--color-text-blue']).toBe('#CC0000');
    expect(theme.tokens['--color-text-info']).toBeUndefined();
    expect(generateThemeTestCSS(theme)).toContain(
      '--color-text-info: var(--color-text-blue);',
    );
    // Unrelated defaults remain owned by StyleX rather than copied into every
    // theme scope.
    expect(theme.tokens['--color-background-surface']).toBeUndefined();
  });

  it('keeps an explicit semantic role above its scoped default', () => {
    const theme = defineTheme({
      name: 'custom-info',
      tokens: {
        '--color-text-blue': '#FF0000',
        '--color-text-info': '#0066CC',
      },
    });

    expect(theme.tokens['--color-text-info']).toBe('#0066CC');
  });

  it('does not generate a status alias that would create a token cycle', () => {
    const theme = defineTheme({
      name: 'parent-role-reference',
      tokens: {'--color-text-blue': 'var(--color-text-info)'},
    });
    const css = generateThemeRules(theme).join('\n');

    expect(css).toContain('--color-text-blue: var(--color-text-info);');
    expect(css).not.toContain('--color-text-info: var(--color-text-blue);');
  });

  it('checks the complete generated alias graph for cycles', () => {
    const theme = defineTheme({
      name: 'generated-role-cycle',
      tokens: {
        '--color-text-blue': 'var(--color-text-success)',
        '--color-text-green': 'var(--color-text-info)',
      },
    });
    const css = generateThemeRules(theme).join('\n');

    // The first alias is safe; the second would close a loop through it.
    expect(css).toContain('--color-text-info: var(--color-text-blue);');
    expect(css).not.toContain('--color-text-success: var(--color-text-green);');
  });

  it('includes theme-local references in generated alias cycle checks', () => {
    const css = generateThemeRules({
      tokens: {'--color-text-blue': 'var(--local-info-loop)'},
      localTokens: {'--local-info-loop': 'var(--color-text-info)'},
    }).join('\n');

    expect(css).not.toContain('--color-text-info: var(--color-text-blue);');
  });

  it.each([null, 16, false])(
    'stringifies a legacy non-string status source without throwing (%s)',
    value => {
      const theme = defineTheme({
        name: `legacy-status-source-${String(value)}`,
        tokens: {'--color-text-blue': value as never},
      });

      expect(() => generateThemeRules(theme)).not.toThrow();
      expect(generateThemeRules(theme).join('\n')).toContain(
        `--color-text-blue: ${String(value)};`,
      );
    },
  );

  it('preserves JavaScript string coercion for legacy object token values', () => {
    const value = {toString: () => '#123456'};
    const theme = defineTheme({
      name: 'legacy-object-status-source',
      tokens: {'--color-text-blue': value as never},
    });

    expect(generateThemeRules(theme).join('\n')).toContain(
      '--color-text-blue: #123456;',
    );
  });

  it.each([
    ['uppercase VAR()', 'VAR(--color-text-info)', undefined],
    ['mixed-case var()', 'vAr(--color-text-info)', undefined],
    ['escaped identifier', 'var(--\\63 olor-text-info)', undefined],
    ['escaped function name', 'v\\61r(--color-text-info)', undefined],
    ['escaped leading hyphens', 'var(\\2d\\2d color-text-info)', undefined],
    [
      'comment-separated identifier',
      'var(/*ok*/ --color-text-info)',
      undefined,
    ],
    [
      'non-ASCII local token',
      'var(--品牌)',
      {'--品牌': 'var(--color-text-info)'},
    ],
  ])(
    'recognizes %s while checking generated alias cycles',
    (_, accent, localTokens) => {
      const css = generateThemeRules({
        tokens: {'--color-text-blue': accent},
        localTokens,
      }).join('\n');

      expect(css).not.toContain('--color-text-info: var(--color-text-blue);');
    },
  );

  it('canonicalizes escaped declaration keys while checking cycles', () => {
    const css = generateThemeRules({
      tokens: {'--color-text-blue': 'var(--\\62 rand)'},
      localTokens: {'--\\62 rand': 'var(--color-text-info)'},
    }).join('\n');

    expect(css).not.toContain('--color-text-info: var(--color-text-blue);');
  });

  it('ignores var() text inside CSS comments', () => {
    const css = generateThemeRules({
      tokens: {'--color-text-blue': '#123456 /* var(--color-text-info) */'},
    }).join('\n');

    expect(css).toContain('--color-text-info: var(--color-text-blue);');
  });

  it.each([
    ['escaped space', '--x\\ y'],
    ['escaped backslash', '--x\\\\y'],
  ])('canonicalizes an %s declaration key exactly once', (_, localToken) => {
    const css = generateThemeRules({
      tokens: {'--color-text-blue': `var(${localToken})`},
      localTokens: {[localToken]: 'var(--color-text-info)'},
    }).join('\n');

    expect(css).not.toContain('--color-text-info: var(--color-text-blue);');
  });

  it.each([
    ['CRLF-preprocessed escape', 'v\\61\r\nr(--color-text-info)', undefined],
    ['surrogate escape', 'var(--\\d800)', {'--�': 'var(--color-text-info)'}],
    ['NUL replacement', 'var(--\0)', {'--�': 'var(--color-text-info)'}],
  ])('uses browser preprocessing for %s', (_, accent, localTokens) => {
    const css = generateThemeRules({
      tokens: {'--color-text-blue': accent},
      localTokens,
    }).join('\n');

    expect(css).not.toContain('--color-text-info: var(--color-text-blue);');
  });

  it.each(['var (--color-text-info)', 'var/**/(--color-text-info)'])(
    'does not treat non-function text as a reference: %s',
    accent => {
      const css = generateThemeRules({
        tokens: {'--color-text-blue': accent},
      }).join('\n');
      expect(css).toContain('--color-text-info: var(--color-text-blue);');
    },
  );

  it.each([
    'var(--color-text-red, #var(--color-text-info))',
    '1var(--color-text-info)',
    '@var(--color-text-info)',
  ])(
    'does not create references inside non-function CSS tokens: %s',
    accent => {
      const css = generateThemeRules({
        tokens: {
          '--color-text-blue': accent,
          '--color-text-red': '#123456',
        },
      }).join('\n');

      expect(css).toContain('--color-text-info: var(--color-text-blue);');
    },
  );

  it('does not let unquoted URL contents hide a following var() reference', () => {
    const css = generateThemeRules({
      tokens: {
        '--color-text-blue': 'url(/*) var(--color-text-info) /* */',
      },
    }).join('\n');

    expect(css).not.toContain('--color-text-info: var(--color-text-blue);');
  });

  it('ignores pre-existing unrelated legacy cycles', () => {
    const css = generateThemeRules({
      tokens: {
        '--color-text-blue': '#123456',
        '--color-background-body': 'var(--color-background-surface)',
        '--color-background-surface': 'var(--color-background-body)',
      },
    }).join('\n');

    expect(css).toContain('--color-text-info: var(--color-text-blue);');
  });

  it('handles long runs of adjacent comments without recursion', () => {
    const comments = '/**/'.repeat(10_000);
    expect(() =>
      generateThemeRules({
        tokens: {'--color-text-blue': `#123456 ${comments}`},
      }),
    ).not.toThrow();
  });

  it('handles a very wide reference list without argument spreading', () => {
    const references = 'var(--wide-target) '.repeat(200_000);
    expect(() =>
      generateThemeRules({
        tokens: {'--color-text-blue': references},
        localTokens: {'--wide-target': '#123456'},
      }),
    ).not.toThrow();
  });

  it('checks a reconverging token graph in linear time', () => {
    const localTokens: Record<string, string> = {};
    for (let layer = 0; layer < 26; layer++) {
      const next = layer + 1;
      const value =
        layer === 25
          ? '#ffffff'
          : `var(--layer-${next}-a, var(--layer-${next}-b))`;
      localTokens[`--layer-${layer}-a`] = value;
      localTokens[`--layer-${layer}-b`] = value;
    }
    const started = performance.now();
    generateThemeRules({
      tokens: {'--color-text-blue': 'var(--layer-0-a)'},
      localTokens,
    });

    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('emits every source-derived status role without counting it as authored', () => {
    const theme = defineTheme({
      name: 'custom-status-sources',
      tokens: {
        '--color-text-blue': '#200001',
        '--color-text-green': '#200002',
        '--color-text-yellow': '#200003',
        '--color-text-red': '#200004',
      },
    });
    const css = generateThemeTestCSS(theme);

    expect(theme.tokens['--color-text-info']).toBeUndefined();
    for (const declaration of [
      '--color-text-info: var(--color-text-blue);',
      '--color-text-success: var(--color-text-green);',
      '--color-text-warning: var(--color-text-yellow);',
      '--color-text-error: var(--color-text-red);',
      '--color-on-info-muted: var(--color-text-blue);',
      '--color-on-success-muted: var(--color-text-green);',
      '--color-on-warning-muted: var(--color-text-yellow);',
      '--color-on-error-muted: var(--color-text-red);',
    ]) {
      expect(css).toContain(declaration);
    }
    for (const role of ['icon', 'border']) {
      expect(css).toContain(`--color-${role}-info: var(--color-text-info);`);
    }
  });

  it('derives the content on a status fill the theme sets (INV17)', () => {
    const theme = defineTheme({
      name: 'bright-error',
      tokens: {'--color-error': '#FF0000'},
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('--color-error: #FF0000;');
    expect(css).toMatch(
      /--color-on-error: light-dark\(#[0-9A-F]{6}, #[0-9A-F]{6}\)/,
    );
  });

  it('converts [light, dark] tuples to light-dark()', () => {
    const theme = defineTheme({
      name: 'tuple-test',
      tokens: {
        '--color-accent': ['#0077B6', '#48CAE4'],
      },
    });
    expect(theme.tokens['--color-accent']).toBe('light-dark(#0077B6, #48CAE4)');
    expect(theme.tokens['--color-accent']).toBe('light-dark(#0077B6, #48CAE4)');
  });

  it('passes through string values as-is', () => {
    const theme = defineTheme({
      name: 'string-test',
      tokens: {
        '--radius-container': '16px',
      },
    });
    expect(theme.tokens['--radius-container']).toBe('16px');
  });

  it('mixes tuples and strings', () => {
    const theme = defineTheme({
      name: 'mixed',
      tokens: {
        '--color-accent': ['#0077B6', '#48CAE4'],
        '--radius-container': '16px',
        '--font-family-heading': '"Georgia", serif',
      },
    });
    expect(theme.tokens['--color-accent']).toBe('light-dark(#0077B6, #48CAE4)');
    expect(theme.tokens['--radius-container']).toBe('16px');
    expect(theme.tokens['--font-family-heading']).toBe('"Georgia", serif');
  });

  it('accepts unknown token names without warning (types provide guardrails)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const theme = defineTheme({
      name: 'custom',
      tokens: {
        // @ts-expect-error testing unknown token
        '--color-does-not-exist': '#FF0000',
      },
    });
    // No runtime warning — TypeScript catches typos at compile time
    expect(warn).not.toHaveBeenCalled();
    // But the token is still set (themes are just CSS custom properties)
    expect(theme.tokens['--color-does-not-exist']).toBe('#FF0000');
    warn.mockRestore();
  });

  it.each([
    ['ocean-theme', '--ac-selection-ink'],
    ['Theme.Owner', '--'],
    ['ocean-theme', '--astryx-theme-ocean-theme-color-status-fill-accent'],
  ])(
    'accepts valid local token name %s / %s and preserves its exact bytes',
    (themeName, token) => {
      const theme = defineTheme({
        name: themeName,
        localTokens: {[token]: ['#0077b6', '#48cae4']},
        components: {
          badge: {
            'variant:info': {backgroundColor: `var(${token})`},
          },
        },
      });

      expect(theme.tokens).not.toHaveProperty(token);
      expect(theme.localTokens).toEqual({
        [token]: 'light-dark(#0077b6, #48cae4)',
      });
      expect(theme.__localTokenOwners).toEqual({[token]: themeName});
      expect(theme.__localTokenLineage).toEqual([themeName]);
      expect(generateThemeTestCSS(theme)).toContain(
        `${token}: light-dark(#0077b6, #48cae4);`,
      );
    },
  );

  it('rejects a name declared in both tokens and localTokens before CSS and token helpers can disagree', () => {
    const token = '--astryx-theme-ocean-theme-color-status-fill-accent';
    const legacyTheme = defineTheme({
      name: 'ocean-theme',
      tokens: {
        // @ts-expect-error legacy tokens remain permissive at runtime
        [token]: '#0077b6',
      },
    });

    expect(generateThemeTestCSS(legacyTheme)).toContain(`${token}: #0077b6;`);
    expect(resolveThemeToken(legacyTheme, token, {mode: 'light'})).toBe(
      '#0077b6',
    );

    expect(() =>
      defineTheme({
        name: 'ocean-theme',
        tokens: {
          // @ts-expect-error legacy tokens remain permissive at runtime
          [token]: '#0077b6',
        },
        localTokens: {
          [token]: '#48cae4',
        },
      }),
    ).toThrow(/both tokens and localTokens/);

    expect(() =>
      defineTheme({
        name: 'ocean-theme',
        localTokens: {'--color-accent': '#48cae4'},
      }),
    ).toThrow(/both tokens and localTokens/);
  });

  it('does not reinterpret unenrolled custom-property references', () => {
    const theme = defineTheme({
      name: 'legacy',
      tokens: {
        // @ts-expect-error legacy permissive token input remains unchanged
        '--astryx-theme-legacy-color-old': '#123456',
      },
      components: {
        badge: {
          base: {color: 'var(--astryx-theme-missing-color-old)'},
        },
      },
    });

    expect(theme.tokens['--astryx-theme-legacy-color-old']).toBe('#123456');
    expect(theme).not.toHaveProperty('localTokens');
    expect(theme).not.toHaveProperty('__localTokenOwners');
    expect(theme).not.toHaveProperty('__localTokenLineage');
  });

  it('rejects an invalid CSS custom-property name', () => {
    expect(() =>
      defineTheme({
        name: 'ocean',
        localTokens: {'selection-ink': '#123456'},
      }),
    ).toThrow(/valid CSS custom-property name/);
  });

  it('treats case-only and unrelated custom-property references as external', () => {
    expect(() =>
      defineTheme({
        name: 'ocean',
        localTokens: {'--Selection-Ink': '#123456'},
        components: {
          button: {
            base: {
              color: 'var(--selection-ink)',
              backgroundColor: 'var(--product-surface)',
            },
          },
        },
      }),
    ).not.toThrow();
  });

  it.each(['VAR', 'vAr'])(
    'rejects cycles between local tokens using %s()',
    functionName => {
      const escaped = '--\\66 oo';
      const other = '--astryx-theme-cycle-color-b';
      expect(() =>
        defineTheme({
          name: 'cycle',
          localTokens: {
            [escaped]: `${functionName}(${other})`,
            [other]: `${functionName}(${escaped})`,
          },
        }),
      ).toThrow(/cycle detected/);
    },
  );

  it('includes icons in the theme', () => {
    const icons = {close: 'X'} as Partial<IconRegistry>;
    const theme = defineTheme({name: 'icons', icons});
    expect(theme.icons).toBe(icons);
  });

  it('reads function icon entries at md in the public icons view', () => {
    const info = vi.fn(({size}: {size: string}) => `info-${size}`);
    const theme = defineTheme({
      name: 'fn-icons',
      icons: {info, close: 'X', menu: null},
    });

    expect(theme.icons).toEqual({info: 'info-md', close: 'X', menu: null});
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith({size: 'md'});
  });

  it('works with no tokens', () => {
    const theme = defineTheme({name: 'bare'});
    expect(Object.keys(theme.tokens)).toHaveLength(0);
  });
});

describe('generateThemeCSS', () => {
  it('generates CSS with only overrides', () => {
    const theme = defineTheme({
      name: 'ocean',
      tokens: {
        '--color-accent': ['#0077B6', '#48CAE4'],
        '--radius-container': '16px',
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('@scope');
    expect(css).toContain('--color-accent: light-dark(#0077B6, #48CAE4)');
    expect(css).toContain('--radius-container: 16px');
    // :scope should NOT contain non-overridden tokens
    expect(css).not.toContain('--color-background-surface:');
  });

  it('includes prose rules even with no overrides', () => {
    const theme = defineTheme({name: 'empty'});
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('@scope');
    expect(css).toContain(':where(h1, h2, h3, h4, h5, h6)');
    expect(css).toContain('font-family: var(--font-family-heading)');
  });

  it('keeps the data palette out of a theme that never mentions it', () => {
    // Canonical defaults come from the public StyleX dataVars group, so a
    // theme that never authors data colors has nothing to serialize.
    const {component} = generateThemeCSS(defineTheme({name: 'chartless'}));
    expect(component).not.toContain('--color-data-');
  });

  it('puts only the named data token in the theme block, not its siblings', () => {
    const theme = defineTheme({
      name: 'brand-charts',
      tokens: {'--color-data-categorical-blue': '#00A3FF'},
    });
    const {component} = generateThemeCSS(theme);
    expect(component).toContain('--color-data-categorical-blue: #00A3FF;');
    // Leaving the siblings out of the theme's own block is what lets a nested
    // theme inherit a parent's override instead of shadowing it.
    expect(component).not.toContain('--color-data-categorical-orange');
    // Defaults reach compiled consumer CSS without entering the theme's own
    // tokens, which are what `astryx theme build` reports as overrides.
    expect(theme.tokens['--color-data-categorical-orange']).toBeUndefined();
  });

  it('splits prose into reset layer and components into astryx-theme', () => {
    const theme = defineTheme({
      name: 'split-test',
      components: {
        button: {'variant:secondary': {backgroundColor: 'red'}},
      },
    });
    const {prose, component} = generateThemeCSS(theme);
    // Prose block should contain element defaults
    expect(prose).toContain(':where(p)');
    expect(prose).toContain(':where(h1, h2, h3, h4, h5, h6)');
    expect(prose).toContain('@scope');
    // Prose should NOT contain component overrides
    expect(prose).not.toContain('.astryx-button');
    // Component block should contain overrides
    expect(component).toContain('.astryx-button');
    expect(component).toContain('@scope');
    // Component should NOT contain prose element rules
    expect(component).not.toContain(':where(p)');
  });
});

describe('isDefinedTheme', () => {
  it('returns true for defineTheme output', () => {
    const theme = defineTheme({name: 'test'});
    expect(isDefinedTheme(theme)).toBe(true);
  });

  it('returns false for legacy theme objects', () => {
    const legacy = {name: 'old', styles: {}, icons: undefined};
    expect(isDefinedTheme(legacy)).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isDefinedTheme(null)).toBe(false);
    expect(isDefinedTheme(undefined)).toBe(false);
  });
});

describe('component overrides', () => {
  it('passes components through to the theme', () => {
    const theme = defineTheme({
      name: 'styled',
      components: {
        card: {
          base: {borderWidth: '2px', borderColor: 'var(--color-accent)'},
        },
        button: {
          base: {borderRadius: '999px'},
        },
      },
    });
    expect(theme.components?.card?.base).toEqual({
      borderWidth: '2px',
      borderColor: 'var(--color-accent)',
    });
    expect(theme.components?.button?.base).toEqual({borderRadius: '999px'});
  });
});

describe('generateThemeCSS with components', () => {
  it('generates scoped CSS for base component overrides', () => {
    const theme = defineTheme({
      name: 'ocean',
      tokens: {
        '--color-accent': ['#0077B6', '#48CAE4'],
      },
      components: {
        card: {
          base: {borderWidth: '2px', borderColor: 'var(--color-accent)'},
        },
        button: {
          base: {borderRadius: '999px'},
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('.astryx-card {');
    expect(css).toContain('border-width: 2px');
    expect(css).toContain('border-color: var(--color-accent)');
    expect(css).toContain('.astryx-button {');
    expect(css).toContain('border-radius: 999px');
  });

  it('generates variant selectors from prop:value keys', () => {
    const theme = defineTheme({
      name: 'test',
      components: {
        button: {
          'variant:secondary': {
            backgroundColor: 'rgba(0,0,0,0.06)',
          },
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('.astryx-button[data-variant="secondary"]');
    expect(css).toContain('background-color: rgba(0,0,0,0.06)');
  });

  it('generates compound selectors from prop:value+prop:value keys', () => {
    const theme = defineTheme({
      name: 'test',
      components: {
        button: {
          'variant:destructive+size:sm': {
            padding: '2px 6px',
          },
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain(
      '.astryx-button[data-variant="destructive"][data-size="sm"]',
    );
    expect(css).toContain('padding: 2px 6px');
  });

  it('converts camelCase to kebab-case', () => {
    const theme = defineTheme({
      name: 'test',
      components: {
        heading: {
          base: {fontFamily: '"Playfair Display", serif'},
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('font-family: "Playfair Display", serif');
    expect(css).not.toContain('fontFamily');
  });

  it('combines tokens and components', () => {
    const theme = defineTheme({
      name: 'combo',
      tokens: {'--radius-container': '20px'},
      components: {
        card: {base: {borderWidth: '1px'}},
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('@scope');
    expect(css).toContain('--radius-container: 20px');
    expect(css).toContain('.astryx-card {');
    expect(css).toContain('border-width: 1px');
  });
});

describe('typography.scale', () => {
  it('generates typography token overrides when typography.scale is provided', () => {
    const theme = defineTheme({
      name: 'dense',
      typography: {scale: {base: 12, ratio: 1.125}},
    });
    // Semantic tokens are now var() refs; raw token has the computed value
    expect(theme.tokens['--text-heading-4-size']).toBe('var(--font-size-base)');
    expect(theme.tokens['--font-size-base']).toBe('0.75rem');
    expect(theme.tokens['--text-body-size']).toBe('var(--font-size-base)');
  });

  it('generates 44 tokens (11 raw size + 33 semantic)', () => {
    const theme = defineTheme({
      name: 'custom',
      typography: {scale: {base: 14, ratio: 1.2}},
    });
    // 12 raw size (--font-size-4xs…--font-size-5xl) + 18 heading + 24 text = 54
    const typeScaleKeys = Object.keys(theme.tokens).filter(
      k => k.startsWith('--font-size-') || k.startsWith('--text-'),
    );
    expect(typeScaleKeys).toHaveLength(54);
  });

  it('explicit tokens override scale-generated values', () => {
    const theme = defineTheme({
      name: 'override-test',
      typography: {scale: {base: 14, ratio: 1.2}},
      tokens: {
        '--text-heading-1-size': '40px',
      },
    });
    // Explicit token should win over typography.scale
    expect(theme.tokens['--text-heading-1-size']).toBe('40px');
    // Non-overridden scale token should still be a var() ref
    expect(theme.tokens['--text-heading-4-size']).toBe('var(--font-size-base)');
  });

  it('works without typography.scale (backwards compatible)', () => {
    const theme = defineTheme({name: 'no-scale'});
    // No type scale tokens should be present
    expect(theme.tokens['--text-heading-1-size']).toBeUndefined();
  });

  it('combines typography.scale with other token overrides', () => {
    const theme = defineTheme({
      name: 'combo',
      typography: {scale: {base: 16, ratio: 1.25}},
      tokens: {
        '--color-accent': '#CC0000',
      },
    });
    expect(theme.tokens['--color-accent']).toBe('#CC0000');
    expect(theme.tokens['--text-heading-4-size']).toBe('var(--font-size-base)');
    expect(theme.tokens['--font-size-base']).toBe('1rem');
  });
});

describe('typography.scale component auto-generation', () => {
  it('auto-generates heading component overrides when typography.scale is provided', () => {
    const theme = defineTheme({
      name: 'auto',
      typography: {scale: {base: 14, ratio: 1.2}},
    });
    expect(theme.components?.heading?.['level:1']).toBeDefined();
    expect(theme.components?.heading?.['level:1']?.fontSize).toBe(
      'var(--text-heading-1-size)',
    );
  });

  it('auto-generates text component overrides when typography.scale is provided', () => {
    const theme = defineTheme({
      name: 'auto',
      typography: {scale: {base: 14, ratio: 1.2}},
    });
    expect(theme.components?.text?.['type:body']).toBeDefined();
    expect(theme.components?.text?.['type:body']?.fontSize).toBe(
      'var(--text-body-size)',
    );
  });

  it('does not include color in auto-generated rules', () => {
    const theme = defineTheme({
      name: 'auto',
      typography: {scale: {base: 14, ratio: 1.2}},
    });
    expect(theme.components?.heading?.['level:1']?.color).toBeUndefined();
    expect(theme.components?.text?.['type:supporting']?.color).toBeUndefined();
  });

  it('explicit components deep-merge on top of auto-generated', () => {
    const theme = defineTheme({
      name: 'custom',
      typography: {scale: {base: 14, ratio: 1.2}},
      components: {
        heading: {
          'level:1': {letterSpacing: '-0.02em'},
        },
        button: {
          base: {borderRadius: '999px'},
        },
      },
    });
    // Auto-generated heading props still present
    expect(theme.components?.heading?.['level:1']?.fontSize).toBe(
      'var(--text-heading-1-size)',
    );
    // Explicit override merged on top
    expect(theme.components?.heading?.['level:1']?.letterSpacing).toBe(
      '-0.02em',
    );
    // Non-typography component preserved
    expect(theme.components?.button?.base?.borderRadius).toBe('999px');
  });

  it('does not generate components when typography.scale is absent', () => {
    const theme = defineTheme({name: 'bare'});
    expect(theme.components).toBeUndefined();
  });

  it('explicit heading overrides win over auto-generated', () => {
    const theme = defineTheme({
      name: 'override',
      typography: {scale: {base: 14, ratio: 1.2}},
      components: {
        heading: {
          'level:1': {fontFamily: '"Playfair Display", serif'},
        },
      },
    });
    // Explicit fontFamily wins
    expect(theme.components?.heading?.['level:1']?.fontFamily).toBe(
      '"Playfair Display", serif',
    );
    // Auto-generated fontSize still present
    expect(theme.components?.heading?.['level:1']?.fontSize).toBe(
      'var(--text-heading-1-size)',
    );
  });
});

describe('radius', () => {
  it('generates radius tokens from radius', () => {
    const theme = defineTheme({
      name: 'rounded',
      radius: {base: 4, multiplier: 1.5},
    });
    expect(theme.tokens['--radius-inner']).toBe('6px');
    expect(theme.tokens['--radius-element']).toBe('12px');
    expect(theme.tokens['--radius-container']).toBe('18px');
    expect(theme.tokens['--radius-page']).toBe('42px');
    expect(theme.tokens['--radius-none']).toBe('0px');
    expect(theme.tokens['--radius-full']).toBe('9999px');
  });

  it('explicit tokens override radius', () => {
    const theme = defineTheme({
      name: 'custom',
      radius: {base: 4, multiplier: 1},
      tokens: {'--radius-container': '20px'},
    });
    expect(theme.tokens['--radius-container']).toBe('20px');
    expect(theme.tokens['--radius-element']).toBe('8px'); // from radius
  });

  it('radius with multiplier 0 produces sharp theme', () => {
    const theme = defineTheme({
      name: 'sharp',
      radius: {base: 4, multiplier: 0},
    });
    expect(theme.tokens['--radius-inner']).toBe('0px');
    expect(theme.tokens['--radius-element']).toBe('0px');
    expect(theme.tokens['--radius-container']).toBe('0px');
    expect(theme.tokens['--radius-page']).toBe('0px');
    expect(theme.tokens['--radius-none']).toBe('0px');
    expect(theme.tokens['--radius-full']).toBe('9999px');
  });

  it('works without radius (backwards compatible)', () => {
    const theme = defineTheme({name: 'no-scale'});
    expect(theme.tokens['--radius-none']).toBeUndefined();
  });

  it('combines radius with typography.scale and other tokens', () => {
    const theme = defineTheme({
      name: 'combo',
      typography: {scale: {base: 16, ratio: 1.25}},
      radius: {base: 4, multiplier: 1},
      tokens: {
        '--color-accent': '#CC0000',
      },
    });
    expect(theme.tokens['--color-accent']).toBe('#CC0000');
    expect(theme.tokens['--text-heading-4-size']).toBe('var(--font-size-base)');
    expect(theme.tokens['--radius-element']).toBe('8px');
  });
});

describe('custom status via components', () => {
  it('passes custom status through components as status:value keys', () => {
    const theme = defineTheme({
      name: 'banner-status',
      components: {
        banner: {
          'status:neutral': {
            backgroundColor: 'var(--color-background-muted)',
          },
        },
      },
    });
    expect(theme.components?.banner?.['status:neutral']).toEqual({
      backgroundColor: 'var(--color-background-muted)',
    });
  });

  it('generates correct CSS selectors for banner status extensions', () => {
    const theme = defineTheme({
      name: 'banner-css',
      components: {
        banner: {
          'status:neutral': {
            backgroundColor: 'var(--color-background-muted)',
          },
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    // The status axis remains explicit in the generated data-attribute selector.
    expect(css).toContain('.astryx-banner[data-status="neutral"]');
    expect(css).toContain('background-color: var(--color-background-muted)');
  });

  it('custom button variant via components', () => {
    const theme = defineTheme({
      name: 'button-variant',
      components: {
        button: {
          'variant:primary-muted': {
            backgroundColor: '#ECF5FF',
          },
        },
      },
    });
    expect(theme.components?.button?.['variant:primary-muted']).toEqual({
      backgroundColor: '#ECF5FF',
    });
  });

  it('generates correct CSS for custom button variant', () => {
    const theme = defineTheme({
      name: 'button-css',
      components: {
        button: {
          'variant:primary-muted': {
            backgroundColor: '#ECF5FF',
          },
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('.astryx-button[data-variant="primary-muted"]');
    expect(css).toContain('background-color: #ECF5FF');
  });

  it('combines custom status with base and token overrides', () => {
    const theme = defineTheme({
      name: 'combo',
      tokens: {'--color-accent': '#FF0000'},
      components: {
        banner: {
          'status:neutral': {
            backgroundColor: 'var(--color-background-muted)',
            color: 'gray',
          },
        },
        button: {base: {borderRadius: '999px'}},
      },
    });
    expect(theme.tokens['--color-accent']).toBe('#FF0000');
    expect(theme.components?.banner?.['status:neutral']).toEqual({
      backgroundColor: 'var(--color-background-muted)',
      color: 'gray',
    });
    expect(theme.components?.button?.base?.borderRadius).toBe('999px');
  });

  it('does not have a variants field on the output', () => {
    const theme = defineTheme({
      name: 'no-variants',
      components: {
        banner: {
          'status:neutral': {backgroundColor: 'gray'},
        },
      },
    });
    expect(theme).not.toHaveProperty('variants');
  });
});

describe('typography font family derivation', () => {
  it('derives font family tokens from typography roles', () => {
    const theme = defineTheme({
      name: 'family-tokens',
      typography: {
        body: {family: 'Geist', fallbacks: '-apple-system, sans-serif'},
        code: {family: 'Geist Mono', fallbacks: '"SF Mono", monospace'},
      },
    });
    expect(theme.tokens['--font-family-body']).toBe(
      'Geist, -apple-system, sans-serif',
    );
    expect(theme.tokens['--font-family-heading']).toBe(
      'Geist, -apple-system, sans-serif',
    ); // inherited from body
    expect(theme.tokens['--font-family-code']).toBe(
      '"Geist Mono", "SF Mono", monospace',
    );
  });

  it('heading family overrides body when specified', () => {
    const theme = defineTheme({
      name: 'heading-override',
      typography: {
        body: {family: 'Inter', fallbacks: 'sans-serif'},
        heading: {family: 'Playfair Display', fallbacks: 'serif'},
      },
    });
    expect(theme.tokens['--font-family-body']).toBe('Inter, sans-serif');
    expect(theme.tokens['--font-family-heading']).toBe(
      '"Playfair Display", serif',
    );
  });

  it('explicit tokens override typography-derived font tokens', () => {
    const theme = defineTheme({
      name: 'token-wins',
      typography: {
        body: {family: 'Geist', fallbacks: 'sans-serif'},
      },
      tokens: {'--font-family-heading': '"Custom", serif'},
    });
    // Explicit token wins over typography-derived
    expect(theme.tokens['--font-family-heading']).toBe('"Custom", serif');
    // Body still comes from typography
    expect(theme.tokens['--font-family-body']).toBe('Geist, sans-serif');
  });

  it('combines typography with scale and tokens', () => {
    const theme = defineTheme({
      name: 'combo',
      typography: {
        scale: {base: 14, ratio: 1.2},
        body: {
          family: 'Figtree',
          fallbacks: 'sans-serif',
        },
      },
    });
    expect(theme.name).toBe('combo');
    expect(theme.tokens['--font-family-body']).toBe('Figtree, sans-serif');
    // scale tokens should still be present
    expect(theme.tokens['--text-heading-4-size']).toBeDefined();
  });
});

describe('typography weight derivation', () => {
  it('applies heading weight from typography role', () => {
    const theme = defineTheme({
      name: 'heading-weight',
      typography: {
        scale: {base: 14, ratio: 1.2},
        heading: {weight: 'bold'},
      },
    });
    // All heading levels should get bold weight
    expect(theme.tokens['--text-heading-1-weight']).toBe(
      'var(--font-weight-bold)',
    );
    expect(theme.tokens['--text-heading-4-weight']).toBe(
      'var(--font-weight-bold)',
    );
  });

  it('per-level heading weights override default heading weight', () => {
    const theme = defineTheme({
      name: 'per-level',
      typography: {
        scale: {base: 14, ratio: 1.2},
        heading: {
          weight: 'semibold',
          weights: {3: 'bold', 4: 'bold'},
        },
      },
    });
    expect(theme.tokens['--text-heading-1-weight']).toBe(
      'var(--font-weight-semibold)',
    );
    expect(theme.tokens['--text-heading-3-weight']).toBe(
      'var(--font-weight-bold)',
    );
    expect(theme.tokens['--text-heading-4-weight']).toBe(
      'var(--font-weight-bold)',
    );
  });

  it('body weight flows to text body token', () => {
    const theme = defineTheme({
      name: 'body-weight',
      typography: {
        scale: {base: 14, ratio: 1.2},
        body: {weight: 'medium'},
      },
    });
    expect(theme.tokens['--text-body-weight']).toBe(
      'var(--font-weight-medium)',
    );
  });

  it('code weight flows to text code token', () => {
    const theme = defineTheme({
      name: 'code-weight',
      typography: {
        scale: {base: 14, ratio: 1.2},
        code: {weight: 'medium'},
      },
    });
    expect(theme.tokens['--text-code-weight']).toBe(
      'var(--font-weight-medium)',
    );
  });

  it('named weight maps to var reference', () => {
    const theme = defineTheme({
      name: 'named-weight',
      typography: {
        scale: {base: 14, ratio: 1.2},
        heading: {weight: 'normal'},
      },
    });
    expect(theme.tokens['--text-heading-1-weight']).toBe(
      'var(--font-weight-normal)',
    );
  });

  it('raw CSS weight value passes through', () => {
    const theme = defineTheme({
      name: 'raw-weight',
      typography: {
        scale: {base: 14, ratio: 1.2},
        heading: {weight: '900'},
      },
    });
    expect(theme.tokens['--text-heading-1-weight']).toBe('900');
  });
});

describe('pseudo-class overrides in components', () => {
  it('generates pseudo-class rules from nested objects', () => {
    const theme = defineTheme({
      name: 'pseudo',
      components: {
        'radio-indicator': {
          base: {
            borderColor: '#8F9296',
            ':hover': {
              borderColor: 'color-mix(in srgb, #8F9296, black 20%)',
            },
          },
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    // Base rule
    expect(css).toContain('.astryx-radio-indicator {');
    expect(css).toContain('border-color: #8F9296');
    // Pseudo rule — separate selector
    expect(css).toContain(
      '.astryx-radio-indicator:hover:where(:not(:disabled,[aria-disabled="true"])) {',
    );
    expect(css).toContain(
      'border-color: color-mix(in srgb, #8F9296, black 20%)',
    );
  });

  it('generates pseudo-class rules on variant selectors', () => {
    const theme = defineTheme({
      name: 'pseudo-variant',
      components: {
        button: {
          'variant:primary-muted': {
            backgroundColor: '#ECF5FF',
            ':hover': {
              backgroundColor: '#D6EBFF',
            },
            ':focus-visible': {
              outline: '2px solid var(--color-accent)',
            },
          },
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('.astryx-button[data-variant="primary-muted"] {');
    expect(css).toContain('background-color: #ECF5FF');
    expect(css).toContain(
      '.astryx-button[data-variant="primary-muted"]:hover:where(:not(:disabled,[aria-disabled="true"])) {',
    );
    expect(css).toContain('background-color: #D6EBFF');
    expect(css).toContain(
      '.astryx-button[data-variant="primary-muted"]:focus-visible {',
    );
    expect(css).toContain('outline: 2px solid var(--color-accent)');
  });

  it('handles pseudo-only overrides (no base properties)', () => {
    const theme = defineTheme({
      name: 'pseudo-only',
      components: {
        switch: {
          base: {
            ':hover': {
              backgroundColor: 'color-mix(in srgb, #8F9296, black 5%)',
            },
          },
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    // Should NOT emit an empty base rule
    expect(css).not.toMatch(/\.astryx-switch\s*\{\s*\}/);
    // Should emit the pseudo rule
    expect(css).toContain(
      '.astryx-switch:hover:where(:not(:disabled,[aria-disabled="true"])) {',
    );
  });

  it('keeps non-pseudo string values as regular properties', () => {
    const theme = defineTheme({
      name: 'mixed',
      components: {
        card: {
          base: {
            borderWidth: '2px',
            borderColor: 'var(--color-accent)',
          },
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('.astryx-card {');
    expect(css).toContain('border-width: 2px');
    expect(css).toContain('border-color: var(--color-accent)');
    // No pseudo rules
    expect(css).not.toContain('.astryx-card:');
  });
});

describe('container padding mapping', () => {
  it('maps uniform padding to shorthand token on card', () => {
    const theme = defineTheme({
      name: 'test',
      components: {
        card: {
          base: {padding: '20px'},
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    // Should NOT emit raw padding property (only the scoped token)
    expect(css).not.toMatch(/[^-]padding: 20px/);
    // Should emit component-scoped shorthand token
    expect(css).toContain('--astryx-card-padding: 20px');
    // Should NOT emit directional tokens (shorthand covers all sides)
    expect(css).not.toContain('--astryx-card-padding-inline');
    expect(css).not.toContain('--astryx-card-padding-block-start');
  });

  it('maps asymmetric padding to directional tokens', () => {
    const theme = defineTheme({
      name: 'test',
      components: {
        card: {
          base: {padding: '16px 20px'},
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('--astryx-card-padding-inline: 20px');
    expect(css).toContain('--astryx-card-padding-block-start: 16px');
    expect(css).toContain('--astryx-card-padding-block-end: 16px');
    // Should NOT emit shorthand (sides differ)
    expect(css).not.toMatch(/--astryx-card-padding:[^-]/);
  });

  it('maps paddingBlock and paddingInline separately', () => {
    const theme = defineTheme({
      name: 'test',
      components: {
        card: {
          base: {paddingBlock: '24px', paddingInline: '16px'},
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('--astryx-card-padding-inline: 16px');
    expect(css).toContain('--astryx-card-padding-block-start: 24px');
    expect(css).toContain('--astryx-card-padding-block-end: 24px');
  });

  it('works for section and dialog too', () => {
    const theme = defineTheme({
      name: 'test',
      components: {
        section: {
          base: {padding: '12px'},
        },
        dialog: {
          base: {padding: '24px 32px'},
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    // Section — uniform → shorthand
    expect(css).toContain('--astryx-section-padding: 12px');
    // Dialog — asymmetric → directional
    expect(css).toContain('--astryx-dialog-padding-inline: 32px');
    expect(css).toContain('--astryx-dialog-padding-block-start: 24px');
  });

  it('maps bottom-sheet padding to its container tokens', () => {
    const theme = defineTheme({
      name: 'test',
      components: {
        'bottom-sheet': {
          base: {padding: '24px 20px'},
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('--astryx-bottom-sheet-padding-inline: 20px');
    expect(css).toContain('--astryx-bottom-sheet-padding-block-start: 24px');
    expect(css).toContain('--astryx-bottom-sheet-padding-block-end: 24px');
    // The panel is the overlay boundary; the value reaches the content box
    // through the token, never as padding on the panel itself.
    expect(css).not.toMatch(/(^|[\s{;])padding:\s*24px 20px/);
  });

  it('maps drawer padding to its container tokens', () => {
    const theme = defineTheme({
      name: 'test',
      components: {
        drawer: {
          base: {padding: '24px 20px'},
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('--astryx-drawer-padding-inline: 20px');
    expect(css).toContain('--astryx-drawer-padding-block-start: 24px');
    expect(css).toContain('--astryx-drawer-padding-block-end: 24px');
    // The panel is the overlay boundary; the value reaches the content area
    // through the token, never as padding on the panel itself.
    expect(css).not.toMatch(/(^|[\s{;])padding:\s*24px 20px/);
  });

  it('does NOT map padding on non-container components', () => {
    const theme = defineTheme({
      name: 'test',
      components: {
        button: {
          base: {padding: '8px 16px'},
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    // Button is not a container — padding passes through as-is
    expect(css).toContain('padding: 8px 16px');
    expect(css).not.toContain('--astryx-button-padding');
  });

  it('preserves non-padding properties alongside padding mapping', () => {
    const theme = defineTheme({
      name: 'test',
      components: {
        card: {
          base: {
            padding: '20px',
            '--_card-radius': '16px',
            backgroundColor: 'white',
          },
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    // Non-padding props pass through
    expect(css).toContain('--_card-radius: 16px');
    expect(css).toContain('background-color: white');
    // Padding is mapped to component-scoped token
    expect(css).toContain('--astryx-card-padding: 20px');
    expect(css).not.toMatch(/[^-]padding: 20px/);
  });

  it('maps 3-value padding shorthand', () => {
    const theme = defineTheme({
      name: 'test',
      components: {
        card: {
          base: {padding: '16px 20px 12px'},
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('--astryx-card-padding-block-start: 16px');
    expect(css).toContain('--astryx-card-padding-block-end: 12px');
    expect(css).toContain('--astryx-card-padding-inline: 20px');
  });

  it('maps paddingBlock shorthand with two values', () => {
    const theme = defineTheme({
      name: 'test',
      components: {
        card: {
          base: {paddingBlock: '16px 24px'},
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('--astryx-card-padding-block-start: 16px');
    expect(css).toContain('--astryx-card-padding-block-end: 24px');
  });

  it('maps paddingInline shorthand with two values', () => {
    const theme = defineTheme({
      name: 'test',
      components: {
        card: {
          base: {paddingInline: '12px 20px'},
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('--astryx-card-padding-inline-start: 12px');
    expect(css).toContain('--astryx-card-padding-inline-end: 20px');
  });

  it('maps paddingBlockStart alone', () => {
    const theme = defineTheme({
      name: 'test',
      components: {
        card: {
          base: {paddingBlockStart: '32px'},
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('--astryx-card-padding-block-start: 32px');
    expect(css).not.toContain('--astryx-card-padding-block-end');
    expect(css).not.toContain('--astryx-card-padding-inline');
  });

  it('maps paddingInlineStart and paddingInlineEnd separately', () => {
    const theme = defineTheme({
      name: 'test',
      components: {
        card: {
          base: {paddingInlineStart: '8px', paddingInlineEnd: '24px'},
        },
      },
    });
    const css = generateThemeTestCSS(theme);
    expect(css).toContain('--astryx-card-padding-inline-start: 8px');
    expect(css).toContain('--astryx-card-padding-inline-end: 24px');
  });
});

describe('defineTheme extends', () => {
  it('inherits enrollment, allows exact replacement, and owns new child names', () => {
    const inherited = '--astryx-theme-base-theme-color-status-fill';
    const childOwned = '--child-surface-raised';
    const base = defineTheme({
      name: 'base-theme',
      localTokens: {[inherited]: '#123456'},
    });
    const child = defineTheme({
      name: 'child-theme',
      extends: base,
      localTokens: {
        [inherited]: '#654321',
        [childOwned]: '#abcdef',
      },
    });

    expect(child.localTokens).toEqual({
      [inherited]: '#654321',
      [childOwned]: '#abcdef',
    });
    expect(child.__localTokenOwners).toEqual({
      [inherited]: 'base-theme',
      [childOwned]: 'child-theme',
    });
    expect(child.__localTokenLineage).toEqual(['base-theme', 'child-theme']);
  });

  it('inherits enrollment when the child declares no local tokens', () => {
    const base = defineTheme({name: 'base-theme', localTokens: {}});
    const child = defineTheme({name: 'child-theme', extends: base});

    expect(child.localTokens).toEqual({});
    expect(child.__localTokenLineage).toEqual(['base-theme', 'child-theme']);
  });

  it('preserves legacy descendant names when they only inherit enrollment', () => {
    const base = defineTheme({
      name: 'base-theme',
      localTokens: {
        '--astryx-theme-base-theme-color-status-fill': '#123456',
      },
    });
    const legacyChild = defineTheme({name: 'Legacy.Theme', extends: base});
    const grandchild = defineTheme({name: 'grandchild', extends: legacyChild});

    expect(legacyChild.localTokens).toEqual(base.localTokens);
    expect(legacyChild.__localTokenLineage).toEqual([
      'base-theme',
      'Legacy.Theme',
    ]);
    expect(grandchild.localTokens).toEqual(base.localTokens);
    expect(grandchild.__localTokenLineage).toEqual([
      'base-theme',
      'Legacy.Theme',
      'grandchild',
    ]);
  });

  it('inherits tokens from base theme', () => {
    const base = defineTheme({
      name: 'base',
      tokens: {
        '--color-accent': '#0077B6',
        '--radius-container': '16px',
      },
    });
    const child = defineTheme({
      name: 'child',
      extends: base,
    });
    expect(child.tokens['--color-accent']).toBe('#0077B6');
    expect(child.tokens['--radius-container']).toBe('16px');
  });

  it('inherits motion field by field: a field the child leaves unset keeps the base value (spec:AST-108 FR5)', () => {
    const base = defineTheme({
      name: 'base',
      motion: {
        fast: 100,
        medium: 200,
        slow: 400,
        ratio: 0.75,
        easing: 'cubic-bezier(0.2, 0, 0, 1)',
      },
    });
    const child = defineTheme({
      name: 'child',
      extends: base,
      motion: {fast: 120, medium: 240, ratio: 0.8},
    });
    // The fields the child sets regenerate their tokens.
    expect(child.tokens['--duration-fast']).toBe('120ms');
    expect(child.tokens['--duration-medium-min']).toBe('190ms');
    // `slow` and `easing`, left unset, keep the base's tokens: the slow band
    // stays at the base's ratio (400 × 0.75), not the child's.
    expect(child.tokens['--duration-slow']).toBe('400ms');
    expect(child.tokens['--duration-slow-min']).toBe('300ms');
    expect(child.tokens['--ease-standard']).toBe('cubic-bezier(0.2, 0, 0, 1)');
  });

  it('overrides base tokens with explicit tokens', () => {
    const base = defineTheme({
      name: 'base',
      tokens: {
        '--color-accent': '#0077B6',
        '--radius-container': '16px',
      },
    });
    const child = defineTheme({
      name: 'child',
      extends: base,
      tokens: {'--color-accent': '#FF0000'},
    });
    expect(child.tokens['--color-accent']).toBe('#FF0000');
    expect(child.tokens['--radius-container']).toBe('16px');
  });

  it('inherits component overrides from base theme', () => {
    const base = defineTheme({
      name: 'base',
      components: {
        button: {
          base: {fontWeight: '600'},
          'variant:secondary': {backgroundColor: 'rgba(0,0,0,0.06)'},
        },
      },
    });
    const child = defineTheme({
      name: 'child',
      extends: base,
    });
    expect(child.components?.button?.base).toEqual({fontWeight: '600'});
    expect(child.components?.button?.['variant:secondary']).toEqual({
      backgroundColor: 'rgba(0,0,0,0.06)',
    });
  });

  it('merges component overrides — child wins', () => {
    const base = defineTheme({
      name: 'base',
      components: {
        button: {
          base: {fontWeight: '600', borderRadius: '4px'},
        },
      },
    });
    const child = defineTheme({
      name: 'child',
      extends: base,
      components: {
        button: {
          base: {fontWeight: '700'},
        },
      },
    });
    expect(child.components?.button?.base).toEqual({
      fontWeight: '700',
      borderRadius: '4px',
    });
  });

  it('merges icons — child overrides base', () => {
    const baseIcons = {close: 'X', menu: 'M'} as Partial<IconRegistry>;
    const childIcons = {close: 'Y'} as Partial<IconRegistry>;
    const base = defineTheme({name: 'base', icons: baseIcons});
    const child = defineTheme({
      name: 'child',
      extends: base,
      icons: childIcons,
    });
    expect(child.icons?.close).toBe('Y');
    expect(child.icons?.menu).toBe('M');
  });

  it('inherits icons when child has none', () => {
    const baseIcons = {close: 'X'} as Partial<IconRegistry>;
    const base = defineTheme({name: 'base', icons: baseIcons});
    const child = defineTheme({name: 'child', extends: base});
    expect(child.icons?.close).toBe('X');
  });

  // spec:AST-087 FR2, FR3, FR18 — one theme-level list; a child that sets it
  // replaces the inherited list, one that omits it inherits; entry functions
  // receive `variant` typed as the theme's listed names.
  describe('iconVariants', () => {
    it('keeps the listed names on the defined theme', () => {
      const list = ['outline', 'filled'];
      const theme = defineTheme({name: 'variants', iconVariants: list});

      expect(theme.iconVariants).toEqual(['outline', 'filled']);
      list.push('bold');
      expect(theme.iconVariants).toEqual(['outline', 'filled']);
    });

    it('has no list when no theme in the lineage sets one', () => {
      const base = defineTheme({name: 'no-variants'});
      const child = defineTheme({name: 'no-variants-child', extends: base});

      expect(base.iconVariants).toBeUndefined();
      expect('iconVariants' in base).toBe(false);
      expect(child.iconVariants).toBeUndefined();
    });

    it('inherits the base list when a child omits it', () => {
      const base = defineTheme({
        name: 'variants-base',
        iconVariants: ['outline', 'filled'],
      });
      const child = defineTheme({name: 'variants-inherit', extends: base});

      expect(child.iconVariants).toEqual(['outline', 'filled']);
    });

    it('replaces the base list, without merging, when a child sets it', () => {
      const base = defineTheme({
        name: 'variants-base',
        iconVariants: ['outline', 'filled'],
      });
      const child = defineTheme({
        name: 'variants-replace',
        extends: base,
        iconVariants: ['bold'],
      });
      const emptied = defineTheme({
        name: 'variants-empty',
        extends: base,
        iconVariants: [],
      });

      expect(child.iconVariants).toEqual(['bold']);
      expect(emptied.iconVariants).toEqual([]);
      expect(base.iconVariants).toEqual(['outline', 'filled']);
    });

    it('types entry functions by the listed names', () => {
      const base = defineTheme({
        name: 'variants-typed',
        iconVariants: ['outline', 'filled'],
        icons: {
          info: ({size, variant}) => {
            expectTypeOf(variant).toEqualTypeOf<
              'outline' | 'filled' | undefined
            >();
            return `${size}-${variant ?? 'normal'}`;
          },
          close: ({variant}) =>
            // @ts-expect-error — 'bold' is not a name this theme lists.
            variant === 'bold' ? 'bold-close' : 'close',
        },
      });
      expectTypeOf(base).toEqualTypeOf<
        ResolvedDefinedTheme<'outline' | 'filled'>
      >();

      defineTheme({
        name: 'variants-typed-inherit',
        extends: base,
        icons: {
          info: ({variant}) => {
            expectTypeOf(variant).toEqualTypeOf<
              'outline' | 'filled' | undefined
            >();
            return null;
          },
        },
      });

      defineTheme({
        name: 'variants-typed-replace',
        extends: base,
        iconVariants: ['bold'],
        icons: {
          info: ({variant}) => {
            expectTypeOf(variant).toEqualTypeOf<'bold' | undefined>();
            return null;
          },
          close: ({variant}) =>
            // @ts-expect-error — the child replaced the list; 'filled' is gone.
            variant === 'filled' ? 'filled-close' : 'close',
        },
      });

      defineTheme({
        name: 'variants-typed-none',
        icons: {
          info: ({variant}) => {
            expectTypeOf(variant).toEqualTypeOf<undefined>();
            return null;
          },
        },
      });

      const plainBase: DefinedTheme = base;
      defineTheme({
        name: 'variants-typed-plain-base',
        extends: plainBase,
        icons: {
          info: ({variant}) => {
            expectTypeOf(variant).toEqualTypeOf<string | undefined>();
            return null;
          },
        },
      });

      expectTypeOf<DefinedTheme['iconVariants']>().toEqualTypeOf<
        ReadonlyArray<string> | undefined
      >();
    });

    it('keeps resolved themes with and without lists assignable to each other', () => {
      const shared: DefineThemeInput = {name: 'variants-shared'};
      const unlisted = defineTheme({name: 'variants-active'});
      // Each annotation is the check: these assignments compiled before
      // iconVariants existed and must keep compiling.
      const fromShared: typeof unlisted = defineTheme(shared);
      const fromListed: typeof unlisted = defineTheme({
        name: 'variants-listed-active',
        iconVariants: ['outline'],
      });
      const listed = defineTheme({
        name: 'variants-listed',
        iconVariants: ['outline', 'filled'],
      });
      const fromUnlisted: typeof listed = defineTheme({
        name: 'variants-unlisted',
      });
      const resolved: ResolvedDefinedTheme = fromUnlisted;

      expect(
        [unlisted, fromShared, fromListed, listed, resolved].map(t => t.name),
      ).toEqual([
        'variants-active',
        'variants-shared',
        'variants-listed-active',
        'variants-listed',
        'variants-unlisted',
      ]);
    });

    it('passes no variant to entry functions', () => {
      const info = vi.fn(
        ({size, variant}: {size: string; variant?: string}) =>
          `${size}-${variant ?? 'normal'}`,
      );
      const theme = defineTheme({
        name: 'variants-no-request',
        iconVariants: ['outline', 'filled'],
        icons: {info},
      });

      expect(theme.icons?.info).toBe('md-normal');
      expect(info).toHaveBeenCalledWith({size: 'md'});
    });
  });

  it('merges function icon entries by key and reads them at md', () => {
    const base = defineTheme({
      name: 'base',
      icons: {close: ({size}) => `base-close-${size}`, menu: 'M'},
    });
    const child = defineTheme({
      name: 'child',
      extends: base,
      icons: {menu: ({size}) => `child-menu-${size}`},
    });

    expect(child.icons).toEqual({
      close: 'base-close-md',
      menu: 'child-menu-md',
    });
  });

  it('uses child name, not base name', () => {
    const base = defineTheme({name: 'base'});
    const child = defineTheme({name: 'my-brand', extends: base});
    expect(child.name).toBe('my-brand');
  });

  it('inherits font family tokens from base theme', () => {
    const base = defineTheme({
      name: 'base',
      typography: {
        body: {
          family: 'Geist',
          fallbacks: 'sans-serif',
        },
        scale: {base: 14, ratio: 1.2},
      },
    });
    const child = defineTheme({name: 'child', extends: base});
    expect(child.tokens['--font-family-body']).toBe('Geist, sans-serif');
  });

  it('typography in child overrides base typography tokens', () => {
    const base = defineTheme({
      name: 'base',
      typography: {scale: {base: 14, ratio: 1.2}},
    });
    const child = defineTheme({
      name: 'child',
      extends: base,
      typography: {scale: {base: 16, ratio: 1.25}},
    });
    // Child's type scale tokens should differ from base
    expect(child.tokens['--font-size-base']).not.toBe(
      base.tokens['--font-size-base'],
    );
  });

  it('inherits indicators when the child has none', () => {
    const indicator = (() => null) as unknown as NonNullable<
      DefinedTheme['indicators']
    >['check'];
    const base = defineTheme({name: 'base', indicators: {check: indicator}});
    const child = defineTheme({name: 'child', extends: base});
    expect(child.indicators?.check).toBe(indicator);
  });

  it('inherits onDark token overrides from base theme', () => {
    const base = defineTheme({
      name: 'base',
      onDark: {tokens: {'--color-border': '#ffffff'}},
    });
    const child = defineTheme({name: 'child', extends: base});
    expect(child.__onDark?.tokens['--color-border']).toBe('#ffffff');
  });

  it('inherits onLight token overrides from base theme', () => {
    const base = defineTheme({
      name: 'base',
      onLight: {tokens: {'--color-border': '#000000'}},
    });
    const child = defineTheme({name: 'child', extends: base});
    expect(child.__onLight?.tokens['--color-border']).toBe('#000000');
  });

  it('lets the child override an inherited onDark token', () => {
    const base = defineTheme({
      name: 'base',
      onDark: {tokens: {'--color-border': '#ffffff', '--color-track': '#eee'}},
    });
    const child = defineTheme({
      name: 'child',
      extends: base,
      onDark: {tokens: {'--color-border': '#cccccc'}},
    });
    expect(child.__onDark?.tokens['--color-border']).toBe('#cccccc');
    expect(child.__onDark?.tokens['--color-track']).toBe('#eee');
  });

  it('inherits and deep-merges onDark component overrides', () => {
    const base = defineTheme({
      name: 'base',
      onDark: {
        components: {
          card: {base: {borderColor: '#fff', backgroundColor: '#111'}},
          badge: {base: {color: '#fff'}},
        },
      },
    });
    const child = defineTheme({
      name: 'child',
      extends: base,
      onDark: {components: {card: {base: {borderColor: '#ccc'}}}},
    });
    expect(child.__onDark?.components?.card?.base).toEqual({
      borderColor: '#ccc',
      backgroundColor: '#111',
    });
    expect(child.__onDark?.components?.badge?.base).toEqual({color: '#fff'});
  });

  it('inherits __inputTokens so inherited [light, dark] tuples survive', () => {
    const base = defineTheme({
      name: 'base',
      tokens: {'--color-accent': ['#111111', '#eeeeee']},
    });
    const child = defineTheme({
      name: 'child',
      extends: base,
      tokens: {'--color-border': '#cccccc'},
    });
    expect(child.__inputTokens?.['--color-accent']).toEqual([
      '#111111',
      '#eeeeee',
    ]);
    expect(child.__inputTokens?.['--color-border']).toBe('#cccccc');
  });

  it('__inputTokens from the child win over the base', () => {
    const base = defineTheme({
      name: 'base',
      tokens: {'--color-accent': ['#111111', '#eeeeee']},
    });
    const child = defineTheme({
      name: 'child',
      extends: base,
      tokens: {'--color-accent': '#ff0000'},
    });
    expect(child.__inputTokens?.['--color-accent']).toBe('#ff0000');
  });

  // The failure that motivated these: `extends` resolving to `undefined` (a
  // named import that silently missed — see the theme-build resolution tests)
  // used to inherit nothing and build a stylesheet that looked fine.
  it('throws when extends is present but undefined', () => {
    expect(() =>
      defineTheme({
        name: 'child',
        extends: undefined,
        tokens: {'--color-accent': '#ff0000'},
      }),
    ).toThrow(/extends/);
  });

  it('throws when extends is not a theme', () => {
    expect(() =>
      defineTheme({
        name: 'child',
        // A module namespace object is the shape a bad import hands over.
        extends: {foo: 'bar'} as unknown as DefinedTheme,
      }),
    ).toThrow(/extends/);
  });

  it('accepts a pre-built theme module as a base', () => {
    const built = {
      name: 'built-base',
      __built: true,
      tokens: {'--color-accent': '#111111'},
    } as DefinedTheme;
    const child = defineTheme({name: 'child', extends: built});
    expect(child.tokens['--color-accent']).toBe('#111111');
  });
});
