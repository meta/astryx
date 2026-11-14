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

  it("applies a block only in its mode: the root's mode, the system preference, and the nearest surface", () => {
    const out = css({
      button: {
        base: {backgroundColor: 'red', '@dark': {backgroundColor: 'blue'}},
      },
    });
    const outsideSurfaces = ':where(:not(:scope [data-astryx-media] *))';
    expect(out).toContain(
      `:is(.astryx-button):where(:scope[data-theme="dark"] *)${outsideSurfaces} {`,
    );
    // Any mode other than light and dark follows the system preference.
    expect(out).toContain(
      `@media (prefers-color-scheme: dark) {\n  :is(.astryx-button):where(:scope:not([data-theme="light"], [data-theme="dark"]) *)${outsideSurfaces} {`,
    );
    // Inside a media surface, the surface decides as the onDark and onLight
    // overrides do, at the same weight as the root's rule.
    expect(out).toContain(
      ':is(.astryx-button):where(:scope [data-astryx-media="dark"] *) {',
    );
    expect(out).not.toContain('@scope ([data-astryx-media');
    // The mode rules are component rules, after the block's own rule.
    expect(out).not.toMatch(/^\s*:where\(/m);
    expect(out.indexOf('background-color: blue')).toBeGreaterThan(
      out.indexOf('background-color: red'),
    );
  });

  it('adds the mode conditions before a pseudo-class, a press, or a pseudo-element', () => {
    const out = css({
      button: {
        'variant:primary': {
          '@light': {
            borderRadius: '2px',
            ':hover': {backgroundColor: 'green'},
            ':active': {backgroundColor: 'navy'},
          },
        },
      },
      'text-input': {
        base: {'@dark': {'::placeholder': {color: 'gray'}}},
      },
    });
    const light =
      ':is(.astryx-button[data-variant="primary"]):where(:scope[data-theme="light"] *):where(:not(:scope [data-astryx-media] *))';
    expect(out).toContain(
      `${light}:hover:where(:not(:disabled,[aria-disabled="true"])) {`,
    );
    // A press keeps the press model: :active off a coarse pointer, the
    // believed press under one, each after the mode conditions.
    expect(out).toContain(
      `@media not all and (pointer: coarse) {\n  ${light}:active {`,
    );
    expect(out).toMatch(
      /@media \(pointer: coarse\) \{\n {2}:is\(\.astryx-button\[data-variant="primary"\]\):where\(:scope\[data-theme="light"\] \*\)[^{]*\[data-astryx-press/,
    );
    // A pseudo-element ends the selector.
    expect(out).toContain(
      ':is(.astryx-text-input):where(:scope[data-theme="dark"] *):where(:not(:scope [data-astryx-media] *))::placeholder {',
    );
    expect(out).not.toMatch(/:is\([^)]*::placeholder/);
    expect(out).toMatch(/--_button-radius: 2px/);
  });

  it('writes the dark block before the light one, as the surface overrides go', () => {
    const out = css({
      button: {
        base: {'@light': {color: 'black'}, '@dark': {color: 'white'}},
      },
    });
    const surface = (mode: string) =>
      out.indexOf(
        `:is(.astryx-button):where(:scope [data-astryx-media="${mode}"] *)`,
      );
    expect(surface('dark')).toBeGreaterThan(-1);
    expect(surface('light')).toBeGreaterThan(surface('dark'));
  });

  it('compiles the rest of the theme past a null value, as written', () => {
    const out = css({
      button: {
        base: {color: null, backgroundColor: 'red'} as unknown as Record<
          string,
          string
        >,
      },
    });
    expect(out).toContain('background-color: red');
  });

  it('reports a nested key that is neither a pseudo-class nor a mode block', () => {
    const warnings: string[] = [];
    const out = generateThemeCSS(
      defineTheme({
        name: 'modes',
        components: {
          button: {
            base: {backgroundColor: 'red', '@Dark': {color: 'white'}},
          },
        },
      }),
      warnings,
    ).component;
    expect(out).toContain('background-color: red');
    expect(out).not.toContain('color: white');
    expect(warnings.join('\n')).toMatch(/@Dark|@-dark/);
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

  it('composes a mode block over the generated type-scale rules', () => {
    const theme = defineTheme({
      name: 'modes',
      typography: {scale: {base: 14, ratio: 1.2}},
      components: {heading: {'level:1': {'@dark': {color: 'red'}}}},
    });
    const level1 = theme.components?.heading?.['level:1'];
    // The generated rule keeps its properties beside the block.
    expect(level1?.fontSize).toBe('var(--text-heading-1-size)');
    expect(level1?.['@dark']).toEqual({color: 'red'});
  });

  it('merges a mode block by property in an inherited media surface', () => {
    const base = defineTheme({
      name: 'base',
      onDark: {
        components: {
          button: {base: {'@dark': {color: 'red', backgroundColor: 'black'}}},
        },
      },
    });
    const child = defineTheme({
      name: 'child',
      extends: base,
      onDark: {components: {button: {base: {'@dark': {color: 'blue'}}}}},
    });
    expect(child.__onDark?.components?.button?.base?.['@dark']).toEqual({
      color: 'blue',
      backgroundColor: 'black',
    });
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
