// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The file extensions a theme source module can have.
 *
 * @input none
 * @output THEME_MODULE_EXTENSIONS and THEME_SOURCE_EXTENSIONS
 * @position read by theme discovery (which theme sources it accepts) and by
 *   `theme build` (which inputs it loads), so both accept the same files
 */

/** The extensions of a discoverable theme source, `<name>Theme.<ext>`. */
export const THEME_MODULE_EXTENSIONS = [
  '.mjs',
  '.js',
  '.mts',
  '.ts',
  '.tsx',
  '.jsx',
];

/**
 * The extensions `theme build` loads as a theme source: the discoverable ones,
 * and their CommonJS forms, which a theme may also be written in.
 */
export const THEME_SOURCE_EXTENSIONS = [
  ...THEME_MODULE_EXTENSIONS,
  '.cjs',
  '.cts',
];
