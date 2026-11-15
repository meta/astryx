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
 * The project-relative folder to scaffold a template into.
 *
 * In a Next app with an App Router folder, a page goes in that folder
 * (`app/<id>` or `src/app/<id>`), so it is a route and Next builds it. Next
 * refuses to build a `pages/` folder that is not beside the `app/` folder, so
 * such an app never gets `src/pages/`. A block goes to `app/components/<id>`
 * in a Next app whose routes are in `app/`: that app often has no `src/`
 * folder, and its build and style compiler cover the folders it has, while
 * Next reads no route from a block's file name. Every other project gets
 * `src/pages/<id>` for a page and `src/components/<id>` for a block.
 *
 * When that path already exists (a route or a folder the app has), it is
 * `<id>-2`, `<id>-3` and so on, the first one that does not exist, so the
 * command runs as printed and never writes into a folder the app owns.
 *
 * @param {string} projectDir the folder the command runs in
 * @param {'page' | 'block'} type
 * @param {string} id the template id, as `astryx template <id>` takes it
 * @returns {string}
 */
export function templateDestination(projectDir, type, id) {
  const router = appRouterFolder(projectDir);
  const parent =
    type === 'block'
      ? router === 'app'
        ? 'app/components'
        : 'src/components'
      : (router ?? 'src/pages');
  let folder = `${parent}/${id}`;
  for (let n = 2; fs.existsSync(path.join(projectDir, folder)); n++) {
    folder = `${parent}/${id}-${n}`;
  }
  return folder;
}

/**
 * The App Router folder of a Next app (`app`, else `src/app`, as Next looks
 * for it), or null when the project is not a Next app or has neither.
 * @param {string} projectDir
 * @returns {'app' | 'src/app' | null}
 */
function appRouterFolder(projectDir) {
  if (!dependsOnNext(projectDir)) return null;
  if (isDirectory(path.join(projectDir, 'app'))) return 'app';
  if (isDirectory(path.join(projectDir, 'src', 'app'))) return 'src/app';
  return null;
}

/**
 * Whether the project's package.json depends on `next`.
 * @param {string} projectDir
 * @returns {boolean}
 */
function dependsOnNext(projectDir) {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'),
    );
    return ['dependencies', 'devDependencies'].some(key => pkg?.[key]?.next);
  } catch {
    return false;
  }
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
