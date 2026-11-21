// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A lookup table that answers only for its own keys.
 * @input A plain object
 * @output The same table, with no prototype at any depth
 * @position foundation/runtime — used by the theme editor and the color reader
 */

/**
 * A lookup table that only answers for its own keys: a word typed by a
 * person (`constructor`, `__proto__`, `toString`) never reaches
 * `Object.prototype`. Plain objects inside it, in arrays too, get the same.
 * @template T
 * @param {T} table
 * @returns {T}
 */
export function wordTable(table) {
  /** @param {any} v @returns {any} */
  const own = v => {
    if (Array.isArray(v)) return v.map(own);
    if (
      !v ||
      typeof v !== 'object' ||
      Object.getPrototypeOf(v) !== Object.prototype
    )
      return v;
    const out = Object.create(null);
    for (const [k, x] of Object.entries(v)) out[k] = own(x);
    return out;
  };
  return own(table);
}
