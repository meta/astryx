// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The app's own source files, found by a bounded walk.
 * @input A project folder.
 * @output The source files under it, leaving out dependencies, generated
 *   output and links, up to a limit.
 * @position Read by `astryx doctor` and by the Core prop check that doctor
 *   and `astryx experimental export` share (discovery/unknown-core-props.mjs).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export const SOURCE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
]);

/** The folders the source walk skips as a build's output, at a package's root. */
const ROOT_OUTPUT_DIRS = new Set(['build', 'coverage', 'dist']);

const SKIP_DIRS = new Set([
  '.git',
  '.next',
  'build',
  'coverage',
  'dist',
  'node_modules',
]);

/** A page in a format that renders components but is not a script: MDX or Astro. */
export const MARKUP_PAGE = /\.(?:mdx|astro)$/u;

/** The most source files {@link listProjectSourceFiles} reads. */
export const SOURCE_FILE_LIMIT = 5000;

/**
 * A bounded app-source walk that excludes dependencies, generated output, and
 * links. Callers parse the returned bytes without executing app code.
 * @param {string} root
 * @param {string} generatedModule
 * @param {{stylesheets?: boolean, pages?: boolean, markup?: boolean, outputAtRootsOnly?: boolean, skippedLinks?: string[]}} [options] - also list
 *   `.css` files, `.html` pages, and `.mdx` and `.astro` pages; with
 *   `outputAtRootsOnly`, skip a `build`, `dist` or `coverage` folder only in
 *   a folder with a package.json, where a build writes its output, and read
 *   one anywhere else (an app route named `build`); `skippedLinks` collects
 *   each linked folder or source file the walk does not follow
 */
export function listProjectSourceFiles(root, generatedModule, options = {}) {
  /** @type {string[]} */
  const files = [];
  /** @type {string[]} */
  const queue = [root];
  while (queue.length > 0 && files.length < SOURCE_FILE_LIMIT) {
    const dir = /** @type {string} */ (queue.shift());
    let entries;
    try {
      entries = fs.readdirSync(dir, {withFileTypes: true});
    } catch {
      continue;
    }
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        if (options.skippedLinks && !SKIP_DIRS.has(entry.name)) {
          let linkedFolder = false;
          try {
            linkedFolder = fs.statSync(file).isDirectory();
          } catch {
            // A link that resolves to nothing holds no module.
          }
          if (
            linkedFolder ||
            SOURCE_EXTENSIONS.has(path.extname(entry.name)) ||
            MARKUP_PAGE.test(entry.name)
          ) {
            options.skippedLinks.push(file);
          }
        }
        continue;
      }
      if (entry.isDirectory()) {
        const skipped =
          SKIP_DIRS.has(entry.name) &&
          !(
            options.outputAtRootsOnly === true &&
            ROOT_OUTPUT_DIRS.has(entry.name) &&
            !fs.existsSync(path.join(dir, 'package.json'))
          );
        if (!skipped && !entry.name.startsWith('.astryx-')) {
          queue.push(file);
        }
      } else if (
        entry.isFile() &&
        file !== generatedModule &&
        (SOURCE_EXTENSIONS.has(path.extname(entry.name)) ||
          (options.stylesheets === true &&
            path.extname(entry.name) === '.css') ||
          (options.pages === true &&
            /^\.html?$/u.test(path.extname(entry.name))) ||
          (options.markup === true && MARKUP_PAGE.test(entry.name)))
      ) {
        files.push(file);
      }
    }
  }
  return files;
}
