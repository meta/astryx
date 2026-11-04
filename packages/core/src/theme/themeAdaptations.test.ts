// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file themeAdaptations.test.ts
 * Tests AST-012's ordered, closed, CSS-first theme adaptation contract,
 * including normalization, root-dependent type-scale component writes, and final
 * reachable-cascade validation.
 */

import {describe, expect, it} from 'vitest';
import {
  DEFAULT_COMPACT_DEFINITION,
  DEFAULT_WIDTH_BREAKPOINTS,
  WIDTH_BREAKPOINT_NAMES,
  compactDefinition,
  defineTheme,
  generateAdaptationCSS,
  generateThemeCSS,
  generateThemeRules,
  type DefineThemeInput,
  type DefinedTheme,
} from './index';

function adaptationInput(
  rules: NonNullable<NonNullable<DefineThemeInput['adaptations']>['rules']>,
): DefineThemeInput {
  return {name: 'adaptive', adaptations: {rules}};
}

function mediaPreludes(css: string): string[] {
  return [...css.matchAll(/@media ([^{]+) \{/g)].map(match => match[1]);
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('width breakpoint metadata', () => {
  it('provides the accepted fixed names and defaults', () => {
    const theme = defineTheme({name: 'defaults'});

    expect(WIDTH_BREAKPOINT_NAMES).toEqual(['sm', 'md', 'lg', 'xl', '2xl']);
    expect(DEFAULT_WIDTH_BREAKPOINTS).toEqual({
      sm: 640,
      md: 768,
      lg: 1024,
      xl: 1280,
      '2xl': 1536,
    });
    expect(theme.__adaptations).toEqual({
      widthBreakpoints: DEFAULT_WIDTH_BREAKPOINTS,
      rules: [],
    });
  });

  it('lets a theme override fixed points without emitting CSS', () => {
    const theme = defineTheme({
      name: 'points-only',
      adaptations: {widthBreakpoints: {md: 800, lg: 1100}},
    });

    expect(theme.__adaptations.widthBreakpoints).toEqual({
      ...DEFAULT_WIDTH_BREAKPOINTS,
      md: 800,
      lg: 1100,
    });
    expect(generateAdaptationCSS(theme)).toEqual({prose: '', component: ''});
    expect(generateThemeCSS(theme).component).not.toContain('@media');
  });

  it('validates built breakpoint metadata even when there are no rules to emit', () => {
    const built = {
      name: 'stale-built-points',
      __built: true,
      tokens: {},
      __adaptations: {
        widthBreakpoints: {
          sm: 640,
          md: 768,
          lg: 700,
          xl: 1280,
          '2xl': 1536,
        },
        rules: [],
      },
      __adaptationRules: [],
      __axes: {},
    } as unknown as DefinedTheme;

    expect(() => generateAdaptationCSS(built)).toThrow(/strictly increasing/);
  });

  it.each([
    [{phone: 500}, /phone is not supported/],
    [{md: 0}, /md must be a finite positive number/],
    [{md: Number.NaN}, /md must be a finite positive number/],
    [{md: 1100, lg: 1000}, /strictly increasing/],
  ])('rejects an invalid breakpoint map %#', (widthBreakpoints, message) => {
    expect(() =>
      defineTheme({
        name: 'bad-points',
        adaptations: {
          widthBreakpoints,
        } as unknown as DefineThemeInput['adaptations'],
      }),
    ).toThrow(message);
  });
});

describe('compact definition (spec:AST-012 FR9)', () => {
  it('is width below md or height below 500 at the default points', () => {
    expect(DEFAULT_COMPACT_DEFINITION).toEqual({
      widthBelow: 768,
      heightBelow: 500,
      query: '(width < 768px), (height < 500px)',
      coarsePointerQuery:
        '(width < 768px) and (pointer: coarse), (height < 500px) and (pointer: coarse)',
    });
    expect(compactDefinition()).toEqual(DEFAULT_COMPACT_DEFINITION);
  });

  it("follows a theme's effective md point and keeps the height edge", () => {
    const theme = defineTheme({
      name: 'wide-md',
      adaptations: {widthBreakpoints: {md: 800, lg: 1100}},
    });
    const points = theme.__adaptations?.widthBreakpoints;
    if (points == null) {
      throw new Error('theme has no effective width breakpoints');
    }
    expect(compactDefinition(points)).toEqual({
      widthBelow: 800,
      heightBelow: 500,
      query: '(width < 800px), (height < 500px)',
      coarsePointerQuery:
        '(width < 800px) and (pointer: coarse), (height < 500px) and (pointer: coarse)',
    });
  });

  it('is frozen, so no caller can change the shared definition', () => {
    expect(Object.isFrozen(DEFAULT_COMPACT_DEFINITION)).toBe(true);
  });
});

describe('closed conditions and media queries', () => {
  it('lowers inclusive from and exclusive below edges', () => {
    const theme = defineTheme(
      adaptationInput([
        {
          when: {width: {below: 'sm'}},
          value: {tokens: {'--spacing-4': '12px'}},
        },
        {
          when: {width: {from: 'lg', below: 'xl'}},
          value: {tokens: {'--spacing-4': '20px'}},
        },
        {
          when: {width: {from: '2xl'}},
          value: {tokens: {'--spacing-4': '24px'}},
        },
      ]),
    );

    expect(mediaPreludes(generateAdaptationCSS(theme).component)).toEqual([
      '(width < 640px)',
      '(width >= 1024px) and (width < 1280px)',
      '(width >= 1536px)',
    ]);
  });

  it('ANDs width, pointer, contrast, and motion in a stable order', () => {
    const theme = defineTheme(
      adaptationInput([
        {
          when: {
            motion: 'reduce',
            pointer: 'coarse',
            width: {from: 'md', below: 'xl'},
            contrast: 'more',
          },
          value: {tokens: {'--duration-fast': '0ms'}},
        },
      ]),
    );

    expect(mediaPreludes(generateAdaptationCSS(theme).component)).toEqual([
      '(width >= 768px) and (width < 1280px) and (pointer: coarse) and (prefers-contrast: more) and (prefers-reduced-motion: reduce)',
    ]);
  });

  it.each([
    [{}, /must contain at least one condition/],
    [{pointer: undefined}, /must contain at least one condition/],
    [{width: {}}, /must contain `from`, `below`, or both/],
    [{width: {from: 'lg', below: 'md'}}, /must resolve to `from < below`/],
    [{hover: true}, /hover is not supported/],
    [{pointer: 'any'}, /pointer must be 'coarse' or 'fine'/],
  ])('rejects an invalid condition %#', (when, message) => {
    expect(() =>
      defineTheme(
        adaptationInput([
          {
            when,
            value: {tokens: {'--spacing-4': '12px'}},
          } as never,
        ]),
      ),
    ).toThrow(message);
  });

  it('rejects positional rules and root-owned fields in a rule value', () => {
    expect(() =>
      defineTheme({
        name: 'tuple-rule',
        adaptations: {
          rules: [[{pointer: 'coarse'}, {tokens: {'--spacing-4': '12px'}}]],
        },
      } as unknown as DefineThemeInput),
    ).toThrow(/must be an object/);

    expect(() =>
      defineTheme({
        name: 'identity-in-rule',
        adaptations: {
          rules: [{when: {pointer: 'coarse'}, value: {icons: {}}}],
        },
      } as unknown as DefineThemeInput),
    ).toThrow(/value.icons is not supported/);
  });

  it('rejects sparse rule arrays during normalization', () => {
    const rules = new Array(1) as NonNullable<
      NonNullable<DefineThemeInput['adaptations']>['rules']
    >;

    expect(() => defineTheme(adaptationInput(rules))).toThrow(
      /adaptations\.rules\[0\].*must be present/i,
    );
  });
});

describe('rule order and writes', () => {
  it('preserves duplicate conditions and later root-restoring writes', () => {
    const theme = defineTheme({
      name: 'ordered',
      tokens: {'--spacing-4': '16px'},
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {tokens: {'--spacing-4': '12px'}},
          },
          {
            when: {pointer: 'coarse'},
            value: {tokens: {'--spacing-4': '16px'}},
          },
        ],
      },
    });
    const css = generateAdaptationCSS(theme).component;

    expect(count(css, '@media (pointer: coarse)')).toBe(2);
    expect(css.indexOf('--spacing-4: 12px')).toBeLessThan(
      css.indexOf('--spacing-4: 16px'),
    );
  });

  it('uses declaration order rather than inferred condition specificity', () => {
    const theme = defineTheme(
      adaptationInput([
        {
          when: {width: {from: 'md', below: 'lg'}, pointer: 'coarse'},
          value: {tokens: {'--spacing-4': '12px'}},
        },
        {
          when: {pointer: 'coarse'},
          value: {tokens: {'--spacing-4': '20px'}},
        },
      ]),
    );
    const css = generateAdaptationCSS(theme).component;

    expect(css.indexOf('--spacing-4: 12px')).toBeLessThan(
      css.indexOf('--spacing-4: 20px'),
    );
  });

  it('emits no block for an empty value while retaining the normalized rule', () => {
    const theme = defineTheme(
      adaptationInput([
        {when: {pointer: 'coarse'}, value: {}},
        {
          when: {pointer: 'fine'},
          value: {tokens: {'--spacing-4': '18px'}},
        },
      ]),
    );

    expect(theme.__adaptations.rules).toHaveLength(2);
    expect(count(generateAdaptationCSS(theme).component, '@media')).toBe(1);
  });

  it('keeps status aliases at the root so conditional authored roles win', () => {
    const theme = defineTheme({
      name: 'conditional-status-role-precedence',
      tokens: {'--color-text-blue': '#0074e2'},
      adaptations: {
        rules: [
          {
            when: {contrast: 'more'},
            value: {tokens: {'--color-text-info': '#123456'}},
          },
          {
            when: {pointer: 'coarse'},
            value: {tokens: {'--color-text-blue': '#0055aa'}},
          },
        ],
      },
      onDark: {tokens: {'--color-text-blue': '#ffffff'}},
    });
    const {component} = generateThemeCSS(theme);
    const adaptationCss = generateAdaptationCSS(theme).component;

    // The root alias follows source-only adaptation writes through var(); the
    // dark media surface that sets the hue rebinds its own alias.
    expect(count(component, '--color-text-info: var(--color-text-blue);')).toBe(
      2,
    );
    expect(component).toContain('--color-text-info: #123456;');
    expect(adaptationCss).toContain('--color-text-blue: #0055aa;');
    expect(adaptationCss).not.toContain(
      '--color-text-info: var(--color-text-blue);',
    );
  });

  it('replays authored status roles after overlapping adaptation and media aliases', () => {
    const theme = defineTheme({
      name: 'conditional-status-role-replay',
      adaptations: {
        rules: [
          {
            when: {contrast: 'more'},
            value: {tokens: {'--color-text-info': '#123456'}},
          },
          {
            when: {pointer: 'coarse'},
            value: {tokens: {'--color-text-blue': '#0055aa'}},
          },
        ],
      },
      onDark: {tokens: {'--color-text-blue': '#ffffff'}},
    });
    const css = generateThemeCSS(theme).component;
    const alias = '--color-text-info: var(--color-text-blue);';
    const authored = '--color-text-info: #123456;';

    // The adaptation-only source keeps its alias where that condition matches,
    // and the media surface that sets the hue gets its own.
    expect(count(css, alias)).toBe(2);
    // The authored role is emitted normally and replayed after adaptation aliases.
    expect(count(css, authored)).toBe(2);
    // The replay follows the adaptation alias; the media alias sits in its
    // own surface block.
    expect(css.lastIndexOf(authored)).toBeGreaterThan(css.indexOf(alias));
  });

  it('suppresses a root alias that an adaptation would turn into a cycle', () => {
    const theme = defineTheme({
      name: 'adaptation-closes-root-role-cycle',
      tokens: {'--color-text-blue': '#0074e2'},
      adaptations: {
        rules: [
          {
            when: {contrast: 'more'},
            value: {tokens: {'--color-text-blue': 'var(--color-text-info)'}},
          },
        ],
      },
    });
    const rootCss = generateThemeRules(theme).join('\n');
    const fullCss = generateThemeCSS(theme).component;

    expect(fullCss).toContain('--color-text-blue: var(--color-text-info);');
    expect(rootCss).not.toContain('--color-text-info: var(--color-text-blue);');
  });

  it('checks generated aliases across overlapping adaptation rules', () => {
    const theme = defineTheme({
      name: 'overlapping-generated-role-cycle',
      adaptations: {
        rules: [
          {
            when: {contrast: 'more'},
            value: {
              tokens: {
                '--color-text-blue': 'var(--color-text-success)',
              },
            },
          },
          {
            when: {pointer: 'coarse'},
            value: {
              tokens: {'--color-text-green': 'var(--color-text-info)'},
            },
          },
        ],
      },
    });
    const css = generateAdaptationCSS(theme).component;

    // Both rules can match together, so the second alias would close a loop
    // through the first and is not emitted.
    expect(css).toContain('--color-text-info: var(--color-text-blue);');
    expect(css).not.toContain('--color-text-success: var(--color-text-green);');
  });

  it('keeps aliases across mutually exclusive adaptation conditions', () => {
    const theme = defineTheme({
      name: 'mutually-exclusive-status-references',
      tokens: {'--color-text-blue': '#0066cc'},
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {
              tokens: {'--color-text-blue': 'var(--color-text-success)'},
            },
          },
          {
            when: {pointer: 'fine'},
            value: {
              tokens: {'--color-text-green': 'var(--color-text-info)'},
            },
          },
        ],
      },
    });

    expect(generateThemeCSS(theme).component).toContain(
      '--color-text-info: var(--color-text-blue);',
    );
  });

  it('keeps an alias when a later matching rule repairs the cycle', () => {
    const theme = defineTheme({
      name: 'repaired-status-reference',
      tokens: {'--color-text-blue': '#0066cc'},
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {tokens: {'--color-text-blue': 'var(--color-text-info)'}},
          },
          {
            when: {pointer: 'coarse'},
            value: {tokens: {'--color-text-blue': '#abcdef'}},
          },
        ],
      },
    });

    expect(generateThemeCSS(theme).component).toContain(
      '--color-text-info: var(--color-text-blue);',
    );
  });

  it('checks the final authored-role replay before emitting aliases', () => {
    const theme = defineTheme({
      name: 'adaptation-role-replay-cycle',
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {
              tokens: {'--color-text-info': 'var(--color-text-success)'},
            },
          },
          {
            when: {pointer: 'coarse'},
            value: {
              tokens: {
                '--color-text-blue': '#123456',
                '--color-text-green': 'var(--color-text-info)',
              },
            },
          },
        ],
      },
    });
    const css = generateAdaptationCSS(theme).component;

    expect(css).not.toContain('--color-text-success: var(--color-text-green);');
  });

  it('preserves important declarations while modeling later repairs', () => {
    const theme = defineTheme({
      name: 'important-status-reference',
      tokens: {'--color-text-blue': '#0066cc'},
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {
              tokens: {
                '--color-text-blue': 'var(--color-text-info) !important',
              },
            },
          },
          {
            when: {pointer: 'coarse'},
            value: {tokens: {'--color-text-blue': '#123456'}},
          },
        ],
      },
    });
    const rootCss = generateThemeRules(theme).join('\n');

    expect(rootCss).not.toContain('--color-text-info: var(--color-text-blue);');
  });

  it('does not treat an escaped bang as declaration priority', () => {
    const theme = defineTheme({
      name: 'escaped-bang-status-reference',
      tokens: {'--color-text-blue': '#0066cc'},
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {
              tokens: {
                '--color-text-blue': 'var(--color-text-info) \\!important',
              },
            },
          },
          {
            when: {pointer: 'coarse'},
            value: {tokens: {'--color-text-blue': '#123456'}},
          },
        ],
      },
    });
    const rootCss = generateThemeRules(theme).join('\n');

    expect(rootCss).toContain('--color-text-info: var(--color-text-blue);');
  });

  it('does not treat an important() function as declaration priority', () => {
    const theme = defineTheme({
      name: 'important-function-status-reference',
      tokens: {'--color-text-blue': '#0066cc'},
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {tokens: {'--color-text-blue': 'red !important()'}},
          },
          {
            when: {pointer: 'coarse'},
            value: {tokens: {'--color-text-blue': 'var(--color-text-info)'}},
          },
        ],
      },
    });

    expect(generateThemeRules(theme).join('\n')).not.toContain(
      '--color-text-info: var(--color-text-blue);',
    );
  });

  it('does not model a dropped declaration as a cycle repair', () => {
    const theme = defineTheme({
      name: 'dropped-status-repair',
      tokens: {'--color-text-blue': '#0066cc'},
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {tokens: {'--color-text-blue': 'var(--color-text-info)'}},
          },
          {
            when: {pointer: 'coarse'},
            value: {tokens: {'--color-text-blue': '#abcdef;'}},
          },
        ],
      },
    });
    const warnings: string[] = [];
    const rootCss = generateThemeRules(theme, warnings).join('\n');

    expect(rootCss).not.toContain('--color-text-info: var(--color-text-blue);');
    expect(generateAdaptationCSS(theme, warnings).component).not.toContain(
      '--color-text-blue: #abcdef;',
    );
    expect(warnings.some(warning => warning.includes('dropped'))).toBe(true);
  });

  it('keeps a root alias when a matching rule overwrites that alias', () => {
    const theme = defineTheme({
      name: 'overwritten-root-status-alias',
      tokens: {'--color-text-blue': '#0066cc'},
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {tokens: {'--color-text-info': '#123456'}},
          },
        ],
      },
    });
    theme.__adaptationRules![0].tokens['--color-text-info'] =
      'var(--color-text-info)';

    expect(generateThemeRules(theme).join('\n')).toContain(
      '--color-text-info: var(--color-text-blue);',
    );
  });

  it('invalidates cached status aliases after legacy token mutation', () => {
    const theme = defineTheme({
      name: 'mutated-status-alias-cache',
      tokens: {'--color-text-blue': '#0074e2'},
    });

    expect(generateThemeCSS(theme).component).toContain(
      '--color-text-info: var(--color-text-blue);',
    );
    theme.tokens['--color-text-blue'] = 'var(--color-text-info)';
    expect(generateThemeCSS(theme).component).not.toContain(
      '--color-text-info: var(--color-text-blue);',
    );
  });

  it('invalidates cached rules after legacy adaptation component mutation', () => {
    const theme = defineTheme({
      name: 'mutated-adaptation-component-cache',
      adaptations: {
        rules: [
          {
            when: {contrast: 'more'},
            value: {
              components: {button: {base: {borderWidth: '1px'}}},
            },
          },
        ],
      },
    });

    expect(generateThemeCSS(theme).component).toContain('border-width: 1px');
    theme.__adaptationRules = theme.__adaptationRules!.map(rule => ({
      ...rule,
      components: {button: {base: {borderWidth: '9px'}}},
    }));
    const css = generateThemeCSS(theme).component;
    expect(css).toContain('border-width: 9px');
    expect(css).not.toContain('border-width: 1px');
  });

  it('emits a guarded alias when only an adaptation authors the source', () => {
    const theme = defineTheme({
      name: 'adaptation-only-status-source',
      adaptations: {
        rules: [
          {
            when: {contrast: 'more'},
            value: {tokens: {'--color-text-blue': '#0055aa'}},
          },
        ],
      },
    });
    const css = generateAdaptationCSS(theme).component;

    expect(css).toContain('--color-text-blue: #0055aa;');
    expect(css).toContain('--color-text-info: var(--color-text-blue);');
  });

  it('lets explicit values beat generated values within one rule', () => {
    const theme = defineTheme({
      name: 'rule-precedence',
      color: {accent: '#0064E0'},
      adaptations: {
        rules: [
          {
            when: {contrast: 'more'},
            value: {
              color: {accent: '#00AA00'},
              tokens: {'--color-accent': '#FF0000'},
            },
          },
        ],
      },
    });

    expect(theme.__adaptationRules?.[0].tokens['--color-accent']).toBe(
      '#FF0000',
    );
  });

  it('treats generated leaves as rule writes above root token pins', () => {
    const theme = defineTheme({
      name: 'generated-write',
      typography: {scale: {base: 14, ratio: 1.2}},
      tokens: {'--font-size-base': '2rem'},
      adaptations: {
        rules: [
          {
            when: {width: {below: 'sm'}},
            value: {typography: {scale: {base: 16}}},
          },
        ],
      },
    });

    expect(theme.tokens['--font-size-base']).toBe('2rem');
    expect(theme.__adaptationRules?.[0].tokens['--font-size-base']).toBe(
      '1rem',
    );
  });

  it('writes font families without re-expanding an untouched root scale', () => {
    const theme = defineTheme({
      name: 'family-only',
      typography: {scale: {base: 14, ratio: 1.2}},
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {typography: {body: {family: 'Geist'}}},
          },
        ],
      },
    });

    const rule = theme.__adaptationRules?.[0];
    expect(rule?.tokens['--font-family-body']).toBe('Geist');
    expect(rule?.tokens['--font-size-base']).toBeUndefined();
    expect(rule?.components).toBeUndefined();
  });

  it('completes partial scales from root metadata and refuses approximations', () => {
    const complete = defineTheme({
      name: 'complete-scale',
      typography: {scale: {base: 14, ratio: 1.25}},
      radius: {base: 6, multiplier: 1},
      adaptations: {
        rules: [
          {
            when: {width: {below: 'md'}},
            value: {
              typography: {scale: {base: 16}},
              radius: {multiplier: 2},
            },
          },
        ],
      },
    });

    expect(complete.__adaptationRules?.[0].tokens['--font-size-lg']).toBe(
      '1.25rem',
    );
    expect(complete.__adaptationRules?.[0].tokens['--radius-element']).toBe(
      '24px',
    );

    expect(() =>
      defineTheme({
        name: 'missing-scale',
        adaptations: {
          rules: [
            {
              when: {pointer: 'coarse'},
              value: {motion: {fast: 100}},
            },
          ],
        },
      }),
    ).toThrow(/must supply `fast`, `medium`, and `ratio`/);
  });

  it('lowers component writes through the ordinary derived-variable path', () => {
    const theme = defineTheme(
      adaptationInput([
        {
          when: {pointer: 'coarse'},
          value: {components: {button: {base: {borderRadius: '20px'}}}},
        },
      ]),
    );

    const css = generateAdaptationCSS(theme).component;
    expect(css).toContain('--_button-radius: 20px');
  });
});

