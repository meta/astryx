// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Where an app keeps its framework root layout, and how its source is parsed.
 * @input a layout module's source text
 * @output the root layout and custom App file names, and the module's syntax tree
 * @position shared by `doctor`'s page-head reads and the next/font check, so they read the same files the same way
 */

import {babelParse as parse} from '../runtime/lazy-dependencies.mjs';

/** The source extensions a Next.js app's own modules use, in the order Next.js tries them. */
export const APP_MODULE_EXTENSIONS = ['.tsx', '.jsx', '.js', '.mjs', '.ts'];

/** The Next.js App Router root layout files: under the project, or under `src/`. */
export const APP_ROOT_LAYOUT_FILES = ['app/layout', 'src/app/layout'].flatMap(
  file => APP_MODULE_EXTENSIONS.map(ext => `${file}${ext}`),
);

/** The Next.js Pages Router custom App files: under the project, or under `src/`. */
export const PAGES_APP_FILES = ['pages/_app', 'src/pages/_app'].flatMap(file =>
  APP_MODULE_EXTENSIONS.map(ext => `${file}${ext}`),
);

/**
 * The syntax tree of an app module (a layout, a theme module). It throws when
 * the source does not parse.
 * @param {string} source
 */
export function parseAppModule(source) {
  return parse(source, {
    sourceType: 'unambiguous',
    plugins: ['typescript', 'jsx', 'decorators-legacy', 'importAttributes'],
  });
}
