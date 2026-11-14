// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file exact-codec.test.mjs
 * @input Plain values and every edge the codec must refuse
 * @output EXACT_CODEC reads back exactly, key order and undefined included,
 *   and refuses to encode anything it could not. Generated plain data (marks,
 *   lone surrogates, numbers beyond 2^53, integer-like and `__proto__` keys,
 *   undefined in arrays and objects) reads back exactly from the text written
 *   once.
 */

import {describe, expect, it} from 'vitest';
import {EXACT_CODEC, isPlain, sameExactly} from './exact-codec.mjs';
import {prng} from '../../test-utils/provider-scenarios.mjs';

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

/**
 * A small seeded generator, so a failing value can be found again.
 * @param {number} seed
 */
function generator(seed) {
  const next = prng(seed);
  /** @template T @param {T[]} list @returns {T} */
  const pick = list => list[Math.floor(next() * list.length)];
  return {next, pick};
}

/** Strings JSON must carry exactly: marks, lone surrogates, escapes, emoji. */
const STRINGS = [
  '',
  'plain',
  '\u0000',
  '\u0000u',
  '\u0000\u0000',
  'x\u0000',
  '\ud800',
  'a\udc00b',
  '\udbff\udfff',
  '"quoted" \\ slash',
  '\n\t\r\u2028\u2029',
  '\u{1F600}',
  'e\u0301',
  '__proto__',
];

/** Numbers JSON must carry exactly, beyond 2^53 and down to the smallest. */
const NUMBERS = [
  0,
  1,
  -1,
  0.1,
  -1.5,
  2 ** 53,
  2 ** 53 + 2,
  -(2 ** 53 + 2),
  Number.MAX_SAFE_INTEGER,
  1e21,
  1.7976931348623157e308,
  5e-324,
  1e-7,
  123456789.12345679,
];

/** Keys whose order JSON must keep: integer-like ones come first, ascending. */
const KEYS = [
  'a',
  'b',
  '0',
  '1',
  '10',
  '2',
  '-1',
  '01',
  '4294967294',
  '4294967295',
  '1.5',
  '__proto__',
  '\u0000k',
  'constructor',
];

/**
 * A plain value, `depth` levels deep at most, sharing no object.
 * @param {{next: () => number, pick: <T>(list: T[]) => T}} g
 * @param {number} depth
 * @returns {unknown}
 */
function plainValue(g, depth) {
  const kind = depth <= 0 ? Math.floor(g.next() * 5) : Math.floor(g.next() * 7);
  switch (kind) {
    case 0:
      return g.pick(STRINGS);
    case 1:
      return g.pick(NUMBERS);
    case 2:
      return g.pick([true, false, null]);
    case 3:
      return g.pick(STRINGS) + g.pick(STRINGS);
    case 4:
      return g.next() < 0.5 ? g.pick(NUMBERS) : g.pick(STRINGS);
    case 5: {
      const length = Math.floor(g.next() * 4);
      return Array.from({length}, () =>
        g.next() < 0.2 ? undefined : plainValue(g, depth - 1),
      );
    }
    default: {
      /** @type {Record<string, unknown>} */
      const object = {};
      for (let i = Math.floor(g.next() * 5); i > 0; i--) {
        const value = g.next() < 0.2 ? undefined : plainValue(g, depth - 1);
        // An own `__proto__` key, as JSON.parse makes one.
        Object.defineProperty(object, g.pick(KEYS), {
          value,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      return object;
    }
  }
}

describe('EXACT_CODEC over generated plain data', () => {
  it('reads every generated plain value back exactly, as its text was written once', () => {
    const g = generator(0x5eed);
    for (let i = 0; i < 3000; i++) {
      const value = plainValue(g, 4);
      expect(isPlain(value)).toBe(true);
      const text = EXACT_CODEC.encodeText(value);
      const back = EXACT_CODEC.decode(JSON.parse(text));
      if (!sameExactly(back, value)) {
        throw new Error(`does not read back exactly: ${text}`);
      }
    }
  });

  it('keeps an own __proto__ key as an own key, in its place', () => {
    const value = JSON.parse('{"b": 1, "__proto__": {"x": 2}, "a": 3}');
    expect(Object.keys(value)).toEqual(['b', '__proto__', 'a']);
    const back = EXACT_CODEC.decode(JSON.parse(EXACT_CODEC.encodeText(value)));
    expect(Object.keys(back)).toEqual(['b', '__proto__', 'a']);
    expect(Object.getPrototypeOf(back)).toBe(Object.prototype);
    expect(sameExactly(back, value)).toBe(true);
  });

  it('keeps integer-like keys first and ascending, as the object lists them', () => {
    const value = {b: 1, 10: 2, a: 3, 2: 4, '-1': 5, '01': 6};
    const back = EXACT_CODEC.decode(JSON.parse(EXACT_CODEC.encodeText(value)));
    expect(Object.keys(back)).toEqual(Object.keys(value));
    expect(Object.keys(back)).toEqual(['2', '10', 'b', 'a', '-1', '01']);
  });

  it('carries numbers beyond 2^53 and the smallest as the same doubles', () => {
    for (const number of [2 ** 53 + 2, 1e21, 5e-324, -(2 ** 53 + 2)]) {
      const back = EXACT_CODEC.decode(
        JSON.parse(EXACT_CODEC.encodeText({number})),
      );
      expect(Object.is(back.number, number)).toBe(true);
    }
  });

  it('carries lone surrogates and reserved-mark strings as they were', () => {
    const value = [
      '\ud800',
      'a\udc00',
      '\u0000',
      '\u0000u',
      {k: '\u0000\u0000'},
    ];
    const back = EXACT_CODEC.decode(JSON.parse(EXACT_CODEC.encodeText(value)));
    expect(back).toEqual(value);
    expect(sameExactly(back, value)).toBe(true);
  });

  it('refuses what JSON cannot carry: -0, NaN, infinities, holes, symbol keys and other prototypes', () => {
    const symbolKeyed = {a: 1};
    Object.defineProperty(symbolKeyed, Symbol('s'), {
      value: 1,
      enumerable: true,
    });
    for (const value of [
      {n: -0},
      [Number.NaN],
      {n: Number.POSITIVE_INFINITY},
      [Number.NEGATIVE_INFINITY],
      holey(),
      symbolKeyed,
      Object.create(null),
      new (class Point {})(),
    ]) {
      expect(() => EXACT_CODEC.encodeText(value)).toThrow();
    }
  });
});
