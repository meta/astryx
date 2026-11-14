// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file exact-codec.test.mjs
 * @input Plain values and every edge the codec must refuse
 * @output EXACT_CODEC reads back exactly, key order and undefined included,
 *   and refuses to encode anything it could not
 */

import {describe, expect, it} from 'vitest';
import {EXACT_CODEC, isPlain, sameExactly} from './exact-codec.mjs';

/** An array with a hole at 1. */
function holey() {
  const a = [1, 2, 3];
  delete a[1];
  return a;
}

/** @param {unknown} value */
const roundTrip = value =>
  EXACT_CODEC.decode(JSON.parse(JSON.stringify(EXACT_CODEC.encode(value))));

describe('EXACT_CODEC', () => {
  it('reads back plain data exactly, undefined and key order included', () => {
    const value = {
      b: 1,
      a: [1, 'x', undefined, {z: undefined, y: null}],
      '\u0000odd': '\u0000mark',
      nested: {deep: [true, false, 0, -1.5]},
    };
    const back = roundTrip(value);
    expect(sameExactly(back, value)).toBe(true);
    expect(Object.keys(back)).toEqual(Object.keys(value));
    expect(Object.hasOwn(back.a[3], 'z')).toBe(true);
    expect(back['\u0000odd']).toBe('\u0000mark');
  });

  const refused = {
    'a function': {f() {}},
    'a Map': {m: new Map()},
    'a Date': {d: new Date(0)},
    'a class instance': {c: new (class C {})()},
    'an Error': {e: new Error('x')},
    'a symbol key': {[Symbol('s')]: 1},
    'a symbol value': {s: Symbol('s')},
    'a bigint': {n: 1n},
    'an accessor': Object.defineProperty({}, 'g', {
      get: () => 1,
      enumerable: true,
    }),
    'a hidden property': Object.defineProperty({}, 'h', {
      value: 1,
      enumerable: false,
    }),
    'an array hole': {a: holey()},
    'an array with another property': {a: Object.assign([1], {extra: 1})},
    '-0': {z: -0},
    NaN: {n: NaN},
    'an infinity': {i: Infinity},
    'a null-prototype object': {o: Object.create(null)},
    'top-level undefined': undefined,
  };
  for (const [name, value] of Object.entries(refused)) {
    it(`refuses ${name}`, () => {
      expect(isPlain(value)).toBe(false);
      expect(() => EXACT_CODEC.encode(value)).toThrow();
    });
  }

  it('refuses an object reached twice, shared or in a cycle', () => {
    const shared = {x: 1};
    expect(() => EXACT_CODEC.encode({a: shared, b: shared})).toThrow();
    /** @type {any} */
    const cycle = {};
    cycle.self = cycle;
    expect(() => EXACT_CODEC.encode(cycle)).toThrow();
  });

  it('tells key order apart, which isDeepStrictEqual does not', () => {
    expect(sameExactly({a: 1, b: 2}, {b: 2, a: 1})).toBe(false);
    expect(sameExactly({a: 1, b: 2}, {a: 1, b: 2})).toBe(true);
  });
});