describe('adapted type-scale component defaults', () => {
  const displayFamily = 'Sarina, "Brush Script MT", "Snell Roundhand", cursive';
  const butterShapedInput: DefineThemeInput = {
    name: 'butter-shaped',
    typography: {
      scale: {base: 16, ratio: 1.25},
      body: {family: 'Outfit', fallbacks: 'sans-serif'},
    },
    components: {
      text: Object.fromEntries(
        ['display-1', 'display-2', 'display-3'].map(type => [
          `type:${type}`,
          {fontFamily: displayFamily},
        ]),
      ),
      button: {base: {borderRadius: '12px'}},
    },
    adaptations: {
      rules: [
        {
          when: {width: {below: 'md'}, pointer: 'coarse'},
          value: {typography: {scale: {base: 14, ratio: 1.2}}},
        },
      ],
    },
  };

  it('keeps butter-shaped display families while adapting scale tokens only', () => {
    const theme = defineTheme(butterShapedInput);
    const rule = theme.__adaptationRules![0];
    const css = generateThemeCSS(theme).component;
    const adaptiveCSS = generateAdaptationCSS(theme).component;

    expect(rule.query).toBe('(width < 768px) and (pointer: coarse)');
    expect(theme.tokens['--font-size-base']).toBe('1rem');
    expect(rule.tokens['--font-size-base']).toBe('0.875rem');
    expect(rule.tokens['--font-size-5xl']).not.toBe(
      theme.tokens['--font-size-5xl'],
    );
    expect(adaptiveCSS).toContain('--font-size-base: 0.875rem');
    // The root owns the var() wiring and its authored overrides. Re-emitting
    // either would turn an unrelated scale change into a component write.
    expect(rule.components).toBeUndefined();
    expect(adaptiveCSS).not.toContain('.astryx-text');
    expect(adaptiveCSS).not.toContain('.astryx-heading');
    expect(adaptiveCSS).not.toContain('.astryx-button');
    for (const type of ['display-1', 'display-2', 'display-3']) {
      expect(theme.components?.text[`type:${type}`].fontFamily).toBe(
        displayFamily,
      );
      expect(count(css, `.astryx-text[data-type="${type}"] {`)).toBe(1);
    }
    expect(count(css, `font-family: ${displayFamily};`)).toBe(3);
    // Built modules retain root components + intent, not resolved rule layers.
    expect(generateThemeCSS({...theme, __adaptationRules: undefined})).toEqual(
      generateThemeCSS(theme),
    );
  });

  it('fills only missing generated leaves when the root has no scale', () => {
    const components = {
      heading: {
        'level:1': {fontFamily: 'serif', fontWeight: '900'},
        'type:display-1': {fontSize: '5rem'},
      },
      text: {
        'type:display-1': {fontFamily: displayFamily, lineHeight: '1.1'},
        'type:body': {fontSize: '18px'},
        'type:custom': {fontFamily: 'monospace'},
      },
      button: {base: {borderRadius: '12px'}},
    };
    const before = structuredClone(components);
    const theme = defineTheme({
      ...butterShapedInput,
      typography: undefined,
      components,
    });
    const generated = theme.__adaptationRules![0].components!;

    expect(generated.heading['level:1']).toEqual({
      fontSize: 'var(--text-heading-1-size)',
      lineHeight: 'var(--text-heading-1-leading)',
    });
    expect(generated.heading['type:display-1']).toEqual({
      fontFamily: 'var(--font-family-heading)',
      lineHeight: 'var(--text-display-1-leading)',
    });
    expect(generated.text['type:display-1']).toEqual({
      fontSize: 'var(--text-display-1-size)',
    });
    expect(generated.text['type:body']).toEqual({
      fontFamily: 'var(--font-family-body)',
      lineHeight: 'var(--text-body-leading)',
    });
    expect(generated.text['type:custom']).toBeUndefined();
    expect(generated.button).toBeUndefined();
    expect(components).toEqual(before);
    expect(theme.components).toEqual(before);
  });

  it('preserves explicit rule writes, including a later root-restoring value', () => {
    const theme = defineTheme({
      ...butterShapedInput,
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {
              typography: {scale: {base: 15}},
              components: {
                text: {'type:display-1': {fontFamily: 'monospace'}},
                heading: {'level:1': {fontWeight: '300'}},
              },
            },
          },
          ...butterShapedInput.adaptations!.rules!,
          {
            when: {contrast: 'more'},
            value: {
              typography: {scale: {base: 14}},
              components: {
                text: {'type:display-1': {fontFamily: displayFamily}},
              },
            },
          },
        ],
      },
    });
    const [first, scaleOnly, restore] = theme.__adaptationRules!;
    expect(first.components).toEqual({
      text: {'type:display-1': {fontFamily: 'monospace'}},
      heading: {'level:1': {fontWeight: '300'}},
    });
    expect(scaleOnly.components).toBeUndefined();
    expect(restore.components).toEqual({
      text: {'type:display-1': {fontFamily: displayFamily}},
    });
    const css = generateAdaptationCSS(theme).component;
    expect(css.indexOf('font-family: monospace')).toBeLessThan(
      css.indexOf(`font-family: ${displayFamily}`),
    );
    // Explicit heading defaults still trigger the public weight-prop guard.
    expect(css).toContain(
      '.astryx-heading[data-weight="bold"] { font-weight: var(--font-weight-bold); }',
    );
  });

  it('lets a later generated component leaf win when its root path is absent', () => {
    const theme = defineTheme(
      adaptationInput([
        {
          when: {pointer: 'coarse'},
          value: {components: {text: {'type:body': {fontSize: '2rem'}}}},
        },
        {
          when: {pointer: 'coarse'},
          value: {typography: {scale: {base: 14, ratio: 1.2}}},
        },
      ]),
    );
    expect(theme.__axes.typography).toBeUndefined();
    expect(theme.components).toBeUndefined();
    const [authored, generated] = theme.__adaptationRules!;
    expect(authored.components?.text['type:body'].fontSize).toBe('2rem');
    expect(generated.components?.text['type:body'].fontSize).toBe(
      'var(--text-body-size)',
    );

    // FR4/FR6: only existing root paths suppress generated defaults. Without
    // root wiring, the later scale produces a component write, so it beats the
    // earlier authored leaf when both conditions match (unlike the case above).
    const css = generateAdaptationCSS(theme).component;
    const bodyRules = [
      ...css.matchAll(/\.astryx-text\[data-type="body"\] \{([^}]+)\}/g),
    ].map(match => match[1]);
    expect(bodyRules).toHaveLength(2);
    expect(bodyRules[0]).toContain('font-size: 2rem;');
    expect(bodyRules[1]).toContain('font-size: var(--text-body-size);');
    expect(mediaPreludes(css)).toEqual([
      '(pointer: coarse)',
      '(pointer: coarse)',
    ]);
    expect(generateThemeCSS({...theme, __adaptationRules: undefined})).toEqual(
      generateThemeCSS(theme),
    );
  });

  it('uses the effective child root without mutating inherited components', () => {
    const base = defineTheme(butterShapedInput);
    const before = structuredClone(base.components);
    const child = defineTheme({
      name: 'child-display',
      extends: base,
      components: {
        text: {'type:display-2': {fontFamily: 'serif'}},
        heading: {'level:2': {fontFamily: 'monospace'}},
      },
    });
    expect(child.__adaptationRules![0].components).toBeUndefined();
    expect(child.components?.text['type:display-1'].fontFamily).toBe(
      displayFamily,
    );
    expect(child.components?.text['type:display-2'].fontFamily).toBe('serif');
    expect(child.components?.heading['level:2'].fontFamily).toBe('monospace');
    expect(base.components).toEqual(before);
  });
});

