// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file keyed-relations.test.mjs
 * @input keyed-relations.js and source-stylesheet.js
 * @output Tests that each relation ending in a bare `*` is keyed to its rule's
 *   own class, in every shape StyleX prints, and that nothing else changes
 * @position Unit tests for @astryxdesign/build's relation keying
 */

import {describe, expect, it} from 'vitest';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {keyRelations, keySelectors} = require('./keyed-relations.js');
const {processRules} = require('./source-stylesheet.js');

describe('keySelectors', () => {
  it('keys the relation stylex.when.ancestor prints', () => {
    expect(keySelectors('.c.c:where(.m:hover *){color:red}', 'c')).toBe(
      '.c.c:where(.m:hover :where(.c)){color:red}',
    );
  });

  it('keys a sibling relation, and a child or next-sibling one', () => {
    expect(
      keySelectors('.c.c:where(.m:focus-visible ~ *){opacity:1}', 'c'),
    ).toBe('.c.c:where(.m:focus-visible ~ :where(.c)){opacity:1}');
    expect(keySelectors('.c.c:where(.m:hover>*){opacity:1}', 'c')).toBe(
      '.c.c:where(.m:hover>:where(.c)){opacity:1}',
    );
    expect(keySelectors('.c.c:where(.m:hover + *){opacity:1}', 'c')).toBe(
      '.c.c:where(.m:hover + :where(.c)){opacity:1}',
    );
  });

  it('keys the first part of anySibling and leaves its :has() part', () => {
    expect(
      keySelectors(
        '.c.c:where(.m:hover ~ *, :has(~ .m:hover)){color:red}',
        'c',
      ),
    ).toBe('.c.c:where(.m:hover ~ :where(.c), :has(~ .m:hover)){color:red}');
  });

  it('leaves descendant and siblingAfter, which print :has()', () => {
    for (const css of [
      '.c.c:where(:has(.m:hover)){color:red}',
      '.c.c:where(:has(~ .m:hover)){color:red}',
    ]) {
      expect(keySelectors(css, 'c')).toBe(css);
    }
  });

  it('keeps the priority tails and a pseudo-element after the keyed relation', () => {
    expect(
      keySelectors(
        '.c.c.c:where(.m[data-astryx-press="fading"] *):not(#\\#):not(#\\#)::before{opacity:0}',
        'c',
      ),
    ).toBe(
      '.c.c.c:where(.m[data-astryx-press="fading"] :where(.c)):not(#\\#):not(#\\#)::before{opacity:0}',
    );
  });

  it('keys the rule inside its at-rules and leaves their preludes', () => {
    expect(
      keySelectors(
        '@supports selector(:has(> *)){@media (hover: hover){.c.c.c:where(.m:hover *){color:red}}}',
        'c',
      ),
    ).toBe(
      '@supports selector(:has(> *)){@media (hover: hover){.c.c.c:where(.m:hover :where(.c)){color:red}}}',
    );
  });

  it('keeps the specificity of an :is() relation: the key is a :where()', () => {
    expect(keySelectors('.c:is([dir="rtl"] *){left:0}', 'c')).toBe(
      '.c:is([dir="rtl"] :where(.c)){left:0}',
    );
    expect(keySelectors('.c:is(th:hover *){opacity:1}', 'c')).toBe(
      '.c:is(th:hover :where(.c)){opacity:1}',
    );
  });

  it('leaves a bare * nested in an ancestor compound', () => {
    expect(keySelectors('.c.c:where(.m:has(> *) *){color:red}', 'c')).toBe(
      '.c.c:where(.m:has(> *) :where(.c)){color:red}',
    );
  });

  it('keys each selector of a list', () => {
    expect(
      keySelectors(
        '.c.c:where(.m:hover *)::-webkit-slider-thumb, .c.c:where(.m:hover *)::-moz-range-thumb{color:red}',
        'c',
      ),
    ).toBe(
      '.c.c:where(.m:hover :where(.c))::-webkit-slider-thumb, .c.c:where(.m:hover :where(.c))::-moz-range-thumb{color:red}',
    );
  });

  it('keys only where the subject compound has the rule class', () => {
    for (const css of [
      // Another class.
      '.d.d:where(.m:hover *){color:red}',
      // A class that only starts with the rule class.
      '.c1.c1:where(.m:hover *){color:red}',
      // The class on an ancestor compound, not the subject.
      '.c .d:where(.m:hover *){color:red}',
    ]) {
      expect(keySelectors(css, 'c')).toBe(css);
    }
  });

  it('leaves a * that is not the end of a relation', () => {
    for (const css of [
      '.c:where(*){color:red}',
      '.c:is( * ){color:red}',
      '.c:where(.m:hover *.d){color:red}',
      '.c:where(.m:hover *|*){color:red}',
      '.c:where(.m[data-x="a, b) *"]){color:red}',
      '.c:not(.m:hover *){color:red}',
    ]) {
      expect(keySelectors(css, 'c')).toBe(css);
    }
  });

  it('reads a quoted attribute value and an escape as one token', () => {
    expect(
      keySelectors('.c.c:where(.m[data-x="a, b) *"] *){color:red}', 'c'),
    ).toBe('.c.c:where(.m[data-x="a, b) *"] :where(.c)){color:red}');
    expect(keySelectors('.c.c:where(.m\\:x:hover *){color:red}', 'c')).toBe(
      '.c.c:where(.m\\:x:hover :where(.c)){color:red}',
    );
  });

  it('leaves rules without a selector relation', () => {
    for (const css of [
      ':root, .xhash{--x:1}',
      '@property --x{syntax:"*";inherits:false;}',
      '@keyframes x{0%{opacity:0}100%{opacity:1}}',
      '.c:hover{color:red}',
    ]) {
      expect(keySelectors(css, 'c')).toBe(css);
    }
  });
});

describe('keyRelations', () => {
  it('keys both directions of a rule and keeps its priority', () => {
    const rule = [
      'c',
      {
        ltr: '.c.c:where(.m:hover *){margin-left:1px}',
        rtl: '.c.c:where(.m:hover *){margin-right:1px}',
      },
      3000,
    ];
    expect(keyRelations([rule])).toEqual([
      [
        'c',
        {
          ltr: '.c.c:where(.m:hover :where(.c)){margin-left:1px}',
          rtl: '.c.c:where(.m:hover :where(.c)){margin-right:1px}',
        },
        3000,
      ],
    ]);
  });

  it('returns a rule without a relation, and a constant, as they are', () => {
    const plain = ['c', {ltr: '.c{color:red}', rtl: null}, 3000];
    const constant = ['k', {constKey: 'k', constVal: '1px'}, 0];
    const [plainOut, constantOut] = keyRelations([plain, constant]);
    expect(plainOut).toBe(plain);
    expect(constantOut).toBe(constant);
  });

  it('is what the prebuilt and source stylesheets print (source-stylesheet.js)', () => {
    const css = processRules([
      ['c', {ltr: '.c.c:where(.m:hover *){color:red}', rtl: null}, 3000],
    ]);
    expect(css).toContain('.c.c:where(.m:hover :where(.c))');
    expect(css).not.toMatch(/[\s>+~]\*\)/);
  });
});
