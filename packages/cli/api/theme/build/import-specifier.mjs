// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The import specifier a theme build prints in its install and scaffold
 * instructions.
 * @input An output folder relative to the outputs' project root, and the name
 *   of the file the snippet imports.
 * @output importSpecifier()
 * @position api/theme/build — read by the build (./build.mjs) and passed on
 *   by the theme entry (../theme.mjs), which gives it without loading the
 *   build.
 */

import * as path from 'node:path';

/**
 * Import specifier for install/scaffold instructions, from a file directly
 * in the project's src/ (the file the printed snippet says it is relative
 * to; callers pass the output folder from the outputs' project root): an output
 * under src/ is `./themes/gothic/gothic`, one beside src/ is
 * `../themes/gothic/gothic`.
 * @param {string} relDir the output folder, relative to the outputs' project root
 * @param {string} base
 * @returns {string}
 */
export function importSpecifier(relDir, base) {
  // An import specifier always uses `/`. On Windows the cwd-relative dir comes
  // from path.relative with `\`, which would print `./\themes\ocean/ocean`.
  const normalized = relDir === '.' ? '.' : relDir.split(path.sep).join('/');
  const fromSrc = path.posix.relative('src', normalized.replace(/\/+$/, ''));
  if (!fromSrc) return `./${base}`;
  // Only a parent step (`..` or `../…`), never a folder named like `..cache`.
  return fromSrc === '..' || fromSrc.startsWith('../')
    ? `${fromSrc}/${base}`
    : `./${fromSrc}/${base}`;
}