describe('theme-local adaptation values', () => {
  const localName = '--astryx-theme-local-root-control-height';

  it('replaces an enrolled exact name and permits rule references to it', () => {
    const theme = defineTheme({
      name: 'local-root',
      localTokens: {[localName]: '32px'},
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {
              localTokens: {[localName]: '44px'},
              components: {
                button: {base: {minHeight: `var(${localName})`}},
              },
            },
          },
        ],
      },
    });

    expect(theme.__adaptationRules?.[0].localTokens).toEqual({
      [localName]: '44px',
    });
    expect(generateAdaptationCSS(theme).component).toContain(
      `${localName}: 44px`,
    );
  });

  it('does not let a rule enroll or misroute a local name', () => {
    expect(() =>
      defineTheme({
        name: 'rule-enroll',
        adaptations: {
          rules: [
            {
              when: {pointer: 'coarse'},
              value: {
                localTokens: {
                  '--astryx-theme-rule-enroll-new-name': '44px',
                },
              },
            },
          ],
        },
      }),
    ).toThrow(/cannot enroll a theme-local token/);

    expect(() =>
      defineTheme({
        name: 'local-root',
        localTokens: {[localName]: '32px'},
        adaptations: {
          rules: [
            {
              when: {pointer: 'coarse'},
              value: {tokens: {[localName]: '44px'}},
            },
          ],
        },
      } as unknown as DefineThemeInput),
    ).toThrow(/write it through value.localTokens/);
  });

  it('treats an unenrolled prefix-like adaptation token as portable', () => {
    const name = '--astryx-theme-unrelated-owner-control-height';
    const theme = defineTheme({
      name: 'external-rule-token',
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {tokens: {[name]: '44px'}},
          },
        ],
      },
    } as unknown as DefineThemeInput);

    expect(theme.__adaptationRules?.[0].tokens[name]).toBe('44px');
  });

  it('rejects conditional local-token cycles', () => {
    const a = '--astryx-theme-cycle-local-a';
    const b = '--astryx-theme-cycle-local-b';
    expect(() =>
      defineTheme({
        name: 'cycle-local',
        localTokens: {[a]: '1px', [b]: `var(${a})`},
        adaptations: {
          rules: [
            {
              when: {pointer: 'coarse'},
              value: {localTokens: {[a]: `var(${b})`}},
            },
          ],
        },
      }),
    ).toThrow(/Theme token cycle detected/);
  });

  it('rejects a cycle formed only by simultaneously matching rules', () => {
    const a = '--astryx-theme-overlap-cycle-a';
    const b = '--astryx-theme-overlap-cycle-b';

    expect(() =>
      defineTheme({
        name: 'overlap-cycle',
        localTokens: {[a]: '1px', [b]: '2px'},
        adaptations: {
          rules: [
            {
              when: {pointer: 'coarse'},
              value: {localTokens: {[a]: `var(${b})`}},
            },
            {
              when: {contrast: 'more'},
              value: {localTokens: {[b]: `var(${a})`}},
            },
          ],
        },
      }),
    ).toThrow(/overlapping rules \[0, 1\].*cycle detected/i);
  });

  it('rejects cycles routed through portable adaptation tokens', () => {
    const local = '--astryx-theme-portable-cycle-a';
    expect(() =>
      defineTheme({
        name: 'portable-cycle',
        localTokens: {[local]: '1px'},
        tokens: {'--color-background-body': 'white'},
        adaptations: {
          rules: [
            {
              when: {pointer: 'coarse'},
              value: {
                tokens: {'--color-background-body': `var(${local})`},
              },
            },
            {
              when: {contrast: 'more'},
              value: {
                localTokens: {[local]: 'var(--color-background-body)'},
              },
            },
          ],
        },
      }),
    ).toThrow(/overlapping rules \[0, 1\].*cycle detected/i);

    const singleLocal = '--astryx-theme-single-portable-cycle-a';
    expect(() =>
      defineTheme({
        name: 'single-portable-cycle',
        localTokens: {[singleLocal]: '1px'},
        tokens: {'--color-background-body': 'white'},
        adaptations: {
          rules: [
            {
              when: {pointer: 'coarse'},
              value: {
                tokens: {
                  '--color-background-body': `var(${singleLocal})`,
                },
                localTokens: {
                  [singleLocal]: 'var(--color-background-body)',
                },
              },
            },
          ],
        },
      }),
    ).toThrow(/adaptations rule \[0\].*cycle detected/i);

    expect(() =>
      defineTheme({
        name: 'portable-only-cycle',
        tokens: {
          '--color-background-body': 'white',
          '--color-background-surface': 'gray',
        },
        adaptations: {
          rules: [
            {
              when: {pointer: 'coarse'},
              value: {
                tokens: {
                  '--color-background-body': 'var(--color-background-surface)',
                },
              },
            },
            {
              when: {contrast: 'more'},
              value: {
                tokens: {
                  '--color-background-surface': 'var(--color-background-body)',
                },
              },
            },
          ],
        },
      }),
    ).toThrow(/overlapping rules \[0, 1\].*cycle detected/i);
  });

  it('does not attribute an unrelated pre-existing root cycle to a rule', () => {
    expect(() =>
      defineTheme({
        name: 'unrelated-root-cycle',
        tokens: {
          '--color-background-body': 'var(--color-background-surface)',
          '--color-background-surface': 'var(--color-background-body)',
        },
        adaptations: {
          rules: [
            {
              when: {pointer: 'coarse'},
              value: {tokens: {'--spacing-4': '12px'}},
            },
          ],
        },
      }),
    ).not.toThrow();
  });

  it('rejects a rule cycle that shares an edge with a root-only cycle', () => {
    expect(() =>
      defineTheme({
        name: 'shared-cycle-edge',
        tokens: {
          '--color-background-body':
            'linear-gradient(var(--color-background-surface), var(--color-background-muted))',
          '--color-background-surface': 'var(--color-background-card)',
          '--color-background-card': 'var(--color-background-body)',
          '--color-background-muted': 'white',
        },
        adaptations: {
          rules: [
            {
              when: {pointer: 'coarse'},
              value: {
                tokens: {
                  '--color-background-muted': 'var(--color-background-card)',
                },
              },
            },
          ],
        },
      }),
    ).toThrow(/adaptations rule \[0\].*cycle detected/i);
  });

  it('rejects a three-rule cycle that no pair creates', () => {
    const a = '--astryx-theme-three-way-cycle-a';
    const b = '--astryx-theme-three-way-cycle-b';
    const c = '--astryx-theme-three-way-cycle-c';

    expect(() =>
      defineTheme({
        name: 'three-way-cycle',
        localTokens: {[a]: '1px', [b]: '2px', [c]: '3px'},
        adaptations: {
          rules: [
            {
              when: {pointer: 'coarse'},
              value: {localTokens: {[a]: `var(${b})`}},
            },
            {
              when: {contrast: 'more'},
              value: {localTokens: {[b]: `var(${c})`}},
            },
            {
              when: {motion: 'reduce'},
              value: {localTokens: {[c]: `var(${a})`}},
            },
          ],
        },
      }),
    ).toThrow(/overlapping rules \[0, 1, 2\].*cycle detected/i);
  });

  it('allows mutually exclusive writes and a later matching cycle repair', () => {
    const exclusiveA = '--astryx-theme-exclusive-cycle-a';
    const exclusiveB = '--astryx-theme-exclusive-cycle-b';
    expect(() =>
      defineTheme({
        name: 'exclusive-cycle',
        localTokens: {[exclusiveA]: '1px', [exclusiveB]: '2px'},
        adaptations: {
          rules: [
            {
              when: {pointer: 'coarse'},
              value: {localTokens: {[exclusiveA]: `var(${exclusiveB})`}},
            },
            {
              when: {pointer: 'fine'},
              value: {localTokens: {[exclusiveB]: `var(${exclusiveA})`}},
            },
          ],
        },
      }),
    ).not.toThrow();

    const widthA = '--astryx-theme-width-exclusive-cycle-a';
    const widthB = '--astryx-theme-width-exclusive-cycle-b';
    expect(() =>
      defineTheme({
        name: 'width-exclusive-cycle',
        localTokens: {[widthA]: '1px', [widthB]: '2px'},
        adaptations: {
          rules: [
            {
              when: {width: {below: 'md'}},
              value: {localTokens: {[widthA]: `var(${widthB})`}},
            },
            {
              when: {width: {from: 'md'}},
              value: {localTokens: {[widthB]: `var(${widthA})`}},
            },
          ],
        },
      }),
    ).not.toThrow();

    const repairedA = '--astryx-theme-repaired-cycle-a';
    const repairedB = '--astryx-theme-repaired-cycle-b';
    expect(() =>
      defineTheme({
        name: 'repaired-cycle',
        localTokens: {[repairedA]: '1px', [repairedB]: '2px'},
        adaptations: {
          rules: [
            {
              when: {pointer: 'coarse'},
              value: {localTokens: {[repairedA]: `var(${repairedB})`}},
            },
            {
              when: {contrast: 'more'},
              value: {localTokens: {[repairedB]: `var(${repairedA})`}},
            },
            {
              when: {pointer: 'coarse', contrast: 'more'},
              value: {localTokens: {[repairedB]: '4px'}},
            },
          ],
        },
      }),
    ).not.toThrow();
  });

  it('allows a later co-matching rule to repair a cycle from one rule', () => {
    const a = '--astryx-theme-direct-repair-a';
    const b = '--astryx-theme-direct-repair-b';

    expect(() =>
      defineTheme({
        name: 'direct-repair',
        localTokens: {[a]: '1px', [b]: `var(${a})`},
        adaptations: {
          rules: [
            {
              when: {pointer: 'coarse'},
              value: {localTokens: {[a]: `var(${b})`}},
            },
            {
              when: {pointer: 'coarse'},
              value: {localTokens: {[b]: '2px'}},
            },
          ],
        },
      }),
    ).not.toThrow();
  });

  it('checks inherited and child rules in the same reachable cascade', () => {
    const a = '--astryx-theme-cycle-base-a';
    const b = '--astryx-theme-cycle-base-b';
    const base = defineTheme({
      name: 'cycle-base',
      localTokens: {[a]: '1px', [b]: '2px'},
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {localTokens: {[a]: `var(${b})`}},
          },
        ],
      },
    });

    expect(() =>
      defineTheme({
        name: 'cycle-child',
        extends: base,
        adaptations: {
          rules: [
            {
              when: {contrast: 'more'},
              value: {localTokens: {[b]: `var(${a})`}},
            },
          ],
        },
      }),
    ).toThrow(
      /overlapping rules \[0, 1\].*pointer: coarse.*prefers-contrast: more.*cycle detected/i,
    );
  });
});

