// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Expander tests for the repeat cap. Every path that expands a `*N`
 * repeat — emitted children, table rows, the root count — honours MAX_REPEAT.
 * Uses the real @astryxdesign/core registry.
 */

import {describe, it, expect, beforeAll} from 'vitest';
import {parse} from './parse.mjs';
import {validate} from './validate.mjs';
import {buildRegistry} from './registry.mjs';
import {expand, MAX_REPEAT} from './expand.mjs';

/** @type {import('./xle-ast').Registry} */
let registry;

// The registry imports every component doc on first use; warm it once.
beforeAll(async () => {
  registry = /** @type {import('./xle-ast').Registry} */ (
    /** @type {unknown} */ (await buildRegistry())
  );
}, 120_000);

/**
 * @param {string} expression
 * @returns {string}
 */
function expandCode(expression) {
  const doc = parse(expression);
  const {errors} = validate(doc, registry, []);
  expect(errors).toEqual([]);
  return expand(doc, registry).code;
}

/**
 * @param {string} code
 * @param {string} component
 */
function countOpening(code, component) {
  return (code.match(new RegExp(`<(?:XDS)?${component}\\b`, 'g')) || []).length;
}

describe('expand — repeat cap', () => {
  it('caps a repeated child at MAX_REPEAT copies', () => {
    expect(countOpening(expandCode(`V > B*${MAX_REPEAT + 5}`), 'Button')).toBe(MAX_REPEAT);
  });

  it('caps repeated table rows at MAX_REPEAT copies too', () => {
    expect(countOpening(expandCode(`T > TR*${MAX_REPEAT + 5} > TC`), 'TableRow')).toBe(
      MAX_REPEAT,
    );
  });
});
