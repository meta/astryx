// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The CLI's heavy parsing and transform dependencies, each loaded on
 *   first use rather than when a module that may use it is imported.
 * @input Nothing; each getter requires its package once and keeps it.
 * @output `babelParser` (and `babelParse`, its `parse`), `babelCore`,
 *   `jscodeshift` and `selectorParser`: the same module objects a static
 *   import gives, since each package resolves to the same file for `require`
 *   as for `import` (test/lazy-dependencies.test.mjs checks it).
 * @position The first-use loader for these packages on the API's import
 *   path (authoring/ may not import foundation, so the ShadCN source variants
 *   keep their own). Everything that imports the CLI's API reaches the
 *   modules that parse or rewrite sources, and most runs never parse one, so
 *   loading Babel and jscodeshift with them cost every importer about 350
 *   modules. Each package is still resolved when this module loads, which
 *   reads no module: a broken install without one fails at import, as
 *   before, never as a parse that quietly finds nothing.
 */

import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);

// Resolved, not loaded: a missing package fails here, at import.
for (const pkg of [
  '@babel/parser',
  '@babel/core',
  'jscodeshift',
  'postcss-selector-parser',
]) {
  require.resolve(pkg);
}

/** @type {typeof import('@babel/parser') | undefined} */
let parser;
/** @type {typeof import('@babel/core') | undefined} */
let core;
/** @type {any} */
let codeshift;
/** @type {typeof import('postcss-selector-parser') | undefined} */
let selectors;

/** @returns {typeof import('@babel/parser')} */
export const babelParser = () => (parser ??= require('@babel/parser'));

/** @type {typeof import('@babel/parser').parse} */
export const babelParse = (input, options) =>
  babelParser().parse(input, options);

/** @returns {typeof import('@babel/core')} */
export const babelCore = () => (core ??= require('@babel/core'));

/**
 * Untyped here: jscodeshift ships no types, and this module is reached by
 * type checks that do not load the CLI's ambient declaration for it.
 * @returns {any}
 */
export const jscodeshift = () => (codeshift ??= require('jscodeshift'));

/** @returns {typeof import('postcss-selector-parser')} */
export const selectorParser = () =>
  (selectors ??= require('postcss-selector-parser'));

/**
 * Every package loaded on first use, here and in the ShadCN source variants,
 * for the test that each resolves to one file either way.
 */
export const LAZY_PACKAGES = [
  '@babel/parser',
  '@babel/core',
  'jscodeshift',
  'postcss-selector-parser',
  'recast',
  '@babel/plugin-transform-typescript',
];
