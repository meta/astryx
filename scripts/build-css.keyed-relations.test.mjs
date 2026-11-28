// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file build-css.keyed-relations.test.mjs
 * @input Each package stylesheet, compiled as scripts/build-css.mjs compiles it
 * @output Proves that no relation in a package stylesheet ends in a bare `*`
 * @position Regression test beside build-css.layers.test.mjs
 */

// Chromium keeps one invalidation set for each pseudo-class and attribute,
// for the whole document. One rule whose relation ends in a bare `*`, such as
// `.c:where(.m:hover *)`, makes that set restyle the whole subtree of each
// element whose hover changes. Each relation must name its subject instead,
// as `.c:where(.m:hover :where(.c))` does.

import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';
import {TARGETS, collectStyleXCSS} from './build-css.mjs';

const {processRules} = createRequire(import.meta.url)(
  '../packages/build/src/source-stylesheet.js',
);

/** The index of the bracket that closes the one at `open`. */
function closingBracket(text, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') {
      i++;
    } else if (quote != null) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '(' || ch === '[') {
      depth++;
    } else if (ch === ')' || ch === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** `text` split at its top-level commas and combinators, as tokens. */
function topLevelSplit(text, separators) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') {
      i++;
    } else if (quote != null) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '(' || ch === '[') {
      depth++;
    } else if (ch === ')' || ch === ']') {
      depth--;
    } else if (depth === 0 && separators.test(ch)) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/**
 * Every `:where()` or `:is()` argument in `css` whose last compound is a bare
 * `*` after a combinator, with the selector that holds it.
 */
function bareRelations(css) {
  const found = [];
  for (const match of css.matchAll(/:(?:where|is)\(/gi)) {
    const open = match.index + match[0].length - 1;
    const close = closingBracket(css, open);
    for (const argument of topLevelSplit(css.slice(open + 1, close), /,/)) {
      const compounds = topLevelSplit(argument.trim(), /[\s>+~]/).filter(
        compound => compound !== '',
      );
      if (compounds.length > 1 && compounds.at(-1) === '*') {
        const from =
          Math.max(
            css.lastIndexOf('{', match.index),
            css.lastIndexOf('}', match.index),
          ) + 1;
        found.push(css.slice(from, css.indexOf('{', match.index)).trim());
      }
    }
  }
  return found;
}

describe('bareRelations', () => {
  it('finds the relation stylex.when.ancestor prints, and passes a keyed one', () => {
    expect(bareRelations('.c.c:where(.m:hover *){color:red}')).toEqual([
      '.c.c:where(.m:hover *)',
    ]);
    expect(bareRelations('.c:is([dir="rtl"] > *){left:0}')).toHaveLength(1);
    expect(bareRelations('.c.c:where(.m:hover :where(.c)){color:red}')).toEqual(
      [],
    );
    expect(bareRelations('.c:where(*){color:red}')).toEqual([]);
    expect(bareRelations('.c:where(:has(> *)){color:red}')).toEqual([]);
  });
});

describe('package stylesheets key every relation to its subject', () => {
  it.each(Object.keys(TARGETS))(
    '%s: no relation ends in a bare *',
    async name => {
      const target = TARGETS[name];
      const rules = await collectStyleXCSS({
        name,
        ...target,
        provider: target.provider ? TARGETS[target.provider] : undefined,
      });
      expect(bareRelations(processRules(rules))).toEqual([]);
    },
    180_000,
  );
});
