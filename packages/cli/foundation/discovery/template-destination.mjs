// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Where a scaffolded template goes when the caller names no place:
 * the path that a printed `astryx template <name> <path>` command uses.
 *
 * @input  the project folder, the template type, and the template id.
 * @output a project-relative POSIX path that does not exist yet.
 * @position foundation/discovery — read by the template copy's refusal and
 *   by build's start and alternatives, so every printed command names one
 *   place.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  nestedRootLayouts,
  nextAppAt,
  nextRouteFolders,
  pagesRouterPage,
  sameUrlPage,
} from './next-routes.mjs';

/**
 * The project-relative path to scaffold a template into, read from the
 * project the way its framework reads it.
 *
 * In a Next app (its package.json depends on `next`), a page goes where Next
 * serves it when `tsx` is in its `pageExtensions`, as by default: in the App
 * Router folder (`app/<id>`, or `src/app/<id>`), inside the route group that
 * holds the root layout when that folder has none of its own; else, in an
 * app with only the Pages Router, to the page file `pages/<id>.tsx` (or
 * `src/pages/<id>.tsx`). A block goes beside the routes:
 * `app/components/<id>` with a root `app/` folder, `components/<id>` with a
 * root `pages/` folder only, else `src/components/<id>`. Every other project
 * gets `src/pages/<id>` for a page and `src/components/<id>` for a block.
 *
 * When that path exists, or another page already serves its URL (a page in
 * a route group, a Pages Router file), the id becomes `<id>-2`, `<id>-3` and
 * so on, the first one that is free, so the command runs as printed, the
 * app still builds, and nothing the app owns is written into.
 *
 * @param {string} projectDir the folder the command runs in
 * @param {'page' | 'block'} type
 * @param {string} id the template id, as `astryx template <id>` takes it
 * @returns {string}
 */
export function templateDestination(projectDir, type, id) {
  const routes = nextAppAt(projectDir)
    ? nextRouteFolders(projectDir)
    : {app: null, pages: null};
  if (type === 'block') {
    const parent =
      routes.app === 'app'
        ? 'app/components'
        : routes.pages === 'pages' && !routes.app
          ? 'components'
          : 'src/components';
    return firstFree(projectDir, id, n => `${parent}/${n}`);
  }
  if (routes.app) {
    const app = path.join(projectDir, routes.app);
    const rootLayout = nestedRootLayouts(app)[0];
    const parent = rootLayout
      ? path.relative(projectDir, rootLayout).split(path.sep).join('/')
      : routes.app;
    return firstFree(
      projectDir,
      id,
      n => `${parent}/${n}`,
      folder => sameUrlPage(projectDir, app, path.join(projectDir, folder)),
    );
  }
  if (routes.pages) {
    const pages = routes.pages;
    return firstFree(
      projectDir,
      id,
      n => `${pages}/${n}.tsx`,
      file => pagesRouterPage(projectDir, file.slice(pages.length + 1, -4)),
    );
  }
  return firstFree(projectDir, id, n => `src/pages/${n}`);
}

/**
 * The first of `id`, `id-2`, `id-3` and so on whose path does not exist and
 * whose URL no other page serves.
 * @param {string} projectDir
 * @param {string} id
 * @param {(name: string) => string} at the path for a name
 * @param {(rel: string) => string | null} [servedBy] the page that already
 *   serves that path's URL, or null
 * @returns {string}
 */
function firstFree(projectDir, id, at, servedBy = () => null) {
  let rel = at(id);
  for (
    let n = 2;
    fs.existsSync(path.join(projectDir, rel)) || servedBy(rel);
    n++
  ) {
    rel = at(`${id}-${n}`);
  }
  return rel;
}
