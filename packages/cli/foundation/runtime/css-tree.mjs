// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file css-tree and the MDN property data it ships, for the CLI's CSS
 *   checks: resolved when this module loads, each loaded on first use.
 * @input Nothing; css-tree is resolved once, here.
 * @output `cssTree`, the css-tree module, and `mdnCssProperties` and
 *   `mdnCssSelectors`, the MDN property and selector data at the version
 *   css-tree pins.
 * @position The one loader of css-tree, for the theme editor's CSS
 *   knowledge and the theme build's style-key checks. The entry is resolved
 *   before any command stats a file: after a stat of a named pipe, Node's
 *   realpath can return a package link's own path instead of its target,
 *   and css-tree's own dependencies are then looked for beside the link and
 *   not found. A resolved entry is already real.
 */

import {createRequire} from 'node:module';

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
