// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Where a scaffolded template goes when the caller names no place:
 * the folder that a printed `astryx template <name> <path>` command uses.
 *
 * @input  the project folder, the template type, and the template id.
 * @output a project-relative POSIX folder that does not exist yet.
 * @position foundation/discovery — read by the template copy's refusal and
 *   by build's scaffold commands, so every printed command names one place.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * The folder a page template goes to: the project's App Router folder when it
 * has one, so the page is a route and Next builds it. Next refuses to build a
 * `pages/` folder that is not beside the `app/` folder, so a project with an
 * App Router never gets `src/pages/`, and a project without one never gets a
 * new `app/` folder beside its own.
 * @param {string} projectDir
 * @returns {string}
 */
function pageFolder(projectDir) {
  if (isDirectory(path.join(projectDir, 'app'))) return 'app';
  if (isDirectory(path.join(projectDir, 'src', 'app'))) return 'src/app';
  return 'src/pages';
}

/**
 * The project-relative folder to scaffold a template into: `app/<id>` when
 * the project has an `app/` folder, else `src/app/<id>` when it has
 * `src/app/`, else `src/pages/<id>` for a page; `src/components/<id>` for a
 * block. When that path already exists (a route or a folder the app has), it
 * is `<id>-2`, `<id>-3` and so on, the first one that does not exist, so the
 * command runs as printed and never writes into a folder the app owns.
 *
 * @param {string} projectDir the folder the command runs in
 * @param {'page' | 'block'} type
 * @param {string} id the template id, as `astryx template <id>` takes it
 * @returns {string}
 */
export function templateDestination(projectDir, type, id) {
  const parent = type === 'block' ? 'src/components' : pageFolder(projectDir);
  let folder = `${parent}/${id}`;
  for (let n = 2; fs.existsSync(path.join(projectDir, folder)); n++) {
    folder = `${parent}/${id}-${n}`;
  }
  return folder;
}

/**
 * @param {string} dir
 * @returns {boolean}
 */
function isDirectory(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}
