// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The app's own source files, and whether any of them imports a given
 * module: read as files and syntax, never run.
 *
 * @input a project folder and a module path
 * @output SOURCE_EXTENSIONS, MARKUP_PAGE, SOURCE_FILE_LIMIT,
 *   listProjectSourceFiles, specifierTargets, projectImportsModule
 * @position read by doctor (whether the app imports the generated theme
 *   module and its stylesheets); no command receipt reads app source
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {moduleImports} from '../render/embedded-imports.mjs';
import {candidatesOf, matchPath, pathsFor} from '../render/ts-paths.mjs';

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

/** @param {string} file */
/** @param {string} file */
/** A module path of only `.` and `..`, with an optional `index`: `'..'`, `'./index'`. */
/** A page in a format that renders components but is not a script: MDX or Astro. */
export const MARKUP_PAGE = /\.(?:mdx|astro)$/u;

/**
 * A load in a module's text: `import(…)`, `require(…)`, `require.context(…)`
 * or `import.meta.glob(…)`, with the start of its path when the path is
 * written in quotes (the quote, then the text before any `${` or glob
 * character).
 */
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

/**
 * Whether a specifier in `fromFile` names `target`, with or without its
 * extension, or as a folder's index file: a relative specifier from the
 * file's folder, and a bare one through the `compilerOptions.paths` of the
 * tsconfig (or jsconfig) TypeScript reads for the file (`@/astryx-themes`
 * with `"@/*": ["./src/*"]`).
 * @param {string} specifier
 * @param {string} fromFile
 * @param {string} target
 */
export function specifierTargets(specifier, fromFile, target) {
  /** @type {string[]} */
  let bases;
  if (specifier.startsWith('.')) {
    bases = [path.resolve(path.dirname(fromFile), specifier)];
  } else {
    const match = matchPath(pathsFor(path.resolve(fromFile)), specifier);
    if (!match) return false;
    bases = candidatesOf(match);
  }
  const wanted = path.resolve(target);
  return bases.some(base =>
    [
      base,
      ...[...SOURCE_EXTENSIONS].map(extension => `${base}${extension}`),
      ...[...SOURCE_EXTENSIONS].map(extension =>
        path.join(base, `index${extension}`),
      ),
    ].some(candidate => path.resolve(candidate) === wanted),
  );
}

/**
 * Whether the project's own source imports `moduleFile` (statically, by
 * `import()` or by `require()`), and how many files did not parse.
 * @param {string} root
 * @param {string} moduleFile
 * @returns {{found: boolean, parseFailures: number}}
 */
export function projectImportsModule(root, moduleFile) {
  let parseFailures = 0;
  for (const file of listProjectSourceFiles(root, moduleFile)) {
    let records;
    try {
      records = moduleImports(fs.readFileSync(file, 'utf-8'), file);
    } catch {
      records = null;
    }
    if (records === null) {
      parseFailures += 1;
      continue;
    }
    if (
      records.some(record =>
        specifierTargets(record.specifier, file, moduleFile),
      )
    )
      return {found: true, parseFailures};
  }
  return {found: false, parseFailures};
}
