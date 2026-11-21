// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The app's own source files, and whether any of them imports a given
 * module: read as files and syntax, never run.
 *
 * @input a project folder and a module path
 * @output specifierTargets, projectImportsModule (the source walk itself is
 *   project-source-files.mjs)
 * @position read by doctor (whether the app imports the generated theme
 *   module and its stylesheets); no command receipt reads app source
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {moduleImports} from '../render/embedded-imports.mjs';
import {candidatesOf, matchPath, pathsFor} from '../render/ts-paths.mjs';
import {
  SOURCE_EXTENSIONS,
  listProjectSourceFiles,
} from './project-source-files.mjs';

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
