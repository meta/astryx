// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The scope rule for a folder `--to` names: inside the project root it
 * is a project place, anywhere else the computer's. A leaf with no CLI
 * imports, so the release chooser reads the same rule `init` applies
 * without loading the CLI to answer `astryx --version`.
 * @input a `--to` name, the folder the command runs in, the project root
 * @output whether the name is a folder, where it is, and its scope
 * @position foundation/agent-docs — read by skill-places.mjs and release/choose.mjs
 */

import * as path from 'node:path';

/**
 * Whether `value` is written as a path rather than a word.
 * @param {string} value
 * @returns {boolean}
 */
export function writtenAsPath(value) {
  return (
    value.startsWith('.') ||
    value.startsWith('~') ||
    value.includes('/') ||
    value.includes('\\') ||
    path.isAbsolute(value)
  );
}

/**
 * `value` as an absolute path: `~` is the home folder, a relative path is
 * from `cwd`.
 * @param {string} value
 * @param {string} cwd
 * @param {string} home
 * @returns {string}
 */
export function absoluteFolder(value, cwd, home) {
  if (value === '~') return home;
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(home, value.slice(2));
  }
  return path.resolve(cwd, value);
}

/**
 * Whether `dir` is `root` or inside it.
 * @param {string} dir
 * @param {string} root
 * @returns {boolean}
 */
export function inside(dir, root) {
  const rel = path.relative(root, dir);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * A folder name's place: where it is and its scope, or null when `name` is
 * not written as a path (a keyword, or an unknown name).
 * @param {string} name
 * @param {{cwd: string, projectRoot: string | null, home: string}} where
 * @returns {{dir: string, scope: 'project' | 'computer'} | null}
 */
export function folderScope(name, {cwd, projectRoot, home}) {
  if (!writtenAsPath(name)) return null;
  const dir = absoluteFolder(name, cwd, home);
  return {dir, scope: projectRoot != null && inside(dir, projectRoot) ? 'project' : 'computer'};
}
