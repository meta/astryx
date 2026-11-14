// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A codec for kept values (foundation/fs/gather-cache.mjs) that reads
 *   back exactly what it was given, or refuses to encode it.
 * @input Plain data: objects, arrays, strings, numbers, booleans, null, and
 *   `undefined` as a property value or array item, which JSON drops.
 * @output `EXACT_CODEC`: `encode` turns such a value into JSON-safe data, with
 *   each `undefined` as a reserved string (and a real string that begins with
 *   that string's first character escaped); `decode` restores it in place,
 *   key order kept. `encode` throws, keeping nothing, unless the value is
 *   plain data (isPlain) and reads back the same, key order included
 *   (sameExactly): so a function, a Map, a Date, a class instance, an Error,
 *   a symbol key, an accessor or hidden property, an array hole, -0, NaN, an
 *   infinity, or an object reached twice (shared or in a cycle) is never
 *   kept, and the value is worked out as without the cache.
 */

/** The first character of every reserved string: no plain text holds it. */
const MARK = '\u0000';

/** What stands for `undefined`. */
const UNDEFINED = `${MARK}u`;

/**
 * @param {string} key
 * @param {unknown} value
 * @returns {unknown}
 */
function replace(key, value) {
  if (value === undefined) return UNDEFINED;
  if (typeof value === 'string' && value.startsWith(MARK)) return MARK + value;
  return value;
}

/**
 * Put back what `replace` stood in for, in place.
 * @param {unknown} value
 * @returns {unknown}
 */
function restore(value) {
  if (typeof value === 'string' && value.startsWith(MARK)) {
    return value === UNDEFINED ? undefined : value.slice(1);
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = restore(value[i]);
  } else if (value !== null && typeof value === 'object') {
    const object = /** @type {Record<string, unknown>} */ (value);
    for (const key of Object.keys(object)) object[key] = restore(object[key]);
  }
  return value;
}

/**
 * Whether `value` is plain data that JSON, with `undefined` stood in for,
 * carries exactly: finite numbers but -0, strings, booleans, null, arrays
 * with no holes or other properties, and objects of Object's own prototype
 * whose properties are all enumerable, plain, and string-keyed, with no
 * object reached twice. `undefined` counts only inside an object or array.
 * @param {unknown} value
 * @param {Set<object>} [seen]
 * @param {boolean} [inside]
 * @returns {boolean}
 */
export function isPlain(value, seen = new Set(), inside = false) {
  if (value === undefined) return inside;
  if (value === null) return true;
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return true;
    case 'number':
      return Number.isFinite(value) && !Object.is(value, -0);
    case 'object':
      break;
    default:
      return false;
  }
  const object = /** @type {object} */ (value);
  if (seen.has(object)) return false;
  seen.add(object);
  const keys = Reflect.ownKeys(object);
  if (Array.isArray(object)) {
    if (Object.getPrototypeOf(object) !== Array.prototype) return false;
    // Its indexes and `length`, nothing else, and no holes.
    if (keys.length !== object.length + 1) return false;
    for (let i = 0; i < object.length; i++) {
      if (!Object.hasOwn(object, i)) return false;
      const d = Object.getOwnPropertyDescriptor(object, i);
      if (!d || !('value' in d) || !d.enumerable) return false;
      if (!isPlain(d.value, seen, true)) return false;
    }
    return true;
  }
  if (Object.getPrototypeOf(object) !== Object.prototype) return false;
  for (const key of keys) {
    if (typeof key !== 'string') return false;
    const d = Object.getOwnPropertyDescriptor(object, key);
    if (!d || !('value' in d) || !d.enumerable) return false;
    if (!isPlain(d.value, seen, true)) return false;
  }
  return true;
}

/**
 * Whether two plain values are the same, key order included: what
 * isDeepStrictEqual does not check.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function sameExactly(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return false;
    const x = /** @type {Record<string, unknown>} */ (a)[ka[i]];
    const y = /** @type {Record<string, unknown>} */ (b)[kb[i]];
    if (!sameExactly(x, y)) return false;
  }
  return true;
}

export const EXACT_CODEC = {
  /**
   * @param {unknown} value
   * @returns {unknown}
   */
  encode(value) {
    if (!isPlain(value)) throw new Error('not plain data');
    const text = JSON.stringify(value, replace);
    if (!sameExactly(restore(JSON.parse(text)), value)) {
      throw new Error('does not read back exactly');
    }
    return JSON.parse(text);
  },
  /**
   * @param {unknown} stored
   * @returns {any}
   */
  decode(stored) {
    return restore(stored);
  },
};
