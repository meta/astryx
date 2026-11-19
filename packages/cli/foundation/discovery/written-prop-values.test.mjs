// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for written-prop-values.mjs: the strings a JSX attribute
 *   certainly gives its prop.
 */

import {describe, expect, it} from 'vitest';
import {babelCore, babelParse} from '../runtime/lazy-dependencies.mjs';
import {writtenStrings} from './written-prop-values.mjs';

/**
 * The written strings of each attribute of the first element in `source`.
 * @param {string} source
 * @returns {Record<string, string[] | null>}
 */
function stringsOf(source) {
  const ast = babelParse(source, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });
  /** @type {Record<string, string[] | null>} */
  const out = {};
  babelCore().traverse(ast, {
    JSXOpeningElement(/** @type {any} */ p) {
      if (Object.keys(out).length > 0) return;
      for (const attr of p.node.attributes)
        out[attr.name.name] = writtenStrings(attr, p.scope);
    },
  });
  return out;
}

describe('writtenStrings', () => {
  it('reads a literal and every branch of a literal-only conditional value', () => {
    expect(
      stringsOf(
        `const x = <B a="one" b={'two'} c={\`three\`} d={on ? 'x' : 'y'} e={on ? undefined : 'z'} f={on ? null : (a ? 'p' : 'q')} g={on && 'n'} />;`,
      ),
    ).toEqual({
      a: ['one'],
      b: ['two'],
      c: ['three'],
      d: ['x', 'y'],
      e: ['z'],
      f: ['p', 'q'],
      g: null,
    });
  });

  it('gives nothing when a branch is not certain', () => {
    expect(
      stringsOf(
        'function F({v}) { const undefined = "u"; return <B a={on ? "x" : v} b={on && "x"} c={`${v}px`} d={v} e d2={on ? undefined : "y"} />; }',
      ),
    ).toEqual({a: null, b: null, c: null, d: null, e: null, d2: null});
  });
});
