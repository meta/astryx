// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file statusRoleDefaults.test.ts
 * @input generatedScopedStatusRoleDefaults over representative theme tokens
 *   and adaptation rules
 * @output The root status roles a theme leaves unset: derived values, aliases
 *   to their sources, cycle-safe skips, and one canonical order
 * @position Unit test of packages/core/src/theme/statusRoleDefaults.ts
 */

import {describe, expect, it} from 'vitest';
import {generatedScopedStatusRoleDefaults} from './statusRoleDefaults';
import type {ResolvedThemeAdaptationRule} from './themeAdaptations';

const MORE_CONTRAST: Pick<ResolvedThemeAdaptationRule, 'when' | 'query'> = {
  when: {contrast: 'more'},
  query: '(prefers-contrast: more)',
};

describe('generatedScopedStatusRoleDefaults', () => {
  it('returns nothing for a theme that sets no status source', () => {
    expect(generatedScopedStatusRoleDefaults({})).toEqual([]);
  });

  it('aliases each unset role to the source the theme sets', () => {
    expect(
      generatedScopedStatusRoleDefaults({
        '--color-text-blue': '#0000ff',
        '--color-text-error': 'red',
        '--duration-fast': '90ms',
      }),
    ).toMatchInlineSnapshot(`
      [
        [
          "--color-text-info",
          "var(--color-text-blue)",
        ],
        [
          "--color-on-info-muted",
          "var(--color-text-blue)",
        ],
        [
          "--color-icon-info",
          "var(--color-text-info)",
        ],
        [
          "--color-icon-error",
          "var(--color-text-error)",
        ],
        [
          "--color-border-info",
          "var(--color-text-info)",
        ],
        [
          "--color-border-error",
          "var(--color-text-error)",
        ],
        [
          "--duration-exit",
          "var(--duration-fast)",
        ],
      ]
    `);
  });

  it('derives unset roles from a status colour against the theme surface', () => {
    expect(
      generatedScopedStatusRoleDefaults({
        '--color-info': '#0066ff',
        '--color-background-surface': '#ffffff',
      }),
    ).toMatchInlineSnapshot(`
      [
        [
          "--color-on-info",
          "light-dark(#FFFFFF, #FFFFFF)",
        ],
        [
          "--color-on-info-muted",
          "light-dark(#045AE1, #1359CF)",
        ],
        [
          "--color-on-success-muted",
          "light-dark(#0D7521, #02711C)",
        ],
        [
          "--color-on-warning-muted",
          "light-dark(#88650B, #7F6513)",
        ],
        [
          "--color-on-error-muted",
          "light-dark(#C0072E, #BD0C31)",
        ],
      ]
    `);
  });

  it('resolves a source through the theme local tokens', () => {
    expect(
      generatedScopedStatusRoleDefaults(
        {'--color-text-green': 'var(--brand-green)'},
        {'--brand-green': '#008800'},
      ),
    ).toMatchInlineSnapshot(`
      [
        [
          "--color-text-success",
          "var(--color-text-green)",
        ],
        [
          "--color-on-success-muted",
          "var(--color-text-green)",
        ],
        [
          "--color-icon-success",
          "var(--color-text-success)",
        ],
        [
          "--color-border-success",
          "var(--color-text-success)",
        ],
      ]
    `);
  });

  it('skips an alias that closes a cycle at the root or in an adaptation', () => {
    expect(
      generatedScopedStatusRoleDefaults(
        {
          '--color-text-blue': 'var(--color-text-info)',
          '--color-text-green': '#00aa00',
          '--color-text-red': '#cc0000',
        },
        {},
        [
          {
            ...MORE_CONTRAST,
            tokens: {'--color-text-green': 'var(--color-text-success)'},
          },
        ],
      ),
    ).toMatchInlineSnapshot(`
      [
        [
          "--color-text-error",
          "var(--color-text-red)",
        ],
        [
          "--color-on-info-muted",
          "var(--color-text-blue)",
        ],
        [
          "--color-on-success-muted",
          "var(--color-text-green)",
        ],
        [
          "--color-on-error-muted",
          "var(--color-text-red)",
        ],
        [
          "--color-icon-error",
          "var(--color-text-error)",
        ],
        [
          "--color-border-error",
          "var(--color-text-error)",
        ],
      ]
    `);
  });
});
