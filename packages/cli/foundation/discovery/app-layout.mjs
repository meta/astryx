// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Where an app keeps its framework root layout, and how its source is parsed.
 * @input a layout module's source text
 * @output the root layout file names, and the module's syntax tree
 * @position shared by `doctor`'s page-head reads and the next/font check, so they read the same files the same way
 */

import {babelParse as parse} from '../runtime/lazy-dependencies.mjs';

/** The Next.js App Router root layout files: under the project, or under `src/`. */
export const APP_ROOT_LAYOUT_FILES = ['app/layout', 'src/app/layout'].flatMap(
  file => ['.tsx', '.jsx', '.js', '.mjs', '.ts'].map(ext => `${file}${ext}`),
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
