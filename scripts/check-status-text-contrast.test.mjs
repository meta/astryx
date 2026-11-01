// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Status role contrast and chroma guard (architecture:theme-tokens INV11).
 *
 * Resolves every status role in Core's defaults and in each first-party theme,
 * including roles the theme leaves for theme generation to derive
 * (architecture:theme-compilation INV17), and checks the INV11 floors in light
 * and dark mode:
 * - `--color-text-<status>` reaches 4.5:1 on the surface and card;
 * - `--color-icon-<status>` and `--color-border-<status>` reach 3:1 there;
 * - `--color-on-<status>` reaches 4.5:1 on the strong fill `--color-<status>`;
 * - `--color-on-<status>-muted` reaches 4.5:1 on the pale fill over the surface;
 * - every status fill and text colour is chromatic.
 * It also pins Core's released fill values.
 *
 * @input Core defaults, the seven first-party theme objects, and theme generation.
 * @output Fails naming the theme, mode, role, and measured value.
 * @position Repo-level guard, sibling of check-muted-status-contrast.
 */

import {describe, expect, it} from 'vitest';
import {
  defineTheme,
  generateAdaptationCSS,
  generateOnMediaCSS,
  generateThemeRules,
  resolveThemeTokens,
} from '../packages/core/dist/theme/index.js';

/** All CSS a theme generates: root rules, adaptations, and media surfaces. */
function allThemeCSS(theme) {
  const text = value =>
    typeof value === 'string'
      ? value
      : Array.isArray(value)
        ? value.map(text).join('\n')
        : value && typeof value === 'object'
          ? Object.values(value).map(text).join('\n')
          : '';
  return [
    generateThemeRules(theme),
    generateAdaptationCSS(theme),
    generateOnMediaCSS(theme),
  ]
    .map(text)
    .join('\n');
}
import {emittedRootTokens} from './lib/theme-emitted-tokens.mjs';
import {
  composite,
  contrastRatio,
  isChromatic,
} from '../packages/core/src/theme/statusColor.ts';
import {parseColor} from '../packages/core/src/utils/color.ts';
import {butterTheme} from '../packages/themes/butter/src/butterTheme.ts';
import {chocolateTheme} from '../packages/themes/chocolate/src/chocolateTheme.ts';
import {gothicTheme} from '../packages/themes/gothic/src/gothicTheme.ts';
import {matchaTheme} from '../packages/themes/matcha/src/matchaTheme.ts';
import {neutralTheme} from '../packages/themes/neutral/src/neutralTheme.ts';
import {stoneTheme} from '../packages/themes/stone/src/stoneTheme.ts';
import {y2kTheme} from '../packages/themes/y2k/src/y2kTheme.ts';

export const THEMES = {
  core: null,
  butter: butterTheme,
  chocolate: chocolateTheme,
  gothic: gothicTheme,
  matcha: matchaTheme,
  neutral: neutralTheme,
  stone: stoneTheme,
  y2k: y2kTheme,
};
const MODES = ['light', 'dark'];
const STATUSES = ['info', 'success', 'warning', 'error'];
const WHITE = {r: 255, g: 255, b: 255, a: 1};

/** Effective tokens for a theme and mode, as the generated CSS sets them. */
export function effectiveTokens(theme, mode) {
  if (theme === null) return resolveThemeTokens(null, {mode});
  const tokens = {...(theme.localTokens ?? {}), ...emittedRootTokens(theme)};
  return resolveThemeTokens({tokens}, {mode});
}

function color(tokens, name) {
  const parsed = parseColor(tokens[name] ?? '');
  if (parsed === null) {
    throw new Error(`${name} does not resolve to a colour: ${tokens[name]}`);
  }
  return parsed;
}

function opaque(c, under) {
  return c.a < 1 ? composite(c, under) : c;
}

const cases = [];
for (const themeName of Object.keys(THEMES)) {
  for (const mode of MODES) cases.push([themeName, mode]);
}