describe('extension semantics and built metadata', () => {
  it('inherits breakpoint overrides and appends child rules', () => {
    const base = defineTheme({
      name: 'base-order',
      adaptations: {
        widthBreakpoints: {md: 800},
        rules: [
          {
            when: {width: {from: 'md'}},
            value: {tokens: {'--spacing-4': '18px'}},
          },
        ],
      },
    });
    const child = defineTheme({
      name: 'child-order',
      extends: base,
      adaptations: {
        widthBreakpoints: {md: 820},
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {tokens: {'--size-element-md': '44px'}},
          },
        ],
      },
    });

    expect(child.__adaptations.widthBreakpoints.md).toBe(820);
    expect(child.__adaptations.rules).toHaveLength(2);
    expect(mediaPreludes(generateAdaptationCSS(child).component)).toEqual([
      '(width >= 820px)',
      '(pointer: coarse)',
    ]);
  });

  it("re-resolves inherited rules against the child's effective root axis", () => {
    const base = defineTheme({
      name: 'base-axis',
      typography: {scale: {base: 14, ratio: 1.2}},
      adaptations: {
        rules: [
          {
            when: {width: {below: 'sm'}},
            value: {typography: {scale: {base: 16}}},
          },
        ],
      },
    });
    const child = defineTheme({
      name: 'child-axis',
      extends: base,
      typography: {scale: {base: 15, ratio: 1.25}},
    });

    expect(child.__adaptationRules?.[0].tokens['--font-size-lg']).toBe(
      '1.25rem',
    );
  });

  it("merges a child's partial typography axis before re-resolving inherited rules", () => {
    const base = defineTheme({
      name: 'partial-typography-base',
      typography: {
        scale: {base: 14, ratio: 1.25},
        body: {family: 'Inter', fallbacks: 'sans-serif'},
        heading: {family: 'Playfair', fallbacks: 'serif'},
      },
      adaptations: {
        rules: [
          {
            when: {width: {from: 'lg'}},
            value: {typography: {scale: {base: 18}}},
          },
        ],
      },
    });
    const child = defineTheme({
      name: 'partial-typography-child',
      extends: base,
      typography: {body: {family: 'Georgia'}},
    });

    expect(child.__axes.typography?.scale).toEqual({base: 14, ratio: 1.25});
    expect(child.__axes.typography?.body?.family).toBe('Georgia');
    expect(child.__axes.typography?.body?.fallbacks).toBeUndefined();
    expect(child.__axes.typography?.heading?.family).toBeUndefined();
    expect(child.__axes.typography?.heading?.fallbacks).toBeUndefined();
    expect(child.tokens['--font-family-heading']).toBe('Georgia');
    expect(child.__adaptationRules?.[0].tokens['--font-family-body']).toBe(
      'Georgia',
    );
    expect(child.__adaptationRules?.[0].tokens['--font-family-heading']).toBe(
      'Georgia',
    );
    expect(child.__adaptationRules?.[0].tokens['--font-size-lg']).toBe(
      '1.4375rem',
    );
  });

  it('keeps typography weights owned by the last config that declares a scale', () => {
    const rule = {
      when: {width: {from: 'lg' as const}},
      value: {typography: {scale: {base: 18}}},
    };
    const weightedBase = defineTheme({
      name: 'weight-owner-base',
      typography: {
        scale: {base: 14, ratio: 1.25},
        body: {weight: 'medium'},
        heading: {weight: 'bold'},
      },
      adaptations: {rules: [rule]},
    });
    const newScale = defineTheme({
      name: 'weight-owner-new-scale',
      extends: weightedBase,
      typography: {scale: {base: 16, ratio: 1.2}},
    });

    expect(newScale.__adaptationRules?.[0].tokens['--text-body-weight']).toBe(
      newScale.tokens['--text-body-weight'],
    );
    expect(
      newScale.__adaptationRules?.[0].tokens['--text-heading-1-weight'],
    ).toBe(newScale.tokens['--text-heading-1-weight']);

    const defaultBase = defineTheme({
      name: 'weight-owner-default-base',
      typography: {scale: {base: 14, ratio: 1.25}},
      adaptations: {rules: [rule]},
    });
    const weightWithoutScale = defineTheme({
      name: 'weight-owner-no-scale',
      extends: defaultBase,
      typography: {heading: {weight: 'bold'}},
    });

    expect(
      weightWithoutScale.__adaptationRules?.[0].tokens[
        '--text-heading-1-weight'
      ],
    ).toBe(weightWithoutScale.tokens['--text-heading-1-weight']);
  });

  it('ignores a child fallback that has no family, matching root resolution', () => {
    const base = defineTheme({
      name: 'fallback-only-base',
      typography: {
        scale: {base: 14, ratio: 1.25},
        heading: {family: 'Playfair', fallbacks: 'sans-serif'},
      },
      adaptations: {
        rules: [
          {
            when: {width: {from: 'lg'}},
            value: {typography: {scale: {base: 18}}},
          },
        ],
      },
    });
    const child = defineTheme({
      name: 'fallback-only-child',
      extends: base,
      typography: {heading: {fallbacks: 'serif'}},
    });

    expect(child.tokens['--font-family-heading']).toBe('Playfair, sans-serif');
    expect(child.__adaptationRules?.[0].tokens['--font-family-heading']).toBe(
      child.tokens['--font-family-heading'],
    );
  });

  it("uses a child's own color axis when re-resolving inherited rules", () => {
    const rule = {
      when: {contrast: 'more' as const},
      value: {color: {contrast: 'high' as const}},
    };
    const base = defineTheme({
      name: 'partial-color-base',
      color: {accent: '#B7410E'},
      adaptations: {rules: [rule]},
    });
    const child = defineTheme({
      name: 'partial-color-child',
      extends: base,
      color: {neutralStyle: 'warm'},
    });
    const expected = defineTheme({
      name: 'partial-color-expected',
      color: {neutralStyle: 'warm', contrast: 'high'},
    });

    expect(child.__axes.color).toEqual({neutralStyle: 'warm'});
    expect(child.__adaptationRules?.[0].tokens).toEqual(expected.tokens);
  });

  it("keeps inherited rules above the child's root values", () => {
    const base = defineTheme({
      name: 'base-rule',
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {tokens: {'--spacing-4': '12px'}},
          },
        ],
      },
    });
    const child = defineTheme({
      name: 'child-root',
      extends: base,
      tokens: {'--spacing-4': '20px'},
    });

    expect(child.tokens['--spacing-4']).toBe('20px');
    expect(child.__adaptationRules?.[0].tokens['--spacing-4']).toBe('12px');
  });

  it('recomputes inherited rules from built-theme metadata without CSS text', () => {
    const live = defineTheme({
      name: 'built-base',
      typography: {scale: {base: 14, ratio: 1.25}},
      adaptations: {
        widthBreakpoints: {sm: 700},
        rules: [
          {
            when: {width: {below: 'sm'}},
            value: {typography: {scale: {base: 16}}},
          },
        ],
      },
    });
    const built = {
      name: live.name,
      __built: true,
      tokens: live.tokens,
      components: live.components,
      __adaptations: live.__adaptations,
      __axes: live.__axes,
    } as DefinedTheme;

    const child = defineTheme({name: 'built-child', extends: built});
    expect(child.__adaptationRules?.[0].query).toBe('(width < 700px)');
    expect(child.__adaptationRules?.[0].tokens['--font-size-lg']).toBe(
      '1.25rem',
    );
    expect(JSON.stringify(built)).not.toContain('@media');
  });
});

