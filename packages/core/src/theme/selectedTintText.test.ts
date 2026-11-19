// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file selectedTintText.test.ts
 * @input selectedTintText.ts, Core's default tokens and sample themes
 * @output Holds the derived secondary text on the accent tint to 4.5:1 on
 *   every ground, at rest and hovered; Core's precomputed value to the
 *   derivation; and the compiler's output of it
 * @position Unit evidence for the selected-tint derivation
 */

import {describe, expect, it} from 'vitest';
import {composite, contrastRatio, parseConcreteColor} from './statusColor';
import {resolveModes} from './statusRoleDerivation';
import {
  CARD_FILLS,
  coreSelectedTintText,
  deriveSelectedTintText,
} from './selectedTintText';
import {selectedTintTextVars} from './selectedTintText.stylex';
import fs from 'node:fs';
import path from 'node:path';
import {defineTheme} from './defineTheme';
import {generateThemeCSS} from './generateThemeRules';
import {colorDefaults} from './tokens.stylex';

const pair = (value: string | null): [string, string] => {
  const match = /^light-dark\((#[0-9a-f]{6}), (#[0-9a-f]{6})\)$/i.exec(
    String(value),
  );
  if (match == null) {
    throw new Error(`not a light-dark pair: ${value}`);
  }
  return [match[1], match[2]];
};

const WHITE = {r: 255, g: 255, b: 255, a: 1};

/** The lowest ratio of `text` on the tint and its hover over each ground. */
function lowestRatio(
  tokens: Record<string, string>,
  text: [string, string],
  fill?: string,
): number {
  const resolved = resolveModes(tokens);
  let lowest = Infinity;
  (['light', 'dark'] as const).forEach((mode, index) => {
    const at = (name: string) => {
      const color = parseConcreteColor(resolved[mode][name]);
      if (color === null) {
        throw new Error(`${name} is not concrete`);
      }
      return color;
    };
    const over = (top: ReturnType<typeof at>, under: typeof WHITE) =>
      top.a < 1 ? composite(top, under) : top;
    const page = over(at('--color-background-body'), WHITE);
    const surface = over(at('--color-background-surface'), page);
    const grounds =
      fill === undefined
        ? [page, surface, over(at('--color-background-card'), surface)]
        : [page, surface].map(ground => over(at(fill), ground));
    const ink = parseConcreteColor(text[index]);
    if (ink === null) {
      throw new Error('text is not concrete');
    }
    for (const ground of grounds) {
      const selected = over(at('--color-accent-muted'), ground);
      for (const backdrop of [
        selected,
        over(at('--color-overlay-hover'), selected),
      ]) {
        lowest = Math.min(lowest, contrastRatio(ink, backdrop));
      }
    }
  });
  return lowest;
}

/** A theme whose secondary text falls under 4.5:1 on its tint in dark. */
const LOW: Record<string, [string, string]> = {
  '--color-text-secondary': ['#4f4f4f', '#9e9e9e'],
  '--color-accent-muted': ['#e2e2e2', '#474747'],
  '--color-background-body': ['#ffffff', '#111111'],
};

describe('secondary text on the accent tint', () => {
  it("is Core's precomputed value for Core's tokens", () => {
    expect(selectedTintTextVars['--_selected-text-secondary']).toBeDefined();
    const core = coreSelectedTintText();
    expect(core).toBe('light-dark(#4A5C6B, #B0B5BB)');
    expect(
      lowestRatio(colorDefaults as Record<string, string>, pair(core)),
    ).toBeGreaterThanOrEqual(4.5);
  });

  /** Core's value for a Card variant, as selectedTintText.stylex.ts writes it. */
  const cardDefault = (variant: string) =>
    new RegExp(`'--_selected-text-secondary-${variant}': '([^']*)'`).exec(
      fs.readFileSync(
        path.join(
          process.cwd(),
          'packages/core/src/theme/selectedTintText.stylex.ts',
        ),
        'utf8',
      ),
    )?.[1];

  it("is Core's precomputed value inside each Card variant", () => {
    const tokens = colorDefaults as Record<string, string>;
    for (const [variant, fill] of Object.entries(CARD_FILLS)) {
      const measured =
        deriveSelectedTintText(tokens, {}, {}, {kind: 'fill-and-page', fill}) ??
        deriveSelectedTintText(tokens, {}, {}, {kind: 'fill', fill});
      expect(cardDefault(variant), variant).toBe(measured);
    }
  });

  it("moves the theme's secondary until it reads on the tint and its hover", () => {
    const theme = defineTheme({name: 'low', tokens: LOW});
    const value = deriveSelectedTintText(theme.tokens, theme.localTokens);
    expect(
      lowestRatio({...colorDefaults, ...theme.tokens}, pair(value)),
    ).toBeGreaterThanOrEqual(4.5);
    // Dark mode lifts the grey; it does not pick another hue.
    const [, dark] = pair(value);
    expect(dark.slice(1, 3)).toBe(dark.slice(3, 5));
  });

  it("keeps the theme's secondary where it already reads", () => {
    const theme = defineTheme({
      name: 'reads',
      tokens: {'--color-text-secondary': ['#000000', '#ffffff']},
    });
    expect(deriveSelectedTintText(theme.tokens, theme.localTokens)).toBe(
      'light-dark(#000000, #FFFFFF)',
    );
  });

  it("measures a card's own fill inside that card", () => {
    const theme = defineTheme({
      name: 'card',
      tokens: {'--color-background-blue': ['#dbe1ff', '#dbe1ff']},
    });
    const card = {'--color-text-secondary': '#605f52'};
    const value = deriveSelectedTintText(
      theme.tokens,
      theme.localTokens,
      card,
      {kind: 'fill', fill: '--color-background-blue'},
    );
    expect(
      lowestRatio(
        {...colorDefaults, ...theme.tokens, ...card},
        pair(value),
        '--color-background-blue',
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('writes the value on the scope of a theme that sets a colour it reads', () => {
    const css = generateThemeCSS(
      defineTheme({name: 'low', tokens: LOW}),
    ).component;
    expect(css).toMatch(/:scope \{[^}]*--_selected-text-secondary: light-dark/);
    const plain = generateThemeCSS(
      defineTheme({name: 'plain', tokens: {'--radius-element': '4px'}}),
    ).component;
    expect(plain).not.toContain('--_selected-text-secondary');
  });

  it("keeps the theme's own secondary text on the tint where it cannot be measured", () => {
    for (const secondary of ['oklch(55% 0.02 250)', '#0000008A']) {
      const css = generateThemeCSS(
        defineTheme({
          name: 'unmeasured',
          tokens: {'--color-text-secondary': secondary},
        }),
      ).component;
      expect(css, secondary).toMatch(
        /:scope \{[^}]*--_selected-text-secondary: var\(--color-text-secondary\);/,
      );
      expect(css, secondary).toMatch(
        /:scope \{[^}]*--_selected-text-secondary-blue: var\(--color-text-secondary\);/,
      );
    }
  });

  it('writes every Card variant for a theme that sets a colour it reads, and only a variant whose fill it sets otherwise', () => {
    const css = generateThemeCSS(
      defineTheme({name: 'low-cards', tokens: LOW}),
    ).component;
    for (const variant of Object.keys(CARD_FILLS)) {
      expect(css, variant).toMatch(
        new RegExp(
          `:scope \\{[^}]*--_selected-text-secondary-${variant}: light-dark`,
        ),
      );
    }
    const blueOnly = generateThemeCSS(
      defineTheme({
        name: 'blue-only',
        tokens: {'--color-background-blue': ['#1d4ed8', '#1e3a8a']},
      }),
    ).component;
    expect(blueOnly).toMatch(
      /:scope \{[^}]*--_selected-text-secondary-blue: light-dark/,
    );
    expect(blueOnly).not.toContain('--_selected-text-secondary-gray');
  });

  it('measures again inside a rule that sets secondary text, on its own fill', () => {
    const css = generateThemeCSS(
      defineTheme({
        name: 'cards',
        tokens: LOW,
        components: {
          card: {'variant:blue': {'--color-text-secondary': '#605f52'}},
        },
      }),
    ).component;
    expect(css).toMatch(
      /\.astryx-card\[data-variant="blue"\] \{[^}]*--_selected-text-secondary: light-dark/,
    );
  });

  it("keeps the measured text on a tinted row over a theme's own row text, unless the theme keys its own on the state", () => {
    const striped = {
      striped: {':nth-child(even)': {'--color-text-secondary': '#605f52'}},
    };
    const css = generateThemeCSS(
      defineTheme({
        name: 'rows',
        tokens: LOW,
        components: {'table-row': striped},
      }),
    ).component;
    expect(css).toContain(
      '.astryx-table-row[data-striped="striped"]:nth-child(even)[data-selected="selected"] {\n    --color-text-secondary: var(--_selected-text-secondary);',
    );
    const own = generateThemeCSS(
      defineTheme({
        name: 'own-rows',
        tokens: LOW,
        components: {
          'table-row': {
            ...striped,
            selected: {'--color-text-secondary': '#123456'},
          },
        },
      }),
    ).component;
    expect(own).not.toContain('var(--_selected-text-secondary)');
    expect(own).toMatch(
      /\.astryx-table-row\[data-selected="selected"\] \{\n {4}--color-text-secondary: #123456;/,
    );
  });

  it('measures a Card-wide rule on each variant and a part rule on every Card fill', () => {
    const theme = defineTheme({
      name: 'card-wide',
      tokens: {},
      components: {
        card: {base: {'--color-text-secondary': '#6b6b6b'}},
        item: {base: {'--color-text-secondary': '#6b6b6b'}},
      },
    });
    const css = generateThemeCSS(theme).component;
    // No one page-measured value on every Card over its variant's entry.
    expect(css).not.toMatch(
      /\.astryx-card[^{,]*\{[^}]*--_selected-text-secondary:/,
    );
    const tokens = {
      ...(colorDefaults as Record<string, string>),
      '--color-text-secondary': '#6b6b6b',
    };
    for (const [variant, fill] of Object.entries(CARD_FILLS)) {
      const entry = new RegExp(
        `--_selected-text-secondary-${variant}: (light-dark\\([^;]*\\));`,
      ).exec(css)?.[1];
      expect(entry, variant).toBeDefined();
      expect(
        lowestRatio(tokens, pair(entry ?? null), fill),
        variant,
      ).toBeGreaterThanOrEqual(4.5);
    }
    const onItem =
      /\.astryx-item[^{]*\{[^}]*--_selected-text-secondary: (light-dark\([^;]*\));/.exec(
        css,
      )?.[1];
    expect(onItem).toBeDefined();
    expect(lowestRatio(tokens, pair(onItem ?? null))).toBeGreaterThanOrEqual(
      4.5,
    );
    for (const [variant, fill] of Object.entries(CARD_FILLS)) {
      expect(
        lowestRatio(tokens, pair(onItem ?? null), fill),
        variant,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("measures again on a Card variant's fill where the page's text there changes", () => {
    // A translucent tint shows the card's fill through it.
    const tokens = {
      ...LOW,
      '--color-accent-muted': ['#00000014', '#ffffff1f'],
      '--color-background-orange': ['#f0b070', '#f0b070'],
    } satisfies Record<string, [string, string]>;
    const theme = defineTheme({name: 'orange', tokens});
    const css = generateThemeCSS(theme).component;
    const onOrange =
      /--_selected-text-secondary-orange: (light-dark\([^;]*\));/.exec(
        css,
      )?.[1];
    expect(onOrange).toBeDefined();
    expect(
      lowestRatio(
        {...colorDefaults, ...theme.tokens},
        pair(onOrange ?? null),
        '--color-background-orange',
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
