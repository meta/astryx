// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file dynamicType.test.ts
 * @input vitest, dynamicType.ts, the UIKit typography table, defineTheme and
 *   generateThemeCSS
 * @output Proves the Dynamic Type rules: Body's size names the reader's
 *   category; each raw font-size step scales exactly on its UIKit curve, in
 *   order, and is the theme's own size at Large; every theme writes its sizes
 *   that way at its root and in its adaptation rules, with no option and no
 *   reference cycle; and the root sync reads a hidden probe and adopts a
 *   stylesheet with the category's scales, writing nothing on `<html>`
 * @position Testing; validates theme/dynamicType.ts and its use in
 *   generateThemeRules.ts without a browser (the iOS evidence is the
 *   simulator's)
 */

import fs from 'node:fs';
import path from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {typography} from './uikitTypography';
import {defineTheme, generateThemeCSS} from './defineTheme';
import {generateOnMediaCSS} from './generateThemeRules';
import {
  FONT_SIZE_STEP_STYLES,
  TEXT_SIZE_CATEGORIES,
  dynamicTypeScale,
  dynamicTypeScaleProperty,
  dynamicTypeScaleRule,
  scaledFontSizeEntries,
  scaledStepProperty,
  syncReaderTextSize,
  textSizeCategoryForBodySize,
  type DynamicTypeStyle,
} from './dynamicType';
import {textSizeDefaults} from './tokens.stylex';

const STYLES = Object.keys(typography) as DynamicTypeStyle[];

/** A `rem` or `px` length, in px (16px to the rem). */
function lengthInPx(value: string | undefined): number {
  const match = /^(-?[\d.]+)(rem|px)$/.exec(value ?? '');
  if (match == null) {
    throw new Error(`not a length: ${value}`);
  }
  return Number(match[1]) * (match[2] === 'rem' ? 16 : 1);
}

/**
 * What the browser computes for emitted custom properties at one category,
 * in px, aligned with `entries`: each expression evaluated (min, max, calc of
 * a length times a category scale, variables with their fallbacks), resolving
 * each variable by name. A reference cycle, which a browser would compute to
 * nothing, throws.
 */
function computedSizes(
  entries: ReadonlyArray<readonly [string, string]>,
  category: (typeof TEXT_SIZE_CATEGORIES)[number],
): number[] {
  const expressions = new Map(entries);
  const scales = new Map<string, number>();
  for (const style of STYLES) {
    scales.set(
      dynamicTypeScaleProperty(style),
      dynamicTypeScale(style, category),
    );
  }
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const resolve = (name: string, fallback: string | undefined): number => {
    const scale = scales.get(name);
    if (scale !== undefined) {
      return scale;
    }
    const known = memo.get(name);
    if (known !== undefined) {
      return known;
    }
    const expression = expressions.get(name);
    if (expression === undefined) {
      if (fallback === undefined) {
        throw new Error(`unset ${name}`);
      }
      return evaluate(fallback);
    }
    if (visiting.has(name)) {
      throw new Error(`reference cycle through ${name}`);
    }
    visiting.add(name);
    const value = evaluate(expression.replace(/\s*!important$/, ''));
    visiting.delete(name);
    memo.set(name, value);
    return value;
  };
  const evaluate = (source: string): number => {
    let at = 0;
    const read = (text: string) => {
      if (!source.startsWith(text, at)) {
        throw new Error(`expected "${text}" at ${at} in ${source}`);
      }
      at += text.length;
    };
    const skipSpaces = () => {
      while (source[at] === ' ') {
        at += 1;
      }
    };
    const term = (): number => {
      skipSpaces();
      for (const [name, pick] of [
        ['min(', Math.min],
        ['max(', Math.max],
      ] as const) {
        if (source.startsWith(name, at)) {
          read(name);
          const first = term();
          read(',');
          const second = term();
          skipSpaces();
          read(')');
          return pick(first, second);
        }
      }
      if (source.startsWith('calc(', at)) {
        read('calc(');
        const left = term();
        skipSpaces();
        read('*');
        const right = term();
        skipSpaces();
        read(')');
        return left * right;
      }
      if (source.startsWith('var(', at)) {
        read('var(');
        let depth = 1;
        let end = at;
        while (depth > 0) {
          if (source[end] === '(') {
            depth += 1;
          } else if (source[end] === ')') {
            depth -= 1;
          }
          end += 1;
        }
        const inner = source.slice(at, end - 1);
        at = end;
        const comma = inner.indexOf(',');
        return comma === -1
          ? resolve(inner.trim(), undefined)
          : resolve(
              inner.slice(0, comma).trim(),
              inner.slice(comma + 1).trim(),
            );
      }
      const match = /^-?[\d.]+(rem|px)?/.exec(source.slice(at));
      if (match == null) {
        throw new Error(`unexpected input at ${at} in ${source}`);
      }
      at += match[0].length;
      return match[1] === undefined ? Number(match[0]) : lengthInPx(match[0]);
    };
    const value = term();
    skipSpaces();
    if (at !== source.length) {
      throw new Error(`trailing input at ${at} in ${source}`);
    }
    return value;
  };
  return entries.map(([name]) => resolve(name, undefined));
}

/** The emitted entries' computed sizes at one category, by name. */
function sizesByName(
  entries: ReadonlyArray<readonly [string, string]>,
  category: (typeof TEXT_SIZE_CATEGORIES)[number],
): Record<string, number> {
  const sizes = computedSizes(entries, category);
  return Object.fromEntries(entries.map(([name], i) => [name, sizes[i]]));
}

describe('the reader text size category', () => {
  it('has one category per column of the UIKit table, Large fourth', () => {
    for (const style of STYLES) {
      expect(typography[style]).toHaveLength(TEXT_SIZE_CATEGORIES.length);
    }
    expect(TEXT_SIZE_CATEGORIES[3]).toBe('l');
  });

  it('is named by the size of Body alone', () => {
    TEXT_SIZE_CATEGORIES.forEach((category, index) => {
      expect(textSizeCategoryForBodySize(typography.body[index])).toBe(
        category,
      );
    });
    // Sub-pixel rounding of a computed size still names the category.
    expect(textSizeCategoryForBodySize(17.2)).toBe('l');
  });

  it('names nothing for a size Safari does not produce', () => {
    expect(textSizeCategoryForBodySize(18)).toBeNull();
    expect(textSizeCategoryForBodySize(16.5)).toBeNull();
    expect(textSizeCategoryForBodySize(Number.NaN)).toBeNull();
  });
});

describe('the UIKit point sizes', () => {
  // Every row names where its values come from, and a measurement names its
  // subject, the iOS version and the date.
  const MEASURED =
    /^@source measured: .*iOS \d.*(\b20\d\d-\d\d-\d\d\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? 20\d\d\b)/;
  const SOURCE_KINDS =
    /^@source (apple-docs https:\/\/developer\.apple\.com\/|wwdc \d{4}-\d+ |webkit Source\/|measured: .*iOS \d|GUESS — )/;

  /** Each row's key and the `@source` tags of the JSDoc block above it. */
  function rowSources(): Map<string, string[]> {
    const text = fs.readFileSync(
      path.resolve(__dirname, 'uikitTypography.ts'),
      'utf8',
    );
    const body = text.slice(text.indexOf('export const typography = {'));
    const rows = new Map<string, string[]>();
    const pattern = /\/\*\*([\s\S]*?)\*\/\s*(\w+): \[/g;
    for (const match of body.matchAll(pattern)) {
      const doc = (match[1] ?? '')
        .split('\n')
        .map(line => line.replace(/^\s*\*\s?/, ''))
        .join('\n');
      // A tag continues on the following lines until the next tag.
      const tags = doc
        .split(/\n(?=@)/)
        .map(tag => tag.replace(/\s*\n\s*/g, ' ').trim())
        .filter(tag => tag.startsWith('@source'));
      rows.set(match[2] ?? '', tags);
    }
    return rows;
  }

  it('names a source for every row, and the iOS version and date of every measurement', () => {
    const rows = rowSources();
    expect([...rows.keys()].sort()).toEqual(STYLES.slice().sort());
    for (const [style, tags] of rows) {
      expect(tags.length, style).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(tag, style).toMatch(SOURCE_KINDS);
        if (tag.startsWith('@source measured:')) {
          expect(tag, style).toMatch(MEASURED);
        }
      }
    }
  });
});

describe('the UIKit curves', () => {
  it('maps every raw font-size step to a UIKit text style', () => {
    expect(Object.keys(FONT_SIZE_STEP_STYLES).sort()).toEqual(
      Object.keys(textSizeDefaults).sort(),
    );
    for (const style of Object.values(FONT_SIZE_STEP_STYLES)) {
      expect(STYLES).toContain(style);
    }
  });

  it('leaves every size alone at Large', () => {
    for (const style of STYLES) {
      expect(dynamicTypeScale(style, 'l')).toBe(1);
    }
  });

  it('turns a Large size into the UIKit size at every category', () => {
    // A theme step that equals the style's Large size lands on UIKit's own
    // size everywhere: UIFontMetrics' rule for custom fonts.
    for (const style of STYLES) {
      const large = typography[style][3];
      TEXT_SIZE_CATEGORIES.forEach((category, index) => {
        expect(large * dynamicTypeScale(style, category)).toBeCloseTo(
          typography[style][index],
          10,
        );
      });
    }
    expect(dynamicTypeScale('body', 'ax5')).toBeCloseTo(53 / 17, 10);
    expect(dynamicTypeScale('largeTitle', 'xs')).toBeCloseTo(31 / 34, 10);
  });

  it('gives the page a category its scales on :root, Large and an unnamed size none', () => {
    expect(dynamicTypeScaleRule('l')).toBe('');
    expect(dynamicTypeScaleRule(null)).toBe('');
    const ax5 = dynamicTypeScaleRule('ax5');
    expect(ax5).toMatch(/\n:root \{\n {2}--_dynamic-type-/);
    expect(ax5).toContain(`${dynamicTypeScaleProperty('body')}: 3.1176;`);
    expect(ax5).toContain(`${dynamicTypeScaleProperty('largeTitle')}: 1.7647;`);
    expect(dynamicTypeScaleProperty('largeTitle')).toBe(
      '--_dynamic-type-large-title',
    );
  });

  it('scales only the raw font-size steps it is given at a length, each capped by the next', () => {
    expect(
      scaledFontSizeEntries({
        '--font-size-base': '1rem',
        '--font-size-5xl': '2.625rem',
        '--spacing-4': '1rem',
      }),
    ).toEqual([
      // Each step's scaled size is private; the step reads it.
      [
        '--_scaled-font-size-base',
        'min(calc(1rem * var(--_dynamic-type-body, 1)), max(var(--_scaled-font-size-lg, 1rem), 1rem))',
      ],
      ['--font-size-base', 'var(--_scaled-font-size-base)'],
      // The largest step has nothing above it.
      [
        '--_scaled-font-size-5xl',
        'calc(2.625rem * var(--_dynamic-type-large-title, 1))',
      ],
      ['--font-size-5xl', 'var(--_scaled-font-size-5xl)'],
    ]);
    // A step written as a variable or relative to its parent follows what it
    // reads, and the step below it is not capped by it.
    expect(
      scaledFontSizeEntries({
        '--font-size-base': '1rem',
        '--font-size-lg': 'var(--font-size-base)',
        '--font-size-xl': '1.25em',
      }),
    ).toEqual([
      ['--_scaled-font-size-base', 'calc(1rem * var(--_dynamic-type-body, 1))'],
      ['--font-size-base', 'var(--_scaled-font-size-base)'],
    ]);
  });

  it('keeps every ramp in order at every category, and its own sizes at Large', () => {
    // The ramps a theme gets from `typography.scale`: the neutral phone
    // profile, and the dense, default and airy starting points. A tight ramp
    // is the hard case: below Large, Body shrinks faster than Footnote (17 to
    // 14 against 13 to 12 at xs), so supporting text could pass body text.
    const ramps = [
      {base: 16, ratio: 1.1736},
      {base: 12, ratio: 1.125},
      {base: 14, ratio: 1.2},
      {base: 16, ratio: 1.25},
    ];
    const steps = Object.keys(FONT_SIZE_STEP_STYLES);
    for (const scale of ramps) {
      const theme = defineTheme({
        name: `dt-ramp-${scale.base}-${scale.ratio}`,
        typography: {scale},
      });
      const entries = scaledFontSizeEntries(theme.tokens);
      expect(
        entries.map(([name]) => name).filter(name => !name.startsWith('--_')),
      ).toEqual(steps);
      const own = steps.map(name => lengthInPx(theme.tokens[name]));
      for (const category of TEXT_SIZE_CATEGORIES) {
        const byName = sizesByName(entries, category);
        const sizes = steps.map(name => byName[name]);
        const ramp = `${scale.base}/${scale.ratio} at ${category}`;
        for (let index = 1; index < steps.length; index += 1) {
          expect(
            sizes[index],
            `${steps[index]}, ${ramp}`,
          ).toBeGreaterThanOrEqual(sizes[index - 1] - 1e-9);
        }
        if (category === 'l') {
          sizes.forEach((size, index) => {
            expect(size, `${steps[index]}, ${ramp}`).toBeCloseTo(own[index], 9);
          });
        }
      }
    }
    // Uncapped, heading 2 (Title 2) would pass heading 1 (Title 1) at AX5.
    const own = (index: number) => 16 * 1.1736 ** (index - 5);
    expect(own(7) * dynamicTypeScale('title2', 'ax5')).toBeGreaterThan(
      own(8) * dynamicTypeScale('title1', 'ax5'),
    );
  });
});

describe('every theme follows the reader text size', () => {
  /**
   * The value of `property` that wins where the media queries `holds` accepts
   * hold: the last declaration whose media queries all hold. Every declaration
   * a theme emits sits in its own scope at the same specificity, so source
   * order decides.
   */
  const winning = (
    css: string,
    property: string,
    holds: (query: string) => boolean,
  ): string | undefined => {
    const open: string[] = [];
    let value: string | undefined;
    for (const raw of css.split('\n')) {
      const line = raw.trim();
      if (line.endsWith('{') && !line.includes('}')) {
        open.push(line);
      } else if (line === '}') {
        open.pop();
      } else if (line.startsWith(`${property}:`)) {
        const media = open
          .filter(rule => rule.startsWith('@media '))
          .map(rule => rule.slice('@media '.length, -1).trim());
        if (media.every(holds)) {
          value = line.slice(property.length + 1, -1).trim();
        }
      }
    }
    return value;
  };
  const nowhere = () => false;
  const scaled = (name: string, value: string) =>
    `${name === '--font-size-5xl' ? '' : 'min('}calc(${value} * var(${dynamicTypeScaleProperty(FONT_SIZE_STEP_STYLES[name as keyof typeof FONT_SIZE_STEP_STYLES])}, 1))`;

  it('writes every font-size step a theme sets scaled, branded included, keeping its family', () => {
    for (const theme of [
      defineTheme({
        name: 'dt-scale',
        typography: {scale: {base: 15, ratio: 1.25}},
      }),
      defineTheme({
        name: 'dt-brand',
        typography: {
          scale: {base: 16, ratio: 1.2},
          body: {family: 'Outfit', fallbacks: 'sans-serif'},
        },
      }),
    ]) {
      const css = generateThemeCSS(theme).component;
      for (const name of Object.keys(textSizeDefaults)) {
        const value = theme.tokens[name];
        expect(value).toBeDefined();
        const step = scaledStepProperty(
          name as keyof typeof FONT_SIZE_STEP_STYLES,
        );
        expect(
          winning(css, step, nowhere)?.startsWith(scaled(name, value)),
        ).toBe(true);
        expect(winning(css, name, nowhere)).toBe(`var(${step})`);
      }
      // Only sizes follow the reader: no family, line height, spacing or
      // anything else reads a scale.
      const readers = [
        ...css.matchAll(/(--[a-z0-9_-]+|[a-z-]+): [^;]*--_dynamic-type-/g),
      ].map(match => match[1]);
      expect(readers.length).toBeGreaterThan(0);
      expect(
        readers.every(name =>
          /^--(_scaled-font-size-|text-[a-z0-9-]+-size$)/.test(name),
        ),
      ).toBe(true);
    }
    expect(
      winning(
        generateThemeCSS(
          defineTheme({
            name: 'dt-brand-family',
            typography: {body: {family: 'Outfit', fallbacks: 'sans-serif'}},
          }),
        ).component,
        '--font-family-body',
        nowhere,
      ),
    ).toContain('Outfit');
  });

  it('leaves a theme that sets no type scale on the sizes it inherits, already scaled', () => {
    // A nested theme with no type scale of its own keeps the outer theme's
    // sizes; at the top of the page they are the core defaults, which the
    // root stylesheet scales below every theme.
    const css = generateThemeCSS(
      defineTheme({name: 'dt-colors-only', tokens: {'--color-accent': 'red'}}),
    ).component;
    for (const name of Object.keys(textSizeDefaults)) {
      expect(winning(css, name, nowhere)).toBeUndefined();
    }
    const rule = dynamicTypeScaleRule('ax5');
    expect(rule.startsWith('@layer astryx-base {\n:root {')).toBe(true);
    for (const [name, value] of Object.entries(textSizeDefaults)) {
      const step = scaledStepProperty(
        name as keyof typeof FONT_SIZE_STEP_STYLES,
      );
      expect(rule).toContain(`  ${step}: ${scaled(name, value)}`);
      expect(rule).toContain(`  ${name}: var(${step});`);
    }
  });

  it('scales the sizes a theme writes for media surfaces (onDark, onLight)', () => {
    // A MediaTheme surface re-declares the theme's onDark or onLight tokens on
    // a descendant; written raw, they would undo the reader's text size there.
    const theme = defineTheme({
      name: 'dt-media',
      typography: {scale: {base: 14, ratio: 1.2}},
      onDark: {tokens: {'--font-size-base': '15px'}},
      onLight: {tokens: {'--text-supporting-size': '12px'}},
    });
    const css = generateOnMediaCSS(theme);
    const block = (surface: string) => {
      const start = css.indexOf(`[data-astryx-media="${surface}"] {`);
      expect(start, surface).toBeGreaterThan(-1);
      return css.slice(start, css.indexOf('}', start));
    };
    expect(block('dark')).toContain(
      '--_scaled-font-size-base: min(calc(15px * var(--_dynamic-type-body, 1)), max(var(--_scaled-font-size-lg, 15px), 15px));',
    );
    expect(block('dark')).toContain(
      '--font-size-base: var(--_scaled-font-size-base);',
    );
    expect(block('dark')).not.toMatch(/--font-size-base: 15px/);
    expect(block('light')).toContain(
      '--text-supporting-size: calc(12px * var(--_dynamic-type-footnote, 1));',
    );
  });

  it('adds no theme option, prop or document attribute', () => {
    defineTheme({
      name: 'dt-no-option',
      // @ts-expect-error following the reader text size is not an option
      typography: {dynamicType: true},
    });
    const css = generateThemeCSS(
      defineTheme({
        name: 'dt-attr',
        typography: {scale: {base: 14, ratio: 1.2}},
      }),
    ).component;
    // The theme reads only the private scales the root Theme provides.
    expect(css).not.toContain('data-astryx-text-size');
    expect(css).not.toMatch(/:root/);
  });

  it('scales the sizes an adaptation rule writes inside its own condition', () => {
    const theme = defineTheme({
      name: 'dt-phone',
      typography: {scale: {base: 14, ratio: 1.2}},
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse', width: {below: 'lg'}},
            value: {typography: {scale: {base: 16, ratio: 1.1736}}},
          },
        ],
      },
    });
    const css = generateThemeCSS(theme).component;
    const phone = (query: string) => query.includes('pointer: coarse');
    // A full ramp in order: each step is capped at the next one's scaled size.
    expect(winning(css, '--_scaled-font-size-base', phone)).toBe(
      'min(calc(1rem * var(--_dynamic-type-body, 1)), var(--_scaled-font-size-lg))',
    );
    expect(winning(css, '--_scaled-font-size-base', nowhere)).toBe(
      'min(calc(0.875rem * var(--_dynamic-type-body, 1)), var(--_scaled-font-size-lg))',
    );
    expect(winning(css, '--font-size-base', phone)).toBe(
      'var(--_scaled-font-size-base)',
    );
  });

  it('scales a size the theme fixes on the curve of the step it reads', () => {
    // Butter, Stone and Y2K fix supporting text at 12px. Supporting text reads
    // --font-size-sm by default, so the fixed size scales like Footnote
    // instead of staying 12px while every step grows.
    const theme = defineTheme({
      name: 'dt-fixed',
      tokens: {'--text-supporting-size': '12px'},
    });
    const css = generateThemeCSS(theme).component;
    const value = winning(css, '--text-supporting-size', nowhere);
    expect(value).toBe('calc(12px * var(--_dynamic-type-footnote, 1))');
    for (const category of TEXT_SIZE_CATEGORIES) {
      expect(
        computedSizes([['--text-supporting-size', value ?? '']], category)[0],
      ).toBeCloseTo(12 * dynamicTypeScale('footnote', category), 6);
    }
  });

  it('keeps the size each adaptation rule writes, scaling it when the rule fixes it', () => {
    // Butter and Stone's shape: a fixed size at the root, and a phone rule
    // whose scale turns it back into a step.
    const theme = defineTheme({
      name: 'dt-fixed-rules',
      typography: {scale: {base: 14, ratio: 1.25}},
      tokens: {'--text-supporting-size': '12px'},
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse', width: {below: 'lg'}},
            value: {typography: {scale: {base: 16, ratio: 1.2225}}},
          },
          {
            when: {pointer: 'fine'},
            value: {tokens: {'--text-supporting-size': '13px'}},
          },
        ],
      },
    });
    const css = generateThemeCSS(theme).component;
    const phone = (query: string) => query.includes('pointer: coarse');
    const mouse = (query: string) => query.includes('pointer: fine');
    // Outside every rule, the root's fixed size scales.
    expect(winning(css, '--text-supporting-size', nowhere)).toBe(
      'calc(12px * var(--_dynamic-type-footnote, 1))',
    );
    // On a phone the rule's step wins, and the step itself scales.
    expect(winning(css, '--text-supporting-size', phone)).toBe(
      'var(--font-size-sm)',
    );
    // A rule that fixes the size gets it scaled inside its own condition.
    expect(winning(css, '--text-supporting-size', mouse)).toBe(
      'calc(13px * var(--_dynamic-type-footnote, 1))',
    );
  });

  /**
   * The custom properties that win where `holds` accepts every media query,
   * with any `!important` dropped.
   */
  const winningAll = (
    css: string,
    holds: (query: string) => boolean,
  ): Map<string, string> => {
    const names = new Set(
      [...css.matchAll(/^\s*(--[a-z0-9_-]+):/gim)].map(match => match[1]),
    );
    const out = new Map<string, string>();
    for (const name of names) {
      const value = winning(css, name, holds);
      if (value !== undefined) {
        out.set(name, value.replace(/\s*!important$/, ''));
      }
    }
    return out;
  };
  /** The first reference cycle among the winning custom properties, if any. */
  const cycleIn = (properties: Map<string, string>): string[] | null => {
    const state = new Map<string, 'open' | 'done'>();
    const visit = (name: string, path: string[]): string[] | null => {
      if (state.get(name) === 'done' || !properties.has(name)) {
        return null;
      }
      if (state.get(name) === 'open') {
        return [...path.slice(path.indexOf(name)), name];
      }
      state.set(name, 'open');
      for (const [, next] of (properties.get(name) ?? '').matchAll(
        /var\((--[a-z0-9_-]+)/g,
      )) {
        const found = visit(next, [...path, name]);
        if (found) {
          return found;
        }
      }
      state.set(name, 'done');
      return null;
    };
    for (const name of properties.keys()) {
      const found = visit(name, []);
      if (found) {
        return found;
      }
    }
    return null;
  };
  const fontSizes = (properties: Map<string, string>) =>
    [...properties].filter(([name]) => /^--(_scaled-)?font-size-/.test(name));

  it('follows a step a theme writes as a variable, with no reference cycle', () => {
    // A scale whose large text is body text: the step follows what it reads,
    // unscaled, so nothing scales twice and no cap reads it back.
    const theme = defineTheme({
      name: 'dt-alias',
      typography: {scale: {base: 14, ratio: 1.2}},
      tokens: {'--font-size-lg': 'var(--font-size-base)'},
    });
    const css = generateThemeCSS(theme).component;
    expect(winning(css, '--font-size-lg', nowhere)).toBe(
      'var(--font-size-base)',
    );
    expect(winning(css, '--_scaled-font-size-lg', nowhere)).toBeUndefined();
    // Body text, whose next step is now a variable, scales uncapped.
    expect(winning(css, '--_scaled-font-size-base', nowhere)).toBe(
      'calc(0.875rem * var(--_dynamic-type-body, 1))',
    );
    const properties = winningAll(css, nowhere);
    expect(cycleIn(properties)).toBeNull();
    // Evaluated: the theme's own sizes at Large, its order at AX5.
    const large = sizesByName(fontSizes(properties), 'l');
    expect(large['--font-size-base']).toBeCloseTo(14, 9);
    expect(large['--font-size-lg']).toBeCloseTo(14, 9);
    expect(large['--font-size-sm']).toBeCloseTo(
      lengthInPx(theme.tokens['--font-size-sm']),
      9,
    );
    const ax5 = sizesByName(fontSizes(properties), 'ax5');
    expect(ax5['--font-size-lg']).toBeCloseTo(ax5['--font-size-base'], 9);
    expect(ax5['--font-size-sm']).toBeLessThanOrEqual(
      ax5['--font-size-base'] + 1e-9,
    );
  });

  it('closes no reference cycle when an adaptation rule aliases a step the root writes at a length', () => {
    // A fixed ramp at the root, and a phone rule that makes large text body
    // text: on a phone the root's cap on body text reads the private scaled
    // size, never the rule's alias, so the two blocks form no loop.
    const theme = defineTheme({
      name: 'dt-alias-rule',
      typography: {scale: {base: 14, ratio: 1.2}},
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse', width: {below: 'lg'}},
            value: {tokens: {'--font-size-lg': 'var(--font-size-base)'}},
          },
        ],
      },
    });
    const css = generateThemeCSS(theme).component;
    const phone = (query: string) => query.includes('pointer: coarse');
    expect(winning(css, '--font-size-lg', phone)).toBe('var(--font-size-base)');
    for (const holds of [nowhere, phone]) {
      const properties = winningAll(css, holds);
      expect(cycleIn(properties)).toBeNull();
      for (const category of TEXT_SIZE_CATEGORIES) {
        expect(() =>
          sizesByName(fontSizes(properties), category),
        ).not.toThrow();
      }
      expect(
        sizesByName(fontSizes(properties), 'l')['--font-size-base'],
      ).toBeCloseTo(14, 9);
    }
  });

  it('emits no reference cycle with a step aliased at the root and its neighbour aliased in a rule', () => {
    const steps = Object.keys(FONT_SIZE_STEP_STYLES);
    const coarse = (query: string) => query.includes('pointer: coarse');
    const themes = [
      defineTheme({name: 'dt-acyclic-plain'}),
      defineTheme({
        name: 'dt-acyclic-scale',
        typography: {scale: {base: 15, ratio: 1.25}},
      }),
      // Each step aliased to the one below at the root, the next one aliased
      // to it in a rule.
      ...steps.slice(1).map((name, at) =>
        defineTheme({
          name: `dt-acyclic-alias-${at + 1}`,
          typography: {scale: {base: 14, ratio: 1.2}},
          tokens: {[name]: `var(${steps[at]})`},
          adaptations: {
            rules:
              at + 2 < steps.length
                ? [
                    {
                      when: {pointer: 'coarse'},
                      value: {tokens: {[steps[at + 2]]: `var(${name})`}},
                    },
                  ]
                : [],
          },
        }),
      ),
      // A fixed ramp at the root and each step aliased to the one below in a
      // rule (the cross-block case, at every position).
      ...steps.slice(1).map((name, at) =>
        defineTheme({
          name: `dt-acyclic-rule-alias-${at + 1}`,
          typography: {scale: {base: 14, ratio: 1.2}},
          adaptations: {
            rules: [
              {
                when: {pointer: 'coarse'},
                value: {tokens: {[name]: `var(${steps[at]})`}},
              },
            ],
          },
        }),
      ),
    ];
    for (const theme of themes) {
      const css = generateThemeCSS(theme).component;
      for (const holds of [nowhere, coarse]) {
        expect(cycleIn(winningAll(css, holds)), theme.name).toBeNull();
      }
    }
    expect(
      cycleIn(winningAll(dynamicTypeScaleRule('ax5'), nowhere)),
    ).toBeNull();
  });

  it('keeps !important outside the scaling expression, on a fixed size and on a step', () => {
    // `!important` inside calc() makes the value invalid where it is used, so
    // the text would fall back to its parent's size in every browser.
    const css = generateThemeCSS(
      defineTheme({
        name: 'dt-important',
        tokens: {
          '--text-supporting-size': '12px !important',
          '--font-size-base': '1rem !important',
        },
      }),
    ).component;
    expect(winning(css, '--text-supporting-size', nowhere)).toBe(
      'calc(12px * var(--_dynamic-type-footnote, 1)) !important',
    );
    const [[, plain]] = scaledFontSizeEntries({'--font-size-base': '1rem'});
    expect(winning(css, '--_scaled-font-size-base', nowhere)).toBe(plain);
    expect(winning(css, '--font-size-base', nowhere)).toBe(
      'var(--_scaled-font-size-base) !important',
    );
    // The importance does not hide a length from the order check.
    expect(
      scaledFontSizeEntries({
        '--font-size-sm': '0.75rem',
        '--font-size-base': '0.875rem !important',
      }),
    ).toEqual([
      [
        '--_scaled-font-size-sm',
        'min(calc(0.75rem * var(--_dynamic-type-footnote, 1)), var(--_scaled-font-size-base))',
      ],
      ['--font-size-sm', 'var(--_scaled-font-size-sm)'],
      [
        '--_scaled-font-size-base',
        'min(calc(0.875rem * var(--_dynamic-type-body, 1)), max(var(--_scaled-font-size-lg, 0.875rem), 0.875rem))',
      ],
      ['--font-size-base', 'var(--_scaled-font-size-base) !important'],
    ]);
    for (const name of ['--text-supporting-size', '--_scaled-font-size-base']) {
      expect(
        winning(css, name, nowhere)?.replace(/ !important$/, ''),
        name,
      ).not.toContain('!important');
    }
  });

  it('scales only fixed sizes: a size that reads a variable or its parent is never scaled twice', () => {
    const tokens = {
      '--text-supporting-size': '0.75rem',
      '--text-heading-6-size': 'clamp(10px, 1vw + 6px, 12px)',
      '--text-heading-5-size': 'var(--font-size-xs)',
      '--text-label-size': 'calc(var(--font-size-base) + 1px)',
      '--text-code-size': '0.9em',
      '--text-large-size': '110%',
    };
    const css = generateThemeCSS(
      defineTheme({name: 'dt-fixed-only', tokens}),
    ).component;
    expect(winning(css, '--text-supporting-size', nowhere)).toBe(
      'calc(0.75rem * var(--_dynamic-type-footnote, 1))',
    );
    expect(winning(css, '--text-heading-6-size', nowhere)).toBe(
      'calc(clamp(10px, 1vw + 6px, 12px) * var(--_dynamic-type-caption1, 1))',
    );
    // The others keep what the theme wrote: a step already follows the
    // reader, and em or % follows the parent's size.
    for (const name of [
      '--text-heading-5-size',
      '--text-label-size',
      '--text-code-size',
      '--text-large-size',
    ] as const) {
      expect(winning(css, name, nowhere)).toBe(tokens[name]);
    }
  });

  it('lets a set size replace the phone base, smaller or larger, and scales the pinned role too', () => {
    // neutral's shape: a 14/1.2 scale whose phone rule moves the base to 16px
    // and pins Display 1 at its desktop 42px (design:mobile-typography DR1,
    // DR2). A size the reader set replaces that base and lifts the pin.
    const theme = defineTheme({
      name: 'dt-phone-profile',
      typography: {scale: {base: 14, ratio: 1.2}},
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse', width: {below: 'lg'}},
            value: {typography: {scale: {base: 16, ratio: 1.1736}}},
          },
        ],
      },
    });
    const phone = (
      theme as unknown as {
        __adaptationRules: {tokens: Record<string, string>}[];
      }
    ).__adaptationRules[0].tokens;
    const entries = scaledFontSizeEntries(phone);
    const at = (category: (typeof TEXT_SIZE_CATEGORIES)[number]) => {
      const sizes = computedSizes(entries, category);
      return Object.fromEntries(entries.map(([name], i) => [name, sizes[i]]));
    };
    // No size set: the phone base and the pinned Display 1 are the theme's.
    expect(at('l')['--font-size-base']).toBeCloseTo(16, 6);
    expect(at('l')['--font-size-5xl']).toBeCloseTo(42, 6);
    // A smaller size goes below the 16px base, a larger one above it.
    expect(at('xs')['--font-size-base']).toBeCloseTo((16 * 14) / 17, 6);
    expect(at('ax5')['--font-size-base']).toBeCloseTo((16 * 53) / 17, 6);
    // The pinned role scales too.
    expect(at('ax5')['--font-size-5xl']).toBeCloseTo((42 * 60) / 34, 6);
  });

  it('keeps the iOS text-entry floor: the root font size never changes, so text inputs stay at 16px', () => {
    // Only custom properties change, the root's font size never
    // (design:mobile-typography DR4): the page's rule declares nothing else.
    const rule = dynamicTypeScaleRule('xs');
    for (const line of rule.split('\n').filter(l => l.includes(':'))) {
      expect(line.trim().startsWith('--') || line.startsWith(':root')).toBe(
        true,
      );
    }
    // TextInput's iOS floor is 1rem, which therefore stays 16px however small
    // body text gets (family:input-fields FR9).
    const textInput = fs.readFileSync(
      path.resolve(__dirname, '../TextInput/TextInput.tsx'),
      'utf8',
    );
    expect(textInput).toContain(
      "`max(1rem, ${typeScaleVars['--text-body-size']})`",
    );
  });
});

