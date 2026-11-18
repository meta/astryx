// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The parser plugins a theme source is read with, by its file name.
 * @input A source file's name.
 * @output sourcePlugins(): the @babel/parser plugins for it.
 * @position Shared by every reader of a theme's source in theme build (the
 *           line of a value, the fields it writes, the theme it extends, its
 *           registries). A `.ts` file is TypeScript without JSX: there
 *           `<any>1` is a type assertion, which the JSX plugin reads as a tag
 *           and fails to parse, as TypeScript itself reads it.
 */

/** The endings TypeScript reads without JSX. */
const TS_WITHOUT_JSX = /\.(?:ts|mts|cts)$/i;

/**
 * The @babel/parser plugins a source with this file name is read with: a
 * `.ts`, `.mts` or `.cts` file is TypeScript without JSX; any other (a
 * `.tsx`, a JavaScript file, or no name) is read with both.
 * @param {string} [file]
 * @returns {import('@babel/parser').ParserPlugin[]}
 */
export function sourcePlugins(file) {
  return file && TS_WITHOUT_JSX.test(file)
    ? ['typescript', 'decorators-legacy', 'importAttributes']
    : ['typescript', 'jsx', 'decorators-legacy', 'importAttributes'];
}
