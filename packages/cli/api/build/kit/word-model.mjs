// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The shape check for `build`'s checked-in word models (spec:AST-048).
 *
 * @input A parsed word model (tables and blend numbers) and the candidate
 *   count of its weights file.
 * @output `isWordModel(model, n)`: whether the kit can read it.
 * @position Beside weights.mjs (api/build/kit/). The adapter checks the
 *   weights file's call model with it, and weights.mjs checks the optional
 *   pick model with it. It imports nothing, so both can use it.
 */

/**
 * Whether a word model has the shape the kit reads, over `n` candidates: every
 * table row has a weight per candidate, every bias a number per candidate, and
 * the blend has three numbers per member (the tables plus the ranker) and one
 * for the shell. The weights file's call model and its `pick` model share it.
 * @param {any} model
 * @param {number} n the candidate count
 * @returns {boolean}
 */
export function isWordModel(model, n) {
  return (
    n > 0 &&
    Array.isArray(model?.tables) &&
    model.tables.length > 0 &&
    model.tables.every(
      (/** @type {any} */ t) =>
        Array.isArray(t?.words) &&
        Array.isArray(t.rows) &&
        t.rows.length === t.words.length &&
        t.rows.every(
          (/** @type {any} */ r) => typeof r === 'string' && r.length === n,
        ) &&
        Array.isArray(t.bias) &&
        t.bias.length === n &&
        t.bias.every((/** @type {any} */ b) => Number.isFinite(b)) &&
        Number.isFinite(t.clip) &&
        Number.isFinite(t.step),
    ) &&
    Array.isArray(model.blend) &&
    model.blend.length === 3 * (model.tables.length + 1) + 1 &&
    model.blend.every((/** @type {any} */ x) => Number.isFinite(x))
  );
}
