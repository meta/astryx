// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How Next reads a project's folders: whether a folder is a Next app,
 * which folders hold its routes, and which page already serves a URL.
 *
 * @input  a project folder and folders inside it.
 * @output route folders, URLs, and the page that serves a URL.
 * @position foundation/discovery — the one reading of a Next app, shared by
 *   the theme preview (where its preview page goes) and the template
 *   destination (where a scaffolded page goes).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Whether a folder is a Next app: its package.json depends on `next`.
 * @param {string} dir
 */
export function nextAppAt(dir) {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
    );
    return ['dependencies', 'devDependencies'].some(k => pkg?.[k]?.next);
  } catch {
    return false;
  }
}

/**
 * The folders a Next app reads its routes from, relative to the app folder,
 * found as Next finds them: each of `app` and `pages` at the root, else in
 * `src/`. Null for a router the app does not use. Next refuses to build an
 * app whose `app` and `pages` folders are in different folders.
 * @param {string} dir the app folder
 * @returns {{app: 'app' | 'src/app' | null, pages: 'pages' | 'src/pages' | null}}
 */
export function nextRouteFolders(dir) {
  /** @param {string} rel */
  const isDirectory = rel => {
    try {
      return fs.statSync(path.join(dir, rel)).isDirectory();
    } catch {
      return false;
    }
  };
  const app = isDirectory('app')
    ? 'app'
    : isDirectory('src/app')
      ? 'src/app'
      : null;
  const pages = isDirectory('pages')
    ? 'pages'
    : isDirectory('src/pages')
      ? 'src/pages'
      : null;
  return {app, pages};
}

/**
 * The URL a folder of the routes folder is served at, with route groups
 * dropped, as path segments.
 * @param {string} app
 * @param {string} dir
 */
export const urlSegments = (app, dir) =>
  path
    .relative(app, dir)
    .split(path.sep)
    .filter(seg => seg && !/^\(.*\)$/.test(seg));

/** An optional catch-all route folder, `[[...slug]]`: it also serves its parent folder's URL (a required `[...slug]` does not). */
const CATCH_ALL = /^\[\[\.\.\.[^\]]+\]\]$/;

/** A file Next serves a URL from: a page or a route handler. */
const ROUTE_FILE = /^(page\.(tsx|ts|jsx|js|mdx)|route\.(tsx|ts|jsx|js))$/;

/**
 * The Pages Router file of the project that Next serves at `url` (path
 * segments joined with `/`, no leading slash), in `pages/` or `src/pages/`,
 * or null.
 * @param {string} cwd
 * @param {string} url
 * @returns {string | null}
 */
export function pagesRouterPage(cwd, url) {
  if (!url) return null;
  for (const pages of [path.join(cwd, 'pages'), path.join(cwd, 'src', 'pages')])
    for (const ext of ['tsx', 'ts', 'jsx', 'js']) {
      for (const f of [`${url}.${ext}`, `${url}/index.${ext}`]) {
        const full = path.join(pages, f);
        if (fs.existsSync(full)) return full;
      }
    }
  return null;
}

/**
 * A page or route handler of the app that Next serves at the same URL as
 * `dir`, or null: beside a new page in `dir`, Next refuses to build (a route
 * and a page), or the new page takes that URL from it.
 * @param {string} cwd
 * @param {string} app the routes folder
 * @param {string} dir
 */
export function sameUrlPage(cwd, app, dir) {
  const target = urlSegments(app, dir);
  const url = target.join('/');
  // A folder whose URL is not the start of this one holds no page served at
  // it, so the walk does not go into it: in a large app most folders are cut.
  /** @param {string} folder */
  const onTheWay = folder => {
    const segs = urlSegments(app, folder);
    const head = CATCH_ALL.test(segs.at(-1) ?? '') ? segs.slice(0, -1) : segs;
    return (
      head.length <= target.length && head.every((s, i) => s === target[i])
    );
  };
  /** @param {string} folder @returns {string | null} */
  const walk = folder => {
    /** @type {fs.Dirent[]} */
    let entries;
    try {
      entries = fs.readdirSync(folder, {withFileTypes: true});
    } catch {
      return null;
    }
    for (const e of entries) {
      const full = path.join(folder, e.name);
      if (e.isDirectory()) {
        if (
          /^[_@]/.test(e.name) ||
          e.name === 'node_modules' ||
          full === dir ||
          !onTheWay(full)
        )
          continue;
        const hit = walk(full);
        if (hit) return hit;
      } else if (ROUTE_FILE.test(e.name) && servesUrl(folder)) return full;
    }
    return null;
  };
  /** A folder served at the URL, or at the URLs under it through a catch-all. @param {string} folder */
  const servesUrl = folder => {
    const segs = urlSegments(app, folder);
    return (
      segs.join('/') === url ||
      (CATCH_ALL.test(segs.at(-1) ?? '') && segs.slice(0, -1).join('/') === url)
    );
  };
  // The folder itself: a route handler, a page other than the page.tsx a
  // new page writes, or a catch-all route in it.
  try {
    for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
      if (!e.isDirectory()) {
        if (ROUTE_FILE.test(e.name) && e.name !== 'page.tsx')
          return path.join(dir, e.name);
      } else if (CATCH_ALL.test(e.name))
        for (const name of fs.readdirSync(path.join(dir, e.name)))
          if (ROUTE_FILE.test(name)) return path.join(dir, e.name, name);
    }
  } catch {
    // No folder yet.
  }
  return walk(app) ?? pagesRouterPage(cwd, url);
}

/**
 * The folders that hold a root layout when the routes folder has none of
 * its own: each route group with a layout (`(shop)/`, `(marketing)/`), or
 * a `[locale]/` in an app with the locale in every URL. Empty when the
 * routes folder has its own root layout.
 * @param {string} app
 * @returns {string[]}
 */
export function nestedRootLayouts(app) {
  const LAYOUT = /^layout\.(tsx|ts|jsx|js)$/;
  if (fs.readdirSync(app).some(f => LAYOUT.test(f))) return [];
  /** @type {string[]} */
  const out = [];
  /** A folder with a layout counts; a route group without one is looked into. @param {string} dir @param {boolean} top */
  const look = (dir, top) => {
    for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
      if (!e.isDirectory()) continue;
      const sub = path.join(dir, e.name);
      const group = /^\(.+\)$/.test(e.name);
      if (!top && !group) continue;
      if (fs.readdirSync(sub).some(f => LAYOUT.test(f))) out.push(sub);
      else if (group) look(sub, false);
    }
  };
  look(app, true);
  return out.sort();
}
