// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file css-tree for the CLI's CSS checks, resolved when this module loads
 *   and loaded on first use.
 * @input Nothing; css-tree is resolved once, here.
 * @output `cssTree`, the css-tree module, and `cssTreeRequire`, a require
 *   that resolves from css-tree's own folder (the MDN data it pins).
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

/** @type {any} */
let tree = null;

/** css-tree, loaded once. @returns {any} */
export const cssTree = () => (tree ??= require(CSS_TREE));

/** A require that resolves from css-tree's own folder. */
export const cssTreeRequire = createRequire(CSS_TREE);