describe('status roles meet the INV11 floors', () => {
  it.each(cases)('%s %s', (themeName, mode) => {
    const t = effectiveTokens(THEMES[themeName], mode);
    const surface = opaque(color(t, '--color-background-surface'), WHITE);
    const card = opaque(color(t, '--color-background-card'), surface);
    const failures = [];
    const check = (label, value, floor) => {
      if (value < floor)
        failures.push(`${label} ${value.toFixed(2)}:1 < ${floor}:1`);
    };
    for (const s of STATUSES) {
      const text = color(t, `--color-text-${s}`);
      check(`text-${s} on surface`, contrastRatio(text, surface), 4.5);
      check(`text-${s} on card`, contrastRatio(text, card), 4.5);
      for (const role of ['icon', 'border']) {
        const c = color(t, `--color-${role}-${s}`);
        check(`${role}-${s} on surface`, contrastRatio(c, surface), 3);
        check(`${role}-${s} on card`, contrastRatio(c, card), 3);
      }
      const fill = opaque(color(t, `--color-${s}`), surface);
      check(
        `on-${s} on ${s}`,
        contrastRatio(color(t, `--color-on-${s}`), fill),
        4.5,
      );
      const pale = opaque(color(t, `--color-${s}-muted`), surface);
      check(
        `on-${s}-muted on ${s}-muted`,
        contrastRatio(color(t, `--color-on-${s}-muted`), pale),
        4.5,
      );
      for (const role of [
        `--color-text-${s}`,
        `--color-${s}`,
        `--color-${s}-muted`,
      ]) {
        if (!isChromatic(color(t, role)))
          failures.push(`${role} is not chromatic: ${t[role]}`);
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('component-scoped status icons and borders keep 3:1 (INV11)', () => {
  // A theme may set its own icon and border roles inside a component scope,
  // such as an input's status rim; those values keep the same 3:1 floor.
  const scoped = [];
  for (const [themeName, theme] of Object.entries(THEMES)) {
    if (theme === null) continue;
    for (const [component, blocks] of Object.entries(theme.components ?? {})) {
      for (const [key, block] of Object.entries(blocks ?? {})) {
        if (!key.startsWith('status:') || typeof block !== 'object') continue;
        for (const [token, value] of Object.entries(block)) {
          if (
            /^--color-(icon|border)-(info|success|warning|error)$/.test(token)
          ) {
            scoped.push([
              `${themeName} ${component} ${key} ${token}`,
              theme,
              value,
            ]);
          }
        }
      }
    }
  }

  it('finds the scoped overrides it checks', () => {
    expect(scoped.length).toBeGreaterThan(0);
  });

  it.each(scoped.map(([label, , value]) => [label, value]))('%s', label => {
    const [, theme, value] = scoped.find(([l]) => l === label);
    for (const mode of MODES) {
      const t = resolveThemeTokens(
        {tokens: {...emittedRootTokens(theme), '--status-probe': value}},
        {mode},
      );
      const surface = opaque(color(t, '--color-background-surface'), WHITE);
      expect(
        contrastRatio(color(t, '--status-probe'), surface),
      ).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('component-scoped pale status fills keep their content at 4.5:1 (INV11)', () => {
  // A theme may repaint a FieldStatus fill in its component map; the content
  // drawn on it (its own colour, or the on-muted role) keeps the 4.5:1 floor.
  const fills = [];
  for (const [themeName, theme] of Object.entries(THEMES)) {
    if (theme === null) continue;
    for (const [key, block] of Object.entries(
      theme.components?.['field-status'] ?? {},
    )) {
      const status = key.replace(/^type:/, '');
      if (typeof block !== 'object' || block.backgroundColor === undefined) {
        continue;
      }
      fills.push([`${themeName} field-status ${key}`, theme, status, block]);
    }
  }

  it.each(fills.map(([label]) => [label]))('%s', label => {
    const [, theme, status, block] = fills.find(([l]) => l === label);
    for (const mode of MODES) {
      const t = resolveThemeTokens(
        {
          tokens: {
            ...emittedRootTokens(theme),
            '--probe-fill': block.backgroundColor,
            '--probe-ink': block.color ?? `var(--color-on-${status}-muted)`,
          },
        },
        {mode},
      );
      const surface = opaque(color(t, '--color-background-surface'), WHITE);
      const fill = opaque(color(t, '--probe-fill'), surface);
      const ink = opaque(color(t, '--probe-ink'), fill);
      expect(contrastRatio(ink, fill)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("Core's released status fills keep their values", () => {
  // Core's released defaults (light, dark).
  const RELEASED = {
    '--color-success': ['#0D8626', '#0D8626'],
    '--color-warning': ['#E9AF08', '#F2C00B'],
    '--color-error': ['#E3193B', '#F5394F'],
  };
  it.each(Object.entries(RELEASED))('%s', (name, [light, dark]) => {
    expect(resolveThemeTokens(null, {mode: 'light'})[name]).toBe(light);
    expect(resolveThemeTokens(null, {mode: 'dark'})[name]).toBe(dark);
  });
});

describe('theme generation derives a complete status set (INV17)', () => {
  const minimal = defineTheme({
    name: 'status-minimal',
    tokens: {
      '--color-info': 'light-dark(#1F6FEB, #79C0FF)',
      '--color-success': 'light-dark(#3FB950, #3FB950)',
      '--color-warning': 'light-dark(#D29922, #D29922)',
      '--color-error': 'light-dark(#F85149, #F85149)',
    },
  });

  it.each(MODES)('meets every floor in %s mode', mode => {
    const t = effectiveTokens(minimal, mode);
    const surface = opaque(color(t, '--color-background-surface'), WHITE);
    for (const s of STATUSES) {
      expect(
        contrastRatio(color(t, `--color-text-${s}`), surface),
      ).toBeGreaterThanOrEqual(4.5);
      const fill = opaque(color(t, `--color-${s}`), surface);
      expect(
        contrastRatio(opaque(color(t, `--color-on-${s}`), fill), fill),
      ).toBeGreaterThanOrEqual(4.5);
      expect(isChromatic(color(t, `--color-text-${s}`))).toBe(true);
    }
  });

  it('keeps the fills the theme sets and derives the content on them', () => {
    const emitted = emittedRootTokens(minimal);
    expect(emitted['--color-success']).toBe('light-dark(#3FB950, #3FB950)');
    for (const s of STATUSES) {
      expect(emitted[`--color-on-${s}`]).toMatch(/^light-dark\(#/);
    }
  });

  it('derives dark content on a light fill', () => {
    const theme = defineTheme({
      name: 'status-light-fill',
      tokens: {'--color-warning': '#F2C00B'},
    });
    for (const mode of MODES) {
      const t = effectiveTokens(theme, mode);
      const fill = opaque(color(t, '--color-warning'), WHITE);
      expect(
        contrastRatio(opaque(color(t, '--color-on-warning'), fill), fill),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('falls back to white or black when the theme content colours miss 4.5:1', () => {
    const theme = defineTheme({
      name: 'status-soft-ink',
      tokens: {
        '--color-success': '#2E9E5B',
        '--color-on-dark': '#E6E6E6',
        '--color-on-light': '#3A3A3A',
      },
    });
    for (const mode of MODES) {
      const t = effectiveTokens(theme, mode);
      const fill = opaque(color(t, '--color-success'), WHITE);
      expect(
        contrastRatio(opaque(color(t, '--color-on-success'), fill), fill),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("falls back to Core's hue for text when a fill is grey", () => {
    const grey = defineTheme({
      name: 'status-grey-success',
      tokens: {'--color-success': 'light-dark(#666666, #AAAAAA)'},
    });
    for (const mode of MODES) {
      const t = effectiveTokens(grey, mode);
      expect(isChromatic(color(t, '--color-text-success'))).toBe(true);
    }
  });

  it('keeps aliases for a fill that is not a concrete colour', () => {
    const theme = defineTheme({
      name: 'status-unresolved',
      tokens: {'--color-success': 'var(--brand-success)'},
    });
    const emitted = emittedRootTokens(theme);
    // Unset here, so Core's own aliases to the hue text token apply.
    expect(emitted).not.toHaveProperty('--color-text-success');
    expect(emitted).not.toHaveProperty('--color-on-success');
    expect(emitted).not.toHaveProperty('--color-on-success-muted');
  });

  it('keeps aliases when a measured surface is not a concrete colour', () => {
    const theme = defineTheme({
      name: 'status-unresolved-card',
      tokens: {
        '--color-success': '#3FB950',
        '--color-background-card': 'var(--host-card)',
      },
    });
    const emitted = emittedRootTokens(theme);
    expect(emitted['--color-text-success'] ?? 'alias').not.toMatch(
      /^light-dark\(#/,
    );
  });

  it('re-derives in an adaptation rule that changes a fill', () => {
    const theme = defineTheme({
      name: 'status-adaptive',
      tokens: {'--color-success': '#3FB950'},
      adaptations: {
        rules: [
          {
            when: {contrast: 'more'},
            value: {tokens: {'--color-success': '#1A7F37'}},
          },
        ],
      },
    });
    const css = allThemeCSS(theme);
    expect(css).toContain('prefers-contrast: more');
    const rule = css.slice(css.indexOf('prefers-contrast: more'));
    expect(rule).toMatch(/--color-text-success: light-dark\(#/);
    expect(rule).toMatch(/--color-on-success: light-dark\(#/);
  });

  it('derives in a rule when only that rule sets a fill', () => {
    const theme = defineTheme({
      name: 'status-rule-only',
      tokens: {},
      adaptations: {
        rules: [
          {
            when: {contrast: 'more'},
            value: {tokens: {'--color-success': '#ABCDEF'}},
          },
        ],
      },
    });
    const css = allThemeCSS(theme);
    const rule = css.slice(css.indexOf('prefers-contrast: more'));
    expect(rule).toMatch(/--color-on-success: light-dark\(#/);
    expect(rule).toContain('--color-icon-success: var(--color-text-success);');
  });

  it('aliases a hue text token a media surface sets, over a derived root role', () => {
    const theme = defineTheme({
      name: 'status-media',
      tokens: {'--color-success': '#3FB950'},
      onDark: {tokens: {'--color-text-green': '#A5F690'}},
    });
    const css = allThemeCSS(theme);
    expect(css).toContain('[data-astryx-media="dark"]');
    const media = css.slice(css.indexOf('[data-astryx-media="dark"]'));
    expect(media).toContain('--color-text-success: var(--color-text-green);');
  });

  it('derives the content on a status fill a media surface sets', () => {
    const theme = defineTheme({
      name: 'status-media-fill',
      onDark: {tokens: {'--color-success': '#7EE787'}},
    });
    const css = allThemeCSS(theme);
    const media = css.slice(css.indexOf('[data-astryx-media="dark"]'));
    const match = media.match(
      /--color-on-success: light-dark\((#[0-9A-F]{6}), (#[0-9A-F]{6})\)/,
    );
    expect(match).not.toBeNull();
    const fill = color({fill: '#7EE787'}, 'fill');
    for (const ink of [match[1], match[2]]) {
      expect(contrastRatio(color({ink}, 'ink'), fill)).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it('re-derives text when a theme changes only a surface', () => {
    const darkCard = defineTheme({
      name: 'status-surface-only',
      tokens: {
        '--color-background-surface': '#101010',
        '--color-background-card': '#101010',
      },
    });
    for (const mode of MODES) {
      const t = effectiveTokens(darkCard, mode);
      const surface = opaque(color(t, '--color-background-surface'), WHITE);
      for (const status of STATUSES) {
        expect(
          contrastRatio(color(t, `--color-text-${status}`), surface),
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('resolves every fixture the same way in JavaScript as in its CSS', () => {
    const fixtures = [
      minimal,
      defineTheme({
        name: 'js-grey-base',
        tokens: {'--color-success': 'light-dark(#666666, #AAAAAA)'},
      }),
      defineTheme({
        name: 'js-unresolved-source',
        tokens: {'--color-success': 'var(--brand-success)'},
      }),
      defineTheme({
        name: 'js-unresolved-card',
        tokens: {
          '--color-success': '#3FB950',
          '--color-background-card': 'var(--host-card)',
        },
      }),
      defineTheme({
        name: 'js-child',
        extends: defineTheme({
          name: 'js-parent',
          tokens: {'--color-text-success': '#0A5C2E'},
        }),
        tokens: {'--color-error': '#D1242F'},
      }),
    ];
    for (const theme of fixtures) {
      for (const mode of MODES) {
        const fromCss = effectiveTokens(theme, mode);
        const fromJs = resolveThemeTokens(theme, {mode});
        for (const status of STATUSES) {
          for (const role of [
            `--color-text-${status}`,
            `--color-icon-${status}`,
            `--color-border-${status}`,
            `--color-on-${status}`,
            `--color-on-${status}-muted`,
          ]) {
            expect([theme.name, mode, role, fromJs[role]]).toEqual([
              theme.name,
              mode,
              role,
              fromCss[role],
            ]);
          }
        }
      }
    }
  });

  it('aliases icon and border roles to a text role that is itself an alias', () => {
    const theme = defineTheme({
      name: 'status-hue-text-only',
      tokens: {'--color-text-green': '#0A5C2E'},
    });
    const emitted = emittedRootTokens(theme);
    expect(emitted['--color-text-success']).toBe('var(--color-text-green)');
    expect(emitted['--color-icon-success']).toBe('var(--color-text-success)');
    expect(emitted['--color-border-success']).toBe('var(--color-text-success)');
  });

  it('counts a role inherited through extends as set', () => {
    const parent = defineTheme({
      name: 'status-parent',
      tokens: {'--color-success': '#3FB950', '--color-text-success': '#0A5C2E'},
    });
    const child = defineTheme({
      name: 'status-child',
      extends: parent,
      tokens: {'--color-error': '#D1242F'},
    });
    const emitted = emittedRootTokens(child);
    expect(emitted['--color-text-success']).toBe('#0A5C2E');
    expect(emitted['--color-icon-success']).toBe('var(--color-text-success)');
  });

  it('never derives a fill or a pale fill', () => {
    const emitted = emittedRootTokens(minimal);
    for (const s of STATUSES) {
      expect(emitted[`--color-${s}`]).toBe(minimal.tokens[`--color-${s}`]);
      expect(emitted).not.toHaveProperty(`--color-${s}-muted`);
    }
  });

  it('keeps a value the theme sets, and icon and border follow it', () => {
    const theme = defineTheme({
      name: 'status-set-text',
      tokens: {
        '--color-success': '#3FB950',
        '--color-text-success': '#123456',
      },
    });
    const emitted = emittedRootTokens(theme);
    expect(emitted['--color-text-success']).toBe('#123456');
    expect(emitted['--color-icon-success']).toBe('var(--color-text-success)');
    expect(emitted['--color-border-success']).toBe('var(--color-text-success)');
  });

  it('does not alias an icon or border role the theme sets', () => {
    const theme = defineTheme({
      name: 'status-set-icon',
      tokens: {
        '--color-text-success': '#123456',
        '--color-icon-success': '#0A5C2E',
      },
    });
    const emitted = emittedRootTokens(theme);
    expect(emitted['--color-icon-success']).toBe('#0A5C2E');
    expect(emitted['--color-border-success']).toBe('var(--color-text-success)');
  });
});
