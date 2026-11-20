// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for written-prop-values.mjs: what a JSX attribute certainly
 *   gives its prop.
 */

import {describe, expect, it} from 'vitest';
import {babelCore, babelParse} from '../runtime/lazy-dependencies.mjs';
import {writtenValue} from './written-prop-values.mjs';

/**
 * The written value of each attribute of the last element in `source`.
 * @param {string} source
 * @returns {Record<string, ReturnType<typeof writtenValue>>}
 */
function valuesOf(source) {
  const ast = babelParse(source, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });
  /** @type {Record<string, ReturnType<typeof writtenValue>>} */
  let out = {};
  babelCore().traverse(ast, {
    JSXOpeningElement(/** @type {any} */ p) {
      out = {};
      for (const attr of p.node.attributes)
        out[attr.name.name] = writtenValue(attr, p.scope);
    },
  });
  return out;
}

describe('writtenValue', () => {
  it('reads a literal and every branch of a conditional or logical value of literals', () => {
    expect(
      valuesOf(
        "const x = <B a=\"one\" b={'two'} c={`three`} d={on ? 'x' : 'y'} e={on ? undefined : 'z'} f={on ? null : (a ? 'p' : 'q')} g={'m' || 'n'} h={'' || 'primary'} i={on ? undefined : null ?? 'w'} />;",
      ),
    ).toEqual({
      a: {kinds: ['string'], strings: ['one']},
      b: {kinds: ['string'], strings: ['two']},
      c: {kinds: ['string'], strings: ['three']},
      d: {kinds: ['string'], strings: ['x', 'y']},
      e: {kinds: ['string'], strings: ['z']},
      f: {kinds: ['string'], strings: ['p', 'q']},
      g: {kinds: ['string'], strings: ['m']},
      h: {kinds: ['string'], strings: ['primary']},
      i: {kinds: ['string'], strings: ['w']},
    });
  });

  it('reads the kind of other literals, a const and the first value of useState', () => {
    expect(
      valuesOf(`import {useState} from 'react';
import * as React from 'react';
const size = 'lg';
function F() {
  const [when] = useState(new Date());
  const [shape] = React.useState({type: 'error'});
  return <B a={2} b={-1} c={true} d e={{x: 1}} f={[1]} g={new Date()} h={() => 1} i={size} j={when} k={shape} l={\`\${size}px\`} m={on ? 3 : 'x'} />;
}`),
    ).toEqual({
      a: {kinds: ['number'], strings: []},
      b: {kinds: ['number'], strings: []},
      c: {kinds: ['boolean'], strings: []},
      d: {kinds: ['boolean'], strings: []},
      e: {kinds: ['object'], strings: []},
      f: {kinds: ['array'], strings: []},
      g: {kinds: ['Date'], strings: []},
      h: {kinds: ['function'], strings: []},
      i: {kinds: ['string'], strings: ['lg']},
      j: {kinds: ['Date'], strings: []},
      k: {kinds: ['object'], strings: []},
      l: {kinds: ['string'], strings: null},
      m: {kinds: ['number', 'string'], strings: ['x']},
    });
  });

  it('gives nothing when a branch is not certain, and follows a local binding that shadows a global', () => {
    expect(
      valuesOf(`import {useState} from 'not-react';
import {useState as useReactState} from 'react';
let changed = 'a';
changed = 'b';
function F({v}) {
  const undefined = 'u';
  const Date = class {};
  const [later] = useState('x');
  const [lazy] = useReactState(() => 'x');
  const SHOW = true;
  return <B a={on ? 'x' : v} b={on && 'x'} c={v} d={on ? undefined : 'y'} e={new Date()} f={changed} g={later} h={f()} i={lazy} j={SHOW && 'New'} k={on || 3} l={'x' as never} m={'y' as any} />;
}`),
    ).toEqual({
      a: null,
      b: null,
      c: null,
      d: {kinds: ['string'], strings: ['u', 'y']},
      e: null,
      f: null,
      g: null,
      h: null,
      i: null,
      j: null,
      k: null,
      l: null,
      m: null,
    });
  });
});
