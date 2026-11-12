// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The CLI's heavy parsing and transform dependencies, each loaded on
 *   first use rather than when a module that may use it is imported.
 * @input Nothing; each getter requires its package once and keeps it.
 * @output `babelParse`, `babelCore`, `recast`, `typeScriptPlugin`,
 *   `jscodeshift` and `selectorParser`: the same module objects a static
 *   import gives, since each package resolves to the same file for `require`
 *   as for `import` (test/lazy-dependencies.test.mjs checks it).
 * @position Imported by the modules that parse or rewrite sources (theme
 *   build and fork, the icon-set and config writers, integration
 *   contributions, ShadCN source variants, codemod parsing). Everything that
 *   imports the CLI's API reaches those modules, and most runs never parse a
 *   source, so loading Babel, recast and jscodeshift with them cost every
 *   importer about a thousand modules. A missing dependency now fails at
 *   first use instead of at import.
 */

import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);

/** @type {typeof import('@babel/parser') | undefined} */
let parser;
/** @type {typeof import('@babel/core') | undefined} */
let core;
/** @type {typeof import('recast') | undefined} */
let recastModule;
/** @type {import('@babel/core').PluginItem | undefined} */
let typeScript;
/** @type {any} */
let codeshift;
/** @type {typeof import('postcss-selector-parser') | undefined} */
let selectors;

/** @type {typeof import('@babel/parser').parse} */
export const babelParse = (input, options) =>
  (parser ??= require('@babel/parser')).parse(input, options);

/** @returns {typeof import('@babel/core')} */
export const babelCore = () => (core ??= require('@babel/core'));

/** @returns {typeof import('recast')} */
export const recast = () => (recastModule ??= require('recast'));

/** @returns {import('@babel/core').PluginItem} */
export const typeScriptPlugin = () =>
  (typeScript ??= require('@babel/plugin-transform-typescript').default);

/** @returns {typeof import('jscodeshift').default} */
export const jscodeshift = () => (codeshift ??= require('jscodeshift'));

/** @returns {typeof import('postcss-selector-parser')} */
export const selectorParser = () =>
  (selectors ??= require('postcss-selector-parser'));

/** The packages above, for the test that they resolve alike both ways. */
export const LAZY_PACKAGES = [
  '@babel/parser',
  '@babel/core',
  'recast',
  '@babel/plugin-transform-typescript',
  'jscodeshift',
  'postcss-selector-parser',
];