describe('the root sync', () => {
  const html = document.documentElement;
  let observerCallback: (() => void) | null = null;
  let probeSize = '17px';

  /** A stylesheet as the sync can see one: its whole text. */
  class FakeSheet {
    text = '';
    replaceSync(text: string) {
      this.text = text;
    }
  }

  /**
   * An engine as the sync can see it: whether it provides
   * `font: -apple-system-body` (the capability), whether it has a touch
   * callout (an iOS idiom the sync must not look at), and whether it can
   * construct a stylesheet for the document to adopt.
   */
  function pretendEngine({
    textSize,
    touchCallout = textSize,
    constructable = true,
  }: {
    textSize: boolean;
    touchCallout?: boolean;
    constructable?: boolean;
  }) {
    vi.stubGlobal('CSS', {
      supports: vi.fn((property: string, value?: string) =>
        property === 'font' && value === '-apple-system-body'
          ? textSize
          : property === '-webkit-touch-callout'
            ? touchCallout
            : false,
      ),
    });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          observerCallback = callback;
        }
        observe() {}
        disconnect() {
          observerCallback = null;
        }
      },
    );
    vi.stubGlobal('CSSStyleSheet', constructable ? FakeSheet : undefined);
    Object.defineProperty(document, 'adoptedStyleSheets', {
      configurable: true,
      writable: true,
      value: constructable ? [] : undefined,
    });
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(element =>
      element instanceof HTMLElement &&
      element.hasAttribute('data-astryx-text-size-probe')
        ? ({fontSize: probeSize} as CSSStyleDeclaration)
        : real(element),
    );
  }

  /** The page's scales, from the stylesheets the document adopted. */
  const adoptedText = () =>
    ((document.adoptedStyleSheets ?? []) as unknown as FakeSheet[])
      .map(sheet => sheet.text)
      .join('');
  const htmlAttributes = () => html.getAttributeNames().sort().join(' ');

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (document as {adoptedStyleSheets?: unknown}).adoptedStyleSheets;
    probeSize = '17px';
  });

  // The gate is the capability alone, never a platform idiom (one touch
  // behavior on every touch device).
  it('does nothing where the engine has no font: -apple-system-body, touch callout or not', () => {
    pretendEngine({textSize: false, touchCallout: true});
    expect(syncReaderTextSize(document)).toBeUndefined();
    expect(document.querySelector('[data-astryx-text-size-probe]')).toBeNull();
    expect(document.adoptedStyleSheets).toEqual([]);
  });

  it('follows the reader text size wherever the engine provides it, with no platform check', () => {
    pretendEngine({textSize: true, touchCallout: false});
    probeSize = '23px';
    const cleanup = syncReaderTextSize(document);
    expect(adoptedText()).toBe(dynamicTypeScaleRule('xxxl'));
    expect(adoptedText()).toContain(
      `${dynamicTypeScaleProperty('body')}: 1.3529;`,
    );
    cleanup?.();
  });

  it('scales nothing where the keyword follows no reader setting (a fixed 13px Body, as on a Mac)', () => {
    pretendEngine({textSize: true, touchCallout: false});
    probeSize = '13px';
    const cleanup = syncReaderTextSize(document);
    expect(cleanup).toBeTypeOf('function');
    expect(adoptedText()).toBe('');
    cleanup?.();
  });

  it('writes the scales, follows a change and cleans up, with an empty probe and nothing on <html>', () => {
    pretendEngine({textSize: true});
    const before = htmlAttributes();
    probeSize = '23px';
    const cleanup = syncReaderTextSize(document);
    const probe = document.querySelector<HTMLElement>(
      '[data-astryx-text-size-probe]',
    );
    // A hidden box, 1em square, that renders no text.
    expect(probe?.getAttribute('aria-hidden')).toBe('true');
    expect(probe?.style.getPropertyValue('visibility')).toBe('hidden');
    expect(probe?.style.getPropertyValue('inline-size')).toBe('1em');
    expect(probe?.textContent).toBe('');
    expect(adoptedText()).toBe(dynamicTypeScaleRule('xxxl'));

    // The reader moves the slider while the page is open: the probe resizes.
    probeSize = '53px';
    observerCallback?.();
    expect(adoptedText()).toBe(dynamicTypeScaleRule('ax5'));

    // A size that names no category clears the scales rather than guessing.
    probeSize = '18px';
    observerCallback?.();
    expect(adoptedText()).toBe('');
    expect(htmlAttributes()).toBe(before);

    cleanup?.();
    expect(document.adoptedStyleSheets).toEqual([]);
    expect(document.querySelector('[data-astryx-text-size-probe]')).toBeNull();
    expect(observerCallback).toBeNull();
  });

  it('does nothing where the engine cannot construct a stylesheet', () => {
    pretendEngine({textSize: true, constructable: false});
    probeSize = '53px';
    expect(syncReaderTextSize(document)).toBeUndefined();
    expect(document.querySelector('[data-astryx-text-size-probe]')).toBeNull();
    expect(document.querySelector('style')?.textContent ?? '').not.toContain(
      '--_dynamic-type-',
    );
  });
});
