// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Color-mode style blocks in component overrides
 * @input defineTheme component maps with `@light`/`@dark` blocks
 * @output Assertions on the generated theme CSS and on the merge rule
 * @position packages/core/src/theme — unit evidence for color-mode blocks
 */

import {describe, expect, it} from 'vitest';
import {defineTheme} from './defineTheme';
import {generateThemeCSS} from './generateThemeRules';
import {deepMergeComponents} from './mergeComponents';

const css = (components: Parameters<typeof defineTheme>[0]['components']) =>
  generateThemeCSS(defineTheme({name: 'modes', components})).component;

describe('color-mode blocks', () => {
  it('writes a theme without them exactly as before', () => {
    const plain = css({button: {base: {backgroundColor: 'red'}}});
    expect(plain).not.toMatch(/prefers-color-scheme|data-theme=/);
  });

  it("applies a block only in its mode: the root's mode, the system preference, and a surface", () => {
    const out = css({
      button: {
        base: {backgroundColor: 'red', '@dark': {backgroundColor: 'blue'}},
      },
    });
    expect(out).toContain(
      ':is(.astryx-button):where(:scope[data-theme="dark"] *):where(:not([data-astryx-media="light"] *)) {',
    );
    expect(out).toMatch(
      /@media \(prefers-color-scheme: dark\) \{\s*:is\(\.astryx-button\):where\(:scope:not\(\[data-theme\]\) \*\)/,
    );
    expect(out).toContain(
      ':is(.astryx-button):where([data-astryx-media="dark"] *):where(:not([data-astryx-media="dark"] [data-astryx-media="light"] *)) {',
    );
    // The mode rules are component rules, after the block's own rule.
    expect(out).not.toMatch(/^\s*:where\(/m);
    expect(out.indexOf('background-color: blue')).toBeGreaterThan(
      out.indexOf('background-color: red'),
    );
  });

  it('carries pseudo-classes and derived variables into the mode rules', () => {
    const out = css({
      button: {
        'variant:primary': {
          '@light': {borderRadius: '2px', ':hover': {backgroundColor: 'green'}},
        },
      },
    });
    expect(out).toMatch(
      /:is\(\.astryx-button\[data-variant="primary"\]:hover[^{]*\):where\(:scope\[data-theme="light"\] \*\)/,
    );
    expect(out).toMatch(/--_button-radius: 2px/);
  });

  it('writes a block of a surface its own mode only', () => {
    const theme = defineTheme({
      name: 'modes',
      onDark: {
        components: {
          button: {
            base: {
              '@dark': {color: 'white'},
              '@light': {color: 'black'},
            },
          },
        },
      },
    });
    const out = generateThemeCSS(theme).component;
    expect(out).toContain('color: white');
    expect(out).not.toContain('color: black');
  });

  it('writes a number value as the style key always has, in a mode block too', () => {
    // A theme written in JavaScript may give a number where the type says a
    // string.
    const out = css({
      heading: {
        'type:shared': {
          fontWeight: 600,
          '@dark': {lineHeight: 1},
        } as unknown as Record<string, string>,
      },
    });
    expect(out).toContain('font-weight: 600');
    expect(out).toContain('line-height: 1');
  });

  it('merges a mode block by property through extends', () => {
    expect(
      deepMergeComponents(
        {button: {base: {'@dark': {color: 'red', backgroundColor: 'black'}}}},
        {button: {base: {'@dark': {color: 'blue'}}}},
      ),
    ).toEqual({
      button: {base: {'@dark': {color: 'blue', backgroundColor: 'black'}}},
    });
  });
});
