// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The CLI's heavy parsing and transform dependencies, each loaded on
 *   first use rather than when a module that may use it is imported.
 * @input Nothing; each getter requires its package once and keeps it.
 * @output `babelParser` (and `babelParse`, its `parse`), `babelCore` (and
 *   `babelCorePath`, the file it loads), `jscodeshift`, `selectorParser` and
 *   `postcss`: the same module objects a static import gives
 *   (test/lazy-dependencies.test.mjs checks it).
 * @position The first-use loader for these packages on the API's import
 *   path (authoring/ may not import foundation, so the ShadCN source variants
 *   keep their own). Everything that imports the CLI's API reaches the
 *   modules that parse or rewrite sources, and most runs never parse one, so
 *   loading Babel and jscodeshift with them cost every importer about 350
 *   modules. Each package is still resolved when this module loads, which
 *   reads no module, so every module that imports this loader needs all five
 *   packages installed: a broken install without one fails when such a
 *   module loads, never as a parse that quietly finds nothing. The `Project`
 *   seam and the agent docs reach this loader through component discovery,
 *   so on such an install every command except `help`, `--version`, `blog`
 *   and `manifest` stops at load; a run with no options names the missing
 *   package (an option the failed command does not declare is rejected as
 *   unknown first).
 */

import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);

// Resolved, not loaded: a missing package fails here, at import.
for (const pkg of [
  '@babel/parser',
  '@babel/core',
  'jscodeshift',
  'postcss',
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
/** @type {typeof import('postcss').default | undefined} */
let css;

/** @returns {typeof import('@babel/parser')} */
export const babelParser = () => (parser ??= require('@babel/parser'));

/** @type {typeof import('@babel/parser').parse} */
export const babelParse = (input, options) =>
  babelParser().parse(input, options);

/** @returns {typeof import('@babel/core')} */
export const babelCore = () => (core ??= require('@babel/core'));

/**
 * The file `babelCore` loads, resolved without loading it.
 * @returns {string}
 */
export const babelCorePath = () => require.resolve('@babel/core');

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
 * postcss, for the modules that read a stylesheet only now and then:
 * doctor's theme checks and the codemods' parser, which the API's import
 * path reaches, and the reader of a built theme's imports and the font
 * stylesheet reader, which the theme commands load. Its ES module entry hands
 * on what its CommonJS one exports, so this is the one postcss the modules
 * that import it get.
 * @returns {typeof import('postcss').default}
 */
export const postcss = () => (css ??= require('postcss'));

/**
 * Every package loaded on first use, here and in the ShadCN source variants,
 * for the test that each gives one module either way and that importing the
 * API loads none of them.
 */
export const LAZY_PACKAGES = [
  '@babel/parser',
  '@babel/core',
  'jscodeshift',
  'postcss',
  'postcss-selector-parser',
  'recast',
  '@babel/plugin-transform-typescript',
];