describe('CSS cascade placement', () => {
  it('emits root values, then adaptations, then media-surface overrides', () => {
    const theme = defineTheme({
      name: 'surface-order',
      tokens: {'--color-background-body': '#ffffff'},
      adaptations: {
        rules: [
          {
            when: {contrast: 'more'},
            value: {tokens: {'--color-background-body': '#eeeeee'}},
          },
        ],
      },
      onDark: {tokens: {'--color-background-body': '#111111'}},
    });

    const css = generateThemeCSS(theme).component;
    expect(css.indexOf('#ffffff')).toBeLessThan(css.indexOf('#eeeeee'));
    expect(css.indexOf('#eeeeee')).toBeLessThan(css.lastIndexOf('#111111'));
  });

  it('makes rule shorthand padding override root directional container padding', () => {
    const theme = defineTheme({
      name: 'conditional-container-padding',
      components: {
        card: {base: {paddingBlock: '8px', paddingInline: '16px'}},
        section: {base: {paddingBlock: '10px', paddingInline: '18px'}},
      },
      adaptations: {
        rules: [
          {
            when: {width: {from: 'lg'}},
            value: {
              components: {
                card: {base: {padding: '32px'}},
                section: {base: {padding: '32px'}},
              },
            },
          },
        ],
      },
    });

    const rootCss = generateThemeCSS(theme).component;
    expect(rootCss).toContain('--astryx-card-padding-block-start: 8px');
    expect(rootCss).toContain('--astryx-section-padding-inline: 18px');

    const ruleCss = generateAdaptationCSS(theme).component;
    for (const component of ['card', 'section']) {
      expect(ruleCss).toContain(`--astryx-${component}-padding: 32px`);
      expect(ruleCss).toContain(
        `--astryx-${component}-padding-inline: initial`,
      );
      expect(ruleCss).toContain(
        `--astryx-${component}-padding-inline-start: initial`,
      );
      expect(ruleCss).toContain(
        `--astryx-${component}-padding-inline-end: initial`,
      );
      expect(ruleCss).toContain(
        `--astryx-${component}-padding-block-start: initial`,
      );
      expect(ruleCss).toContain(
        `--astryx-${component}-padding-block-end: initial`,
      );
    }
  });

  it('resets only the more-specific inline siblings for a rule paddingInline write', () => {
    const theme = defineTheme({
      name: 'conditional-inline-padding',
      components: {card: {base: {padding: '16px'}}},
      adaptations: {
        rules: [
          {
            when: {width: {from: 'lg'}},
            value: {components: {card: {base: {paddingInline: '32px'}}}},
          },
        ],
      },
    });

    const ruleCss = generateAdaptationCSS(theme).component;
    expect(ruleCss).toContain('--astryx-card-padding-inline: 32px');
    expect(ruleCss).toContain('--astryx-card-padding-inline-start: initial');
    expect(ruleCss).toContain('--astryx-card-padding-inline-end: initial');
    expect(ruleCss).not.toContain('--astryx-card-padding: initial');
    expect(ruleCss).not.toContain('--astryx-card-padding-block-start: initial');
  });

  it('keeps media-surface component writes above matching adaptations', () => {
    const theme = defineTheme({
      name: 'surface-component-order',
      components: {button: {base: {borderWidth: '1px'}}},
      adaptations: {
        rules: [
          {
            when: {contrast: 'more'},
            value: {components: {button: {base: {borderWidth: '2px'}}}},
          },
        ],
      },
      onDark: {components: {button: {base: {borderWidth: '3px'}}}},
    });

    const css = generateThemeCSS(theme).component;
    expect(css.indexOf('border-width: 1px')).toBeLessThan(
      css.indexOf('border-width: 2px'),
    );
    expect(css.indexOf('border-width: 2px')).toBeLessThan(
      css.lastIndexOf('border-width: 3px'),
    );
  });

  it('keeps JavaScript token reads on root values', () => {
    const theme = defineTheme({
      name: 'css-first',
      tokens: {'--spacing-4': '16px'},
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {tokens: {'--spacing-4': '12px'}},
          },
        ],
      },
    });

    expect(theme.tokens['--spacing-4']).toBe('16px');
    expect(theme.__adaptationRules?.[0].tokens['--spacing-4']).toBe('12px');
  });
});
