// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file css-tree and the MDN property data it ships, for the CLI's CSS
 *   checks: resolved when this module loads, each loaded on first use.
 * @input Nothing; css-tree is resolved once, here.
 * @output `cssTree`, the css-tree module, and `mdnCssProperties` and
 *   `mdnCssSelectors`, the MDN property and selector data at the version
 *   css-tree pins; `longhandsOf` and `coversProperty`, which properties a
 *   shorthand sets, by that data; `keptCssTreeAnswer`, an answer worked
 *   out with them and kept between runs.
 * @position The one loader of css-tree, for the theme editor's CSS
 *   knowledge, the theme build's style-key checks, and the shared color
 *   reader the export uses. The entry is resolved
 *   before any command stats a file: after a stat of a named pipe, Node's
 *   realpath can return a package link's own path instead of its target,
 *   and css-tree's own dependencies are then looked for beside the link and
 *   not found. A resolved entry is already real.
 */

import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {persistedSummary} from '../fs/gather-cache.mjs';
import {loadedCodeStamps} from '../fs/loaded-files.mjs';

const require = createRequire(import.meta.url);
const CSS_TREE = require.resolve('css-tree');
const fromCssTree = createRequire(CSS_TREE);

/** @type {any} */
let tree = null;
/** @type {Record<string, {status?: string, initial?: string | string[]}> | null} */
let mdn = null;

/** css-tree, loaded once. @returns {any} */
export const cssTree = () => (tree ??= require(CSS_TREE));

/**
 * The MDN property data css-tree reads, at the version css-tree pins,
 * loaded once.
 * @returns {Record<string, {status?: string, initial?: string | string[]}>}
 */
export const mdnCssProperties = () =>
  (mdn ??= fromCssTree('mdn-data/css/properties.json'));

/** @type {Record<string, {syntax?: string}> | null} */
let selectors = null;

/**
 * The MDN selector data css-tree ships (pseudo-classes and pseudo-elements
 * by name, `::before`, `::part()`), loaded once.
 * @returns {Record<string, {syntax?: string}>}
 */
export const mdnCssSelectors = () =>
  (selectors ??= fromCssTree('mdn-data/css/selectors.json'));

/**
 * What `answer` gives for `inputs`, a function of them, css-tree and the MDN
 * data it ships alone. The answer is kept beside the kept gathers
 * (fs/gather-cache.mjs persistedSummary) and read back, with no css-tree
 * loaded, while the inputs and every file of css-tree's code and data that
 * worked it out are unchanged.
 * @template T
 * @param {string} kind what the answer is
 * @param {string[]} inputs
 * @param {(inputs: string[]) => T} answer
 * @returns {T}
 */
export function keptCssTreeAnswer(kind, inputs, answer) {
  let current = false;
  return persistedSummary(
    [
      'css-tree-answer',
      kind,
      CSS_TREE,
      createHash('sha256').update(JSON.stringify(inputs)).digest('hex'),
    ],
    () => {
      const value = answer(inputs);
      // Kept only while css-tree's files, and the package folders they
      // were found in, are those this process loaded: after a reinstall,
      // the answer is the old css-tree's.
      const {stamps, unchangedSinceStart} = loadedCodeStamps(
        fileURLToPath(import.meta.url),
        [CSS_TREE],
        loadedData().map(file => [CSS_TREE, file]),
      );
      current = unchangedSinceStart;
      return {value, stamps};
    },
    {keep: () => current},
  );
}

/**
 * Each MDN data file css-tree's checks have read, for a kept answer worked
 * out with them.
 * @returns {string[]}
 */
function loadedData() {
  return ['mdn-data/css/properties.json', 'mdn-data/css/selectors.json']
    .map(file => fromCssTree.resolve(file))
    .filter(file => fromCssTree.cache[file] !== undefined);
}

/** @type {Map<string, Set<string>>} */
const longhandCache = new Map();

/**
 * Every longhand a shorthand sets, through shorthands inside it (border
 * sets border-color, so border-top-color), as MDN's data lists them; empty
 * for a property that is no shorthand.
 * @param {string} prop
 * @returns {Set<string>}
 */
export function longhandsOf(prop) {
  const cached = longhandCache.get(prop);
  if (cached) return cached;
  /** @type {Set<string>} */
  const out = new Set();
  longhandCache.set(prop, out);
  const computed = /** @type {any} */ (mdnCssProperties()[prop])?.computed;
  if (Array.isArray(computed))
    for (const p of computed) {
      if (typeof p !== 'string' || p === prop) continue;
      out.add(p);
      for (const q of longhandsOf(p)) out.add(q);
    }
  return out;
}

/**
 * Whether setting `a` sets `b` too: `b` is one of `a`'s longhands, or a
 * shorthand whose every longhand `a` sets (border covers border-top).
 * overflow-wrap is no part of overflow, nor transform-origin of transform.
 * @param {string} a
 * @param {string} b
 */
export function coversProperty(a, b) {
  if (a === b) return false;
  const of = longhandsOf(a);
  if (of.has(b)) return true;
  const sub = longhandsOf(b);
  return sub.size > 0 && [...sub].every(x => of.has(x));
}
