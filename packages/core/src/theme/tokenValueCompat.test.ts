// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The token-value acceptance boundary between the root and adaptation
 * paths.
 *
 * `TokenValue` is a compile-time contract only. Themes reach `defineTheme`
 * through casts, broad spreads, generated objects and plain JavaScript, so
 * values outside that type genuinely arrive at runtime — and historically the
 * root path accepted them: a two-element array became `light-dark()`, and
 * anything else passed through untouched.
 *
 * Extracting the resolver into `resolveThemeValues` made it throw on all of
 * them, which turned working non-adaptation themes into hard failures. These
 * tests pin the boundary that fixes it:
 *
 * - the ROOT/legacy path keeps its historical acceptance, verbatim;
 * - values authored inside an ADAPTATION rule are validated strictly, because
 *   that surface is new and has no acceptance to preserve;
 * - theme-LOCAL tokens keep the strict validation they shipped with (#5844),
 *   which predates this and is not part of the boundary.
 */

import {describe, expect, it} from 'vitest';
import {defineTheme, generateThemeCSS} from './defineTheme';
import {resolveTokenValue} from './resolveThemeValues';

/** Exactly what the pre-extraction implementation did with each shape. */
const LEGACY_ACCEPTED: [string, unknown, unknown][] = [
  ['a number', 16, 16],
  ['zero', 0, 0],
  ['a boolean', false, false],
  ['null', null, null],
  ['a three-element array', ['a', 'b', 'c'], 'light-dark(a, b)'],
  ['a one-element array', ['a'], 'light-dark(a, undefined)'],
];

describe('root token values keep their historical acceptance', () => {
  it.each(LEGACY_ACCEPTED)('accepts %s', (_label, value, expected) => {
    const theme = defineTheme({
      name: 'legacy',
      tokens: {'--color-background-body': value as string},
    });

    expect(theme.tokens['--color-background-body']).toBe(expected);
    expect(generateThemeCSS(theme).component).toContain(
      `--color-background-body: ${String(expected)};`,
    );
  });

  it('still resolves the documented shapes', () => {
    const theme = defineTheme({
      name: 'documented',
      tokens: {
        '--color-background-body': '#fff',
        '--color-text-primary': ['#000', '#fff'],
      },
    });

    expect(theme.tokens['--color-background-body']).toBe('#fff');
    expect(theme.tokens['--color-text-primary']).toBe('light-dark(#000, #fff)');
  });

  it('builds a whole non-adaptation theme carrying an out-of-type token', () => {
    // The regression in the wild: a theme with no adaptations at all, whose
    // tokens came through a cast or a spread, stopped building entirely.
    const spread = {'--spacing-4': 12} as unknown as Record<string, string>;

    const theme = defineTheme({
      name: 'legacy-spread',
      tokens: {'--color-background-body': '#fff', ...spread},
      components: {button: {base: {borderRadius: '4px'}}},
    });

    expect(theme.name).toBe('legacy-spread');
    expect(theme.tokens['--spacing-4']).toBe(12);
    expect(theme.components?.button).toEqual({base: {borderRadius: '4px'}});
  });

  it('keeps accepting them through `extends`', () => {
    const base = defineTheme({
      name: 'legacy-base',
      tokens: {'--color-background-body': 16 as unknown as string},
    });

    const child = defineTheme({
      name: 'legacy-child',
      extends: base,
      tokens: {'--color-accent': '#09f'},
    });

    expect(child.tokens['--color-background-body']).toBe(16);
    expect(child.tokens['--color-accent']).toBe('#09f');
  });

  it('keeps accepting them on an on-media surface', () => {
    const theme = defineTheme({
      name: 'legacy-on-media',
      tokens: {'--color-background-body': '#fff'},
      onDark: {tokens: {'--color-background-body': 0 as unknown as string}},
    });

    expect(theme.__onDark?.tokens['--color-background-body']).toBe(0);
  });
});

describe('adaptation-authored token values are validated', () => {
  it.each(LEGACY_ACCEPTED)('rejects %s inside a rule', (_label, value) => {
    expect(() =>
      defineTheme({
        name: 'adaptive',
        tokens: {'--color-background-body': '#fff'},
        adaptations: {
          rules: [
            {
              when: {pointer: 'coarse'},
              value: {tokens: {'--color-background-body': value as string}},
            },
          ],
        },
      }),
    ).toThrow(/must be CSS strings or \[light, dark\] string tuples/);
  });

  it('accepts the documented shapes inside a rule', () => {
    const theme = defineTheme({
      name: 'adaptive-ok',
      tokens: {'--color-background-body': '#fff'},
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {
              tokens: {
                '--size-element-md': '44px',
                '--color-border': ['#000', '#fff'],
              },
            },
          },
        ],
      },
    });

    const rule = theme.__adaptationRules?.[0];
    expect(rule?.tokens?.['--size-element-md']).toBe('44px');
    expect(rule?.tokens?.['--color-border']).toBe('light-dark(#000, #fff)');
  });

  it('does not let a lenient ROOT value weaken its own rules', () => {
    // One theme, both surfaces: the root keeps its out-of-type value and the
    // rule beside it is still rejected.
    expect(() =>
      defineTheme({
        name: 'mixed',
        tokens: {'--color-background-body': 16 as unknown as string},
        adaptations: {
          rules: [
            {
              when: {contrast: 'more'},
              value: {tokens: {'--color-border': 32 as unknown as string}},
            },
          ],
        },
      }),
    ).toThrow(/must be CSS strings or \[light, dark\] string tuples/);
  });
});

describe('resolveTokenValue', () => {
  it('is lenient by default', () => {
    expect(resolveTokenValue(16 as unknown as string)).toBe(16);
  });

  it('throws only when asked to be strict', () => {
    expect(() =>
      resolveTokenValue(16 as unknown as string, {strict: true}),
    ).toThrow(/must be CSS strings or \[light, dark\] string tuples/);
  });

  it('resolves documented shapes identically in both modes', () => {
    for (const strict of [false, true]) {
      expect(resolveTokenValue('#fff', {strict})).toBe('#fff');
      expect(resolveTokenValue(['#000', '#fff'], {strict})).toBe(
        'light-dark(#000, #fff)',
      );
    }
  });
});

describe('theme-local tokens keep their own pre-existing strictness', () => {
  it('rejects a malformed local token value', () => {
    // Not part of this boundary: local tokens shipped strict in #5844, before
    // adaptations existed, so nothing here may loosen them.
    expect(() =>
      defineTheme({
        name: 'local',
        tokens: {'--color-background-body': '#fff'},
        localTokens: {
          '--astryx-theme-local-brand-fill': 16 as unknown as string,
        },
      }),
    ).toThrow(/must be a CSS string or a \[light, dark\] string tuple/);
  });
});
