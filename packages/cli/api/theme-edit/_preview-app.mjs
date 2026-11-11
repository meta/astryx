// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The in-app theme preview behind `astryx experimental theme preview`:
 * where the route lives, its data file, the pages it shows, and the starter
 * app `preview app` writes. Only files the preview wrote are replaced or
 * deleted, only inside its folder, and every check runs before the first
 * write.
 *
 * @position api/theme-edit — imported only by _adapter.mjs
 */

import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cliVersion} from '../../foundation/release/run-context.mjs';
import {isOutsideProject} from '../../foundation/env/project-scope.mjs';
import {
  assertWithin,
  PathSafetyError,
} from '../../foundation/fs/path-safety.mjs';
import {baseResolved, openProject} from './_project.mjs';
import {
  loadTheme,
  nearest,
  refuse,
  shown,
  themeFiles,
  buildTheme,
  fontPackages,
} from './_settings.mjs';
import {
  colorsPageSource,
  componentsPageSource,
  overviewPageSource,
  previewRouteSource,
  themeImports,
} from './_preview.mjs';
import {
  paletteFiles,
  paletteMapping,
  tempFor,
  writeWhole,
} from './_palette.mjs';
import {build} from '../build/build.mjs';
import {search} from '../search/search.mjs';
import {template} from '../template/template.mjs';
import {analyzeTemplateNeeds} from '../../foundation/discovery/template-needs.mjs';
import {detectStylingSystem} from '../../foundation/agent-docs/agent-docs.mjs';
import {requireProject, context} from './_context.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';

const E = ERROR_CODES;

/** The preview's data file: the pages it shows and the files it wrote. */
const PREVIEW_DATA = 'theme-preview.json';
const PREVIEW = 'astryx experimental theme preview';
const EDITOR = 'astryx experimental theme editor';
/**
 * The folder of the preview pages, beside the route. Next never routes a
 * folder whose name starts with `_`; a `pages/` folder at the project root or
 * in `src/` is Next's Pages Router.
 */
const PAGES_DIR = '_pages';
/** Where older releases put the pages; a preview found there is moved. */
const LEGACY_PAGES_DIR = 'pages';
const PAGE_ID = /^[a-z0-9][a-z0-9-]*$/;
/** At most this many words of a description go to the ranking. */
const MAX_WORDS = 40;

/**
 * @typedef {{id: string, label: string, file: string}} PreviewPage
 * @typedef {{version: 1, theme: string | null, pages: PreviewPage[], files: string[], hashes?: Record<string, string>}} PreviewData
 *   `hashes`: a short hash of each file as the preview wrote it, so a file
 *   changed by hand is never replaced or deleted
 * @typedef {(path: string | null) => string} Retry the command again, with
 *   this --path (null: none)
 */

/** A project-relative folder for messages: `.` for the project root. */
const shownDir = (/** @type {string} */ cwd, /** @type {string} */ dir) =>
  shown(cwd, dir) || '.';

/**
 * A value as one shell word: single quotes whenever a character could mean
 * something to a shell, so a suggested command is safe to paste.
 * @param {unknown} v
 */
const shq = v =>
  /^[\w./@:=+-]+$/.test(String(v))
    ? String(v)
    : `'${String(v).replace(/'/g, `'\\''`)}'`;

/**
 * Refuse a folder name that this platform would take literally in a way the
 * caller did not mean: Windows separators or a drive letter on POSIX, a `~`
 * the shell did not expand, white space at either end, or a name too long
 * for the file system.
 * @param {string} where
 * @param {string} what the flag or argument, for the message
 * @param {Retry} retry
 */
function checkFolderName(where, what, retry) {
  const posix = path.sep === '/';
  if (posix && (where.includes('\\') || /^[A-Za-z]:/.test(where))) {
    const fixed = where.replace(/\\/g, '/');
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `${what} ${where} uses Windows path syntax; folders here are separated by "/".`,
      {run: [retry(/^[A-Za-z]:/.test(where) ? null : fixed)]},
    );
  }
  if (where.startsWith('~'))
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `${what} ${where} starts with "~", which is not your home folder here; name the folder from the project.`,
      {run: [retry(null)]},
    );
  if (where !== where.trim())
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `${what} "${where}" starts or ends with white space.`,
      {run: [retry(where.trim() || null)]},
    );
  if (where.split(/[\\/]/).some(seg => Buffer.byteLength(seg) > 255))
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `${what} has a folder name longer than 255 bytes, which the file system does not allow.`,
      {run: [retry(null)]},
    );
}

/**
 * Why a folder is no place for files this command writes, or null: themes
 * live in themes/ (and a preview app's whole tree would ship with the
 * theme), packages in node_modules/, and Next serves every file under a
 * Pages Router folder (`pages/` or `src/pages/`) as a page.
 * @param {string} cwd
 * @param {string} dir
 */
function reservedFolder(cwd, dir) {
  const segs = shown(cwd, dir).split('/').filter(Boolean);
  if (segs[0] === 'themes')
    return 'themes/ holds the themes, and everything in a theme folder is copied with the theme';
  if (segs.includes('node_modules'))
    return 'node_modules/ belongs to the package manager, which replaces it';
  if (segs[0] === 'public')
    return 'Next serves every file in public/ as it is, at the site root, so anyone could download it';
  const odd = segs.find(
    seg =>
      /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(seg) || /^\.+$/.test(seg),
  );
  if (odd)
    return `${odd} is a name Windows does not allow for a folder, so the project could not be checked out there`;
  if (segs[0] === 'pages' || (segs[0] === 'src' && segs[1] === 'pages'))
    return 'Next serves every file under the Pages Router folder (pages/ or src/pages/) as a public page; this preview needs the App Router (app/ or src/app/)';
  return null;
}

/**
 * Why Next does not serve a folder inside the routes folder at its own
 * URL, or null: a `_private` folder is never routed, an `@slot` folder is a
 * parallel route slot, and a `[param]` folder is a dynamic segment.
 * @param {string} app the routes folder
 * @param {string} dir
 */
function unroutedSegment(app, dir) {
  const seg = path
    .relative(app, dir)
    .split(path.sep)
    .find(x => /^[_@[]/.test(x));
  return seg
    ? `Next does not serve the folder ${seg} at a URL of its own (_private folders are never routed, @slot and [param] folders are not plain URL segments)`
    : null;
}

/**
 * The URL a folder of the routes folder is served at, with route groups
 * dropped, as path segments.
 * @param {string} app
 * @param {string} dir
 */
const urlSegments = (app, dir) =>
  path
    .relative(app, dir)
    .split(path.sep)
    .filter(seg => seg && !/^\(.*\)$/.test(seg));

/**
 * The `pageExtensions` next.config sets, read as text (best effort), or
 * null when it sets none.
 * @param {string} cwd
 * @returns {string[] | null}
 */
function pageExtensions(cwd) {
  for (const name of [
    'next.config.mjs',
    'next.config.js',
    'next.config.ts',
    'next.config.cjs',
  ]) {
    /** @type {string} */
    let text;
    try {
      text = fs.readFileSync(path.join(cwd, name), 'utf8');
    } catch {
      continue;
    }
    const m = /pageExtensions\s*:\s*\[([^\]]*)\]/.exec(text);
    return m ? [...m[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map(x => x[1]) : null;
  }
  return null;
}

/**
 * A page of the app that Next serves at the same URL as `dir`, which would
 * stop the whole app from building, or null.
 * @param {string} cwd
 * @param {string} app the routes folder
 * @param {string} dir
 */
function sameUrlPage(cwd, app, dir) {
  const url = urlSegments(app, dir).join('/');
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
        if (/^[_@]/.test(e.name) || e.name === 'node_modules' || full === dir)
          continue;
        const hit = walk(full);
        if (hit) return hit;
      } else if (
        folder !== dir &&
        /^page\.(tsx|ts|jsx|js|mdx)$/.test(e.name) &&
        urlSegments(app, folder).join('/') === url
      )
        return full;
    }
    return null;
  };
  const inApp = walk(app);
  if (inApp) return inApp;
  for (const pages of [path.join(cwd, 'pages'), path.join(cwd, 'src', 'pages')])
    for (const ext of ['tsx', 'ts', 'jsx', 'js']) {
      for (const f of [`${url}.${ext}`, `${url}/index.${ext}`]) {
        const full = path.join(pages, f);
        if (url && fs.existsSync(full)) return full;
      }
    }
  return null;
}

/**
 * The folder that holds the root layout when the routes folder has none
 * of its own, such as `[locale]/` in an app with a locale in every URL.
 * @param {string} app
 * @returns {string | null}
 */
function nestedRootLayout(app) {
  if (fs.readdirSync(app).some(f => /^layout\.(tsx|ts|jsx|js)$/.test(f)))
    return null;
  for (const e of fs.readdirSync(app, {withFileTypes: true}))
    if (
      e.isDirectory() &&
      fs
        .readdirSync(path.join(app, e.name))
        .some(f => /^layout\.(tsx|ts|jsx|js)$/.test(f))
    )
      return path.join(app, e.name);
  return null;
}

/**
 * Refuse a folder where the preview would not be served as reported, or
 * would break the app: one that holds the app itself, a reserved or
 * unrouted folder, src/app/ while app/ is what Next serves, an app whose
 * next.config names other page extensions, a folder outside the folder of
 * the app's root layout, and a URL another page already has.
 * @param {string} cwd
 * @param {string} dir
 * @param {string} where how the folder was given, for messages
 * @param {Retry} retry
 */
function checkPlacement(cwd, dir, where, retry) {
  const served = [path.join(cwd, 'app'), path.join(cwd, 'src', 'app')].find(
    r => fs.existsSync(r) && fs.statSync(r).isDirectory(),
  );
  const fallback = retry(
    served
      ? shown(cwd, path.join(served, 'theme-preview'))
      : 'app/theme-preview',
  );
  if (fs.existsSync(dir) && !fs.statSync(dir).isDirectory())
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `${where} is a file; the preview goes in a folder of its own.`,
      {run: [retry(null)]},
    );
  if (holdsApp(cwd, dir)) {
    const record = path.join(dir, PREVIEW_DATA);
    /** @type {string | null} */
    let damaged = null;
    if (fs.existsSync(record))
      try {
        readPreview(cwd, dir);
      } catch {
        damaged = shown(cwd, record);
      }
    refuse(
      E.ERR_INVALID_ARGUMENT,
      damaged
        ? `${where} holds the app itself, and an older, damaged ${PREVIEW_DATA}.`
        : fs.existsSync(record)
          ? `${where} holds an older theme preview, in a folder that holds the app itself; remove it, then add the preview in its own folder.`
          : `${where} is no place for the preview: the folder holds the app itself (its root, src/, a routes folder or a package.json), and the app does not serve a preview there.`,
      damaged
        ? {
            fix: `give ${damaged} another name (for example ${PREVIEW_DATA}.broken), then run ${PREVIEW} add`,
          }
        : {
            run: fs.existsSync(record)
              ? [`${PREVIEW} remove --path ${shq(shownDir(cwd, dir))}`]
              : [fallback],
          },
    );
  }
  const app = [path.join(cwd, 'app'), path.join(cwd, 'src', 'app')].find(r =>
    dir.startsWith(r + path.sep),
  );
  const rootLayout = served ? nestedRootLayout(served) : null;
  // A [param] folder that holds the root layout (an app with the locale in
  // every URL) is where its pages go.
  const unrouted =
    app &&
    unroutedSegment(
      app,
      rootLayout && dir.startsWith(rootLayout + path.sep)
        ? path.join(app, path.relative(rootLayout, dir))
        : dir,
    );
  const why = reservedFolder(cwd, dir) ?? unrouted;
  if (why)
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `${where} is no place for the preview: ${why}.`,
      {run: [fallback]},
    );
  if (!app) return;
  if (served && app !== served)
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `${where} is in ${shown(cwd, app)}/, and Next serves ${shown(cwd, served)}/ instead when both are there.`,
      {
        run: fs.existsSync(path.join(dir, PREVIEW_DATA))
          ? [`${PREVIEW} remove --path ${shq(shownDir(cwd, dir))}`]
          : [fallback],
      },
    );
  const exts = pageExtensions(cwd);
  if (exts && !exts.includes('tsx'))
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `next.config sets pageExtensions to ${exts.join(', ')}, so Next does not serve page.tsx, the route file the preview writes.`,
      {fix: 'add "tsx" to pageExtensions to use the preview in this app'},
    );
  if (rootLayout && !dir.startsWith(rootLayout + path.sep))
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `${where} has no root layout above it: the app's root layout is in ${shown(cwd, rootLayout)}/, so a page there would have no html, global CSS or providers.`,
      {run: [retry(shown(cwd, path.join(rootLayout, 'theme-preview')))]},
    );
  const clash = sameUrlPage(cwd, app, dir);
  if (clash) {
    let free = `${dir}-2`;
    for (let n = 3; fs.existsSync(free); n++) free = `${dir}-${n}`;
    refuse(
      E.ERR_FILE_EXISTS,
      `${shown(cwd, clash)} already serves /${urlSegments(app, dir).join('/')}, so a preview in ${where} would stop the app from building.`,
      {run: [retry(shown(cwd, free))]},
    );
  }
}

/**
 * Where the preview route lives. `--path` names it (inside the project);
 * else an existing preview in the app's routes folder; else the one preview
 * a theme recorded elsewhere (`retry` given); else the routes folder Next
 * serves (`app/`, else `src/app/`).
 * @param {string} cwd
 * @param {string | undefined} where
 * @param {{optional?: boolean, write?: boolean, retry?: Retry}} [opts]
 *   `optional`: null instead of a refusal when there is no routes folder;
 *   `write`: the folder is checked as a place to write; `retry`: the
 *   command again with another --path, for refusals
 * @returns {{dir: string, app: string | null}} `app`: the routes folder, when the route is in one
 */
function previewDir(cwd, where, opts = {}) {
  const retry =
    opts.retry ??
    (p => `${PREVIEW} list${p == null ? '' : ` --path ${shq(p)}`}`);
  const routes = ['app', path.join('src', 'app')]
    .map(r => path.join(cwd, r))
    .filter(r => fs.existsSync(r) && fs.statSync(r).isDirectory());
  const appOf = (/** @type {string} */ dir) =>
    routes.find(r => dir.startsWith(r + path.sep)) ?? null;
  if (where != null) {
    checkFolderName(where, '--path', retry);
    /** @type {string} */
    let dir;
    try {
      dir = assertWithin(path.resolve(cwd, where), cwd, {
        allowAbsolute: true,
        label: '--path',
      });
    } catch (e) {
      if (e instanceof PathSafetyError)
        refuse(
          E.ERR_PATH_TRAVERSAL,
          `--path ${where} is outside the project; put the preview inside the folder you run the command from.`,
          {run: [retry(null)]},
        );
      throw e;
    }
    if (opts.write) checkPlacement(cwd, dir, `--path ${where}`, retry);
    return {dir, app: appOf(dir)};
  }
  const candidates = routes.map(r => path.join(r, 'theme-preview'));
  const known = candidates.find(d => fs.existsSync(path.join(d, PREVIEW_DATA)));
  if (!known && opts.retry) {
    // A preview added with --path is recorded with its theme, so a later
    // command finds it without the flag instead of starting a second one.
    const recorded = [
      ...new Set(editedThemes(cwd).flatMap(t => recordedPreviews(cwd, t))),
    ].filter(d => fs.existsSync(path.join(d, PREVIEW_DATA)));
    if (recorded.length === 1) {
      if (opts.write)
        checkPlacement(cwd, recorded[0], shownDir(cwd, recorded[0]), retry);
      return {dir: recorded[0], app: appOf(recorded[0])};
    }
    if (recorded.length > 1)
      refuse(
        E.ERR_INVALID_ARGUMENT,
        `There are ${recorded.length} theme previews here (${recorded.map(d => `${shownDir(cwd, d)}/`).join(', ')}) and none in the default place; name one with --path.`,
        {run: recorded.map(d => retry(shownDir(cwd, d)))},
      );
    // An older release could put a preview at the project root or in src/,
    // where its pages/ folder is the Pages Router: every page is public.
    const older = [cwd, path.join(cwd, 'src')].find(d =>
      fs.existsSync(path.join(d, PREVIEW_DATA)),
    );
    if (older) {
      if (opts.write) checkPlacement(cwd, older, shownDir(cwd, older), retry);
      return {dir: older, app: null};
    }
  }
  // The routes folder Next serves: app/ when both app/ and src/app/ are there.
  const served = routes[0];
  const nested = served && !known ? nestedRootLayout(served) : null;
  const dir = known ?? (served && path.join(nested ?? served, 'theme-preview'));
  if (!dir && opts.optional) return /** @type {any} */ (null);
  if (!dir)
    refuse(
      E.ERR_NOT_FOUND,
      'No app routes folder here (app/ or src/app/), so there is no app to put the preview in.',
      {
        run: [
          `${PREVIEW} add --path app/theme-preview  # an app routes folder beside the app's own`,
          `${PREVIEW} app theme-app  # a new starter app with the preview in it`,
        ],
      },
    );
  if (opts.write) checkPlacement(cwd, dir, `${shownDir(cwd, dir)}/`, retry);
  return {dir, app: appOf(dir)};
}

const CLI_PACKAGE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const STARTER = path.join(CLI_PACKAGE, 'assets', 'preview-app');

/**
 * `file` when it is inside `root`, also through links; else a refusal.
 * @param {string} file absolute
 * @param {string} root absolute
 * @param {string} what what the path is, for the refusal
 * @returns {string}
 */
function confined(file, root, what) {
  try {
    return assertWithin(file, root, {allowAbsolute: true, label: what});
  } catch (e) {
    if (e instanceof PathSafetyError) {
      /** @type {string | null} */
      let link = null;
      try {
        if (fs.lstatSync(file).isSymbolicLink()) link = fs.readlinkSync(file);
      } catch {
        // Not there: the path itself leads out.
      }
      refuse(
        E.ERR_PATH_TRAVERSAL,
        link == null
          ? `${what} ${file} is outside ${root}.`
          : `${what} ${file}, which is a link to ${link}, outside ${root}.`,
      );
    }
    throw e;
  }
}

/** Files a fresh folder may hold and still count as empty. */
const IGNORABLE = new Set(['.git', '.DS_Store', 'Thumbs.db']);

/**
 * The home page of a new starter app: it points to the preview.
 * The starter's own home page is the repository example's.
 */
const STARTER_HOME = `'use client';

import {VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Link} from '@astryxdesign/core/Link';

export default function Home() {
  return (
    <main style={{display: 'flex', justifyContent: 'center', padding: '4rem 2rem'}}>
      <VStack gap={3}>
        <Heading level={1}>Theme preview app</Heading>
        <Text type="body" color="secondary">
          Made by astryx experimental theme preview app. The preview pages wear the theme.
        </Text>
        <Link href="/theme-preview">Open the theme preview</Link>
      </VStack>
    </main>
  );
}
`;

/**
 * The files a new starter app (Next.js app router, Core and the neutral
 * theme) writes into `where`, with `extra` files beside them, checked before
 * anything is written: the folder is new or empty, it is not inside the
 * project's routes, themes or packages, and every file stays inside it,
 * also through links.
 * @param {string} cwd
 * @param {string} where
 * @param {(root: string) => Array<{rel: string, text: string | Buffer}>} extra files relative to the app folder
 * @param {Record<string, string>} dependencies added to the starter's package.json
 * @param {string | null} [slug] the theme, repeated in suggestions
 * @returns {{root: string, writes: Array<{file: string, text: string | Buffer}>}}
 */
function planStarterApp(cwd, where, extra, dependencies, slug = null) {
  const again = (/** @type {string | null} */ p) =>
    `${PREVIEW} app ${shq(p ?? 'theme-app')}${slug == null ? '' : ` --theme ${shq(slug)}`}`;
  checkFolderName(where, 'The app folder', again);
  /** @type {string} */
  let root;
  try {
    root = assertWithin(path.resolve(cwd, where), cwd, {
      allowAbsolute: true,
      label: 'the app folder',
    });
  } catch (e) {
    if (e instanceof PathSafetyError)
      refuse(
        E.ERR_PATH_TRAVERSAL,
        `${where} is outside the current folder; make the app inside the folder you run the command from.`,
        {run: [again(null)]},
      );
    throw e;
  }
  /** A free folder name inside the current folder, near `dir`. @param {string} dir */
  const freeNear = dir => {
    const parent = dir === cwd ? cwd : path.dirname(dir);
    const base = dir === cwd ? 'theme-app' : `${path.basename(dir)}-preview`;
    let free = base;
    for (let n = 2; fs.existsSync(path.join(parent, free)); n++)
      free = `${base}-${n}`;
    return shown(cwd, path.join(parent, free));
  };
  const name = shownDir(cwd, root);
  const routes = ['app', path.join('src', 'app')]
    .map(r => path.join(cwd, r))
    .filter(r => fs.existsSync(r) && fs.statSync(r).isDirectory());
  const why =
    reservedFolder(cwd, root) ??
    (routes.some(r => root === r || root.startsWith(r + path.sep))
      ? "it is inside this app's routes folder, where Next would serve the new app's files as pages of this one"
      : null);
  if (why) {
    let free = 'theme-app';
    for (let n = 2; fs.existsSync(path.join(cwd, free)); n++)
      free = `theme-app-${n}`;
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `${name} is no place for a new app: ${why}.`,
      {
        run: [
          again(free),
          `${PREVIEW} add  # the preview inside this app instead`,
        ],
      },
    );
  }
  /** @type {fs.Stats | null} */
  let st = null;
  try {
    st = fs.lstatSync(root);
  } catch {
    // A new folder.
  }
  if (st?.isSymbolicLink() && !fs.existsSync(root))
    refuse(
      E.ERR_FILE_EXISTS,
      `${name} is a link to ${fs.readlinkSync(root)}, which does not exist.`,
      {run: [again(freeNear(root))]},
    );
  if (st && fs.existsSync(root) && !fs.statSync(root).isDirectory())
    refuse(E.ERR_FILE_EXISTS, `${name} is a file; the app goes in a folder.`, {
      run: [again(freeNear(root))],
    });
  if (
    fs.existsSync(root) &&
    fs.readdirSync(root).some(entry => !IGNORABLE.has(entry))
  )
    refuse(
      E.ERR_FILE_EXISTS,
      `${name} exists and is not empty; a starter app goes only into a new or empty folder. Choose another name, or empty the folder.`,
      {run: [again(freeNear(root))]},
    );
  /** @type {Array<{file: string, text: string | Buffer}>} */
  const writes = [];
  /** @param {string} from */
  const walk = from => {
    for (const entry of fs.readdirSync(from, {withFileTypes: true})) {
      const src = path.join(from, entry.name);
      if (entry.isDirectory()) walk(src);
      else if (entry.name !== 'README.md') {
        const rel = path.relative(STARTER, src);
        const target = rel === 'gitignore' ? '.gitignore' : rel;
        const file = confined(
          path.join(root, target),
          root,
          'a starter app file',
        );
        const text = fs.readFileSync(src, 'utf8');
        const key = rel.split(path.sep).join('/');
        writes.push({
          file,
          text:
            key === 'package.json'
              ? starterPackageJson(text, dependencies)
              : key === 'src/app/page.tsx'
                ? STARTER_HOME
                : key === 'src/app/layout.tsx'
                  ? starterLayout(text)
                  : text,
        });
      }
    }
  };
  walk(STARTER);
  for (const x of extra(root))
    writes.push({
      file: confined(path.join(root, x.rel), root, 'an app file'),
      text: x.text,
    });
  return {root, writes};
}

/**
 * The starter's root layout, with a title and description of its own.
 * @param {string} text
 */
function starterLayout(text) {
  return text
    .replace(/title: '[^']*'/, "title: 'Theme preview'")
    .replace(
      /description:\s*'[^']*'/,
      "description: 'An Astryx app made to preview a theme'",
    );
}

/**
 * The starter's package.json with the Astryx packages pinned to this CLI's
 * release, and `dependencies` added.
 * @param {string} text
 * @param {Record<string, string>} dependencies
 */
function starterPackageJson(text, dependencies) {
  const pinned = text.replaceAll('{{astryxVersion}}', cliVersion());
  if (!Object.keys(dependencies).length) return pinned;
  const pkg = JSON.parse(pinned);
  pkg.dependencies = Object.fromEntries(
    Object.entries({...pkg.dependencies, ...dependencies}).sort(([a], [b]) =>
      a.localeCompare(b),
    ),
  );
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

/**
 * Write a planned starter app: into a temp folder beside it first, then
 * renamed into place (or moved into the empty folder), so a failure leaves
 * nothing behind. No install runs here.
 * @param {string} cwd
 * @param {{root: string, writes: Array<{file: string, text: string | Buffer}>}} plan
 * @param {(dir: string) => string} again the command with this folder
 * @returns {string[]} the files written
 */
function writeStarterApp(cwd, plan, again) {
  const {root} = plan;
  const parent = path.dirname(root);
  /** The folders on the way to the app that this call makes. @type {string[]} */
  const made = [];
  for (let d = parent; !fs.existsSync(d); d = path.dirname(d)) made.push(d);
  /** @type {string | null} */
  let tmp = null;
  /** @type {string[]} */
  const movedIn = [];
  try {
    fs.mkdirSync(parent, {recursive: true});
    tmp = fs.mkdtempSync(path.join(parent, '.astryx-app-'));
    for (const w of plan.writes) {
      const file = path.join(tmp, path.relative(root, w.file));
      fs.mkdirSync(path.dirname(file), {recursive: true});
      fs.writeFileSync(file, w.text);
    }
    if (!fs.existsSync(root)) {
      fs.renameSync(tmp, root);
      tmp = null;
    } else {
      for (const entry of fs.readdirSync(tmp)) {
        const to = path.join(root, entry);
        if (fs.existsSync(to))
          throw Object.assign(new Error(`${to} exists`), {code: 'EEXIST'});
        fs.renameSync(path.join(tmp, entry), to);
        movedIn.push(to);
      }
      fs.rmdirSync(tmp);
      tmp = null;
    }
  } catch (e) {
    for (const m of movedIn) fs.rmSync(m, {recursive: true, force: true});
    if (tmp) fs.rmSync(tmp, {recursive: true, force: true});
    for (const d of made)
      try {
        fs.rmdirSync(d);
      } catch {
        // Not empty: something else is in it now.
      }
    const code = /** @type {any} */ (e)?.code;
    if (code === undefined) throw e;
    if (code === 'EEXIST' || code === 'ENOTEMPTY')
      refuse(
        E.ERR_FILE_EXISTS,
        `${shownDir(cwd, root)} was filled by something else while the app was written, so the app was not put there.`,
        {run: [again(`${shownDir(cwd, root)}-2`)]},
      );
    refuse(
      E.ERR_WRITE_FAILED,
      `The app could not be written (${code}); nothing of it was left in ${shownDir(cwd, root)}.`,
      {run: [`${again(shownDir(cwd, root))}  # once the cause is fixed`]},
    );
  }
  return plan.writes.map(w => shown(cwd, w.file)).sort();
}

/**
 * Why a theme-preview.json is not the preview's data, or null. It is a file
 * anyone can edit, so its shape is checked before it decides any write or
 * delete. A path that leads out of the folder is refused later, by
 * {@link confined}.
 * @param {any} d
 * @returns {string | null}
 */
function previewProblem(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d))
    return 'it is not a JSON object';
  if (d.version !== 1)
    return `"version" is ${JSON.stringify(d.version)}, not 1`;
  if (d.theme != null && typeof d.theme !== 'string')
    return '"theme" is not a theme name or null';
  if (!Array.isArray(d.pages)) return '"pages" is not a list';
  if (!Array.isArray(d.files)) return '"files" is not a list';
  const ids = new Set();
  for (const p of d.pages) {
    if (!p || typeof p !== 'object' || Array.isArray(p))
      return '"pages" holds an entry that is not an object';
    if (typeof p.id !== 'string' || !PAGE_ID.test(p.id))
      return `the page id ${JSON.stringify(p.id)} is not lowercase letters, digits and dashes`;
    if (typeof p.label !== 'string')
      return `the page ${p.id} has no text label`;
    if (
      p.file !== `${PAGES_DIR}/${p.id}` &&
      p.file !== `${LEGACY_PAGES_DIR}/${p.id}`
    )
      return `the page ${p.id} names the file ${JSON.stringify(p.file)}, not ${PAGES_DIR}/${p.id}`;
    if (ids.has(p.id)) return `the page ${p.id} is listed twice`;
    ids.add(p.id);
  }
  for (const f of d.files)
    if (
      typeof f !== 'string' ||
      !f ||
      f.includes('\\') ||
      path.posix.isAbsolute(f) ||
      /^[A-Za-z]:/.test(f) ||
      f.split('/').some(x => x === '' || x === '.')
    )
      return `"files" holds ${JSON.stringify(f)}, which is not a file path relative to the folder`;
  if (
    d.hashes != null &&
    (typeof d.hashes !== 'object' ||
      Array.isArray(d.hashes) ||
      Object.values(d.hashes).some(h => typeof h !== 'string'))
  )
    return '"hashes" is not a map of file to hash';
  return null;
}

/**
 * Refuse a damaged theme-preview.json: it decides which files the preview
 * may replace or delete, so no preview command changes the folder until it
 * is fixed.
 * @param {string} cwd
 * @param {string} dir
 * @param {string} why
 * @param {string} pf the caller's --path flag, for the suggestion
 * @returns {never}
 */
function damagedPreview(cwd, dir, why, pf) {
  const folder = shownDir(cwd, dir);
  const record = `${folder}/${PREVIEW_DATA}`;
  refuse(
    E.ERR_THEME_INVALID,
    `${record} is damaged: ${why}. It lists the preview's pages and the files it wrote, so the preview commands leave the folder alone until it is fixed.`,
    {
      fix: holdsApp(cwd, dir)
        ? `fix ${record} by hand, or give it another name (for example ${PREVIEW_DATA}.broken): the folder holds your app, so keep the folder as it is; then add the preview in its own folder with ${PREVIEW} add`
        : `fix ${record} by hand; or give the folder a new name that starts with _ (Next does not serve such a folder, and nothing in it is lost), then run ${PREVIEW} add${pf} again`,
    },
  );
}

/**
 * Whether a folder holds the app itself: the project root, src/, a routes
 * folder (app/ or src/app/), or any folder with a package.json. Nothing
 * the preview writes goes there, and nothing there is deleted on a record's
 * word alone.
 * @param {string} cwd
 * @param {string} dir
 */
function holdsApp(cwd, dir) {
  return (
    dir === cwd ||
    dir === path.join(cwd, 'src') ||
    dir === path.join(cwd, 'app') ||
    dir === path.join(cwd, 'src', 'app') ||
    fs.existsSync(path.join(dir, 'package.json'))
  );
}

/**
 * The preview's data, null when the folder has none; a refusal when the
 * file is there but unreadable or of the wrong shape.
 * @param {string} cwd
 * @param {string} dir
 * @param {string} [pf] the caller's --path flag, for the refusal
 * @returns {PreviewData | null}
 */
function readPreview(cwd, dir, pf = '') {
  /** @type {string} */
  let text;
  try {
    // A byte-order mark (Notepad, PowerShell) is not part of the JSON.
    text = fs
      .readFileSync(path.join(dir, PREVIEW_DATA), 'utf8')
      .replace(/^\uFEFF/, '');
  } catch (e) {
    const code = /** @type {any} */ (e)?.code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    damagedPreview(cwd, dir, `it cannot be read (${code})`, pf);
  }
  /** @type {any} */
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    damagedPreview(
      cwd,
      dir,
      `it is not valid JSON (${/** @type {Error} */ (e).message})`,
      pf,
    );
  }
  const problem = previewProblem(data);
  if (problem) damagedPreview(cwd, dir, problem, pf);
  data.files = [...new Set(data.files)];
  return data;
}

/** A short hash of a file's text. @param {string | Buffer} text */
const digest = text =>
  createHash('sha256').update(text).digest('hex').slice(0, 16);

/**
 * A file's text as a formatter could have left it: white space outside
 * strings collapsed (and dropped next to punctuation), statement
 * semicolons and trailing commas dropped, and every string written with one
 * quote kind. The text inside strings, comments, template literals and
 * JSX text is kept, so a hand edit there always shows.
 * @param {string} text
 */
function formatterNeutral(text) {
  const PUNCT = /[{}()[\],;:<>=/.?!&|+*%^~-]/;
  // A quote starts a string after an operator, an opening bracket or one
  // of these words; elsewhere (JSX text such as "don't") it is plain text.
  const STRING_AFTER =
    /(?:^|[=({[,:;!&|?+<]|\b(?:from|import|return|case|in|of|typeof|export|default))$/;
  let out = '';
  let space = false;
  /** @param {string} t */
  const put = t => {
    if (space && out && !PUNCT.test(out.at(-1) ?? '') && !PUNCT.test(t[0]))
      out += ' ';
    space = false;
    out += t;
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) {
      space = true;
      i++;
      continue;
    }
    if (c === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {
      const end =
        text[i + 1] === '/'
          ? text.indexOf('\n', i) === -1
            ? text.length
            : text.indexOf('\n', i)
          : text.indexOf('*/', i + 2) === -1
            ? text.length
            : text.indexOf('*/', i + 2) + 2;
      put(text.slice(i, end).replace(/\s+/g, ' ').trim());
      space = true;
      i = end;
      continue;
    }
    if ((c === '"' || c === "'") && STRING_AFTER.test(out.trimEnd())) {
      let j = i + 1;
      let body = '';
      while (j < text.length && text[j] !== c && text[j] !== '\n') {
        if (text[j] === '\\' && j + 1 < text.length) {
          const n = text[j + 1];
          body += n === '"' || n === "'" ? n : text.slice(j, j + 2);
          j += 2;
        } else body += text[j++];
      }
      if (text[j] === c) {
        put(`'${body.replace(/'/g, "\\'")}'`);
        i = j + 1;
        continue;
      }
    }
    if (c === '`') {
      let j = i + 1;
      let depth = 0;
      while (j < text.length && !(text[j] === '`' && depth === 0)) {
        if (text[j] === '\\') j++;
        else if (text[j] === '$' && text[j + 1] === '{') depth++;
        else if (text[j] === '}' && depth > 0) depth--;
        j++;
      }
      put(text.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    if (c === ';') {
      space = true;
      i++;
      continue;
    }
    if (c === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (/[}\])]/.test(text[j] ?? '')) {
        i++;
        continue;
      }
    }
    put(c);
    i++;
  }
  return out;
}

/**
 * The hash recorded for a file the preview writes, of its formatter-neutral
 * text, so a formatter run (prettier, eslint --fix) does not count as a
 * change by hand while an edit inside a string does.
 * @param {string | Buffer} text
 */
const contentHash = text => `v2:${digest(formatterNeutral(String(text)))}`;

/**
 * The normalized hash of an earlier release (white space, semicolons,
 * commas and quote kinds dropped everywhere). Read only for records that
 * hold it; the next write records {@link contentHash}.
 * @param {string | Buffer} text
 */
const oldContentHash = text =>
  digest(
    String(text)
      .replace(/["'`]/g, "'")
      .replace(/[\s;,]+/g, ''),
  );

/**
 * Whether a file the preview wrote was changed since, by its recorded hash.
 * A file with no hash counts as unchanged here; {@link ownedUnchanged}
 * decides deletes, and never deletes a file with no hash.
 * @param {string} dir
 * @param {PreviewData} data
 * @param {string} rel
 */
function editedByHand(dir, data, rel) {
  const was = data.hashes?.[rel];
  if (!was) return false;
  try {
    const text = fs.readFileSync(path.join(dir, rel));
    if (was.startsWith('v2:')) return contentHash(text) !== was;
    // Older records hold the exact or the earlier normalized hash.
    return oldContentHash(text) !== was && digest(text) !== was;
  } catch {
    return false;
  }
}

/**
 * Whether the preview may delete a file its record lists: only its own
 * route file, its record, and the page file of a recorded page (in
 * _pages/, or pages/ for an older release), and only when a recorded hash
 * shows the file is as the preview wrote it. Anything else the record names
 * is kept: a record can be copied, merged or edited by hand.
 * @param {string} dir
 * @param {PreviewData} data
 * @param {string} rel
 * @param {Set<string>} ids the recorded page ids
 * @returns {'delete' | 'not-preview' | 'no-hash' | 'edited'}
 */
function ownedUnchanged(dir, data, rel, ids) {
  if (rel === PREVIEW_DATA) return 'delete';
  const page = /^(?:_pages|pages)\/([a-z0-9][a-z0-9-]*)\.tsx$/.exec(rel);
  if (rel !== 'page.tsx' && !(page && ids.has(page[1]))) return 'not-preview';
  if (!data.hashes?.[rel]) return 'no-hash';
  return editedByHand(dir, data, rel) ? 'edited' : 'delete';
}

/**
 * Why a file the preview listed is kept, for the result notes.
 * @param {string} name
 * @param {'not-preview' | 'no-hash' | 'edited'} why
 */
const keptNote = (name, why) =>
  why === 'not-preview'
    ? `${name} is kept: theme-preview.json lists it, but the preview only writes page.tsx and page files in ${PAGES_DIR}/`
    : why === 'no-hash'
      ? `${name} is kept: theme-preview.json has no record of how the preview wrote it, so it may hold your changes; delete it yourself if it is the preview's`
      : `${name} was changed by hand after the preview wrote it, so it is kept`;

/**
 * Check one planned write before anything is written. A file the preview
 * did not write is never replaced, unless it already holds exactly the
 * planned text (a page an interrupted run left behind is adopted). A file
 * the preview wrote and someone changed since is not replaced either.
 * @param {string} cwd
 * @param {string} dir
 * @param {PreviewData} data
 * @param {{rel: string, text: string}} w
 * @param {string} elsewhere a command that puts the preview in a free folder
 * @returns {'new' | 'same' | 'replace'}
 */
function checkWrite(cwd, dir, data, w, elsewhere) {
  const file = confined(path.join(dir, w.rel), dir, 'a preview file');
  /** @type {fs.Stats} */
  let st;
  try {
    st = fs.lstatSync(file);
  } catch {
    return 'new';
  }
  const name = shown(cwd, file);
  if (!st.isFile())
    refuse(
      E.ERR_FILE_EXISTS,
      `${name} is ${st.isDirectory() ? 'a folder' : 'not a plain file'}, where the preview writes a file; it is never replaced.`,
      {run: [elsewhere]},
    );
  if (fs.readFileSync(file, 'utf8') === w.text) return 'same';
  const page = /^_?pages\/([^/]+)\.tsx$/.exec(w.rel)?.[1];
  if (!data.files.includes(w.rel))
    refuse(
      E.ERR_FILE_EXISTS,
      `${name} exists and the preview did not write it; it is never replaced.`,
      page
        ? {
            fix: `give ${name} another name if you want to keep it, then run the command again; or add another page`,
            run: ['astryx template --list --type page'],
          }
        : {
            fix: `move ${name} out of the folder, then run the command again; or put the preview in another folder`,
            run: [elsewhere],
          },
    );
  if (editedByHand(dir, data, w.rel))
    refuse(
      E.ERR_FILE_EXISTS,
      `${name} was changed by hand after the preview wrote it, so it is not replaced.`,
      {
        fix: `copy your changes out of ${name}, then delete it or give it another name, and run the command again`,
      },
    );
  return 'replace';
}

/**
 * Apply a checked plan to the preview folder: every write goes to a temp
 * file first, then all are renamed into place, then the deletes run, then
 * theme-preview.json is written with the new hashes. When any step fails,
 * every file is put back as it was, and the refusal says so.
 * @param {string} cwd
 * @param {string} dir
 * @param {PreviewData} data
 * @param {Array<{rel: string, text: string, keepHash?: boolean}>} writes
 *   `keepHash`: a file moved as it is keeps its recorded hash
 * @param {string[]} deletes relative to dir
 * @param {string} again the command, to run again once the cause is fixed
 */
function commitPreview(cwd, dir, data, writes, deletes, again) {
  /** The temp file of each target. @type {Map<string, string>} */
  const temps = new Map();
  const tmp = (/** @type {string} */ file) => {
    if (!temps.has(file)) temps.set(file, tempFor(file));
    return /** @type {string} */ (temps.get(file));
  };
  /** @type {string[]} */
  const staged = [];
  /** Folders this call made. @type {string[]} */
  const made = [];
  /** @type {Array<{file: string, before: Buffer | null}>} */
  const touched = [];
  const before = (/** @type {string} */ file) => {
    try {
      return fs.readFileSync(file);
    } catch {
      return null;
    }
  };
  /** @param {string} folder */
  const mkdir = folder => {
    /** @type {string[]} */
    const missing = [];
    for (let d = folder; !fs.existsSync(d); d = path.dirname(d))
      missing.unshift(d);
    fs.mkdirSync(folder, {recursive: true});
    made.push(...missing);
  };
  /** @param {string} file @param {string} text */
  const stage = (file, text) => {
    // Recorded before the write, so a write that fails halfway (a full
    // disk) leaves no temp file behind.
    staged.push(tmp(file));
    fs.writeFileSync(tmp(file), text);
    try {
      // A file someone made read-only keeps its mode.
      fs.chmodSync(tmp(file), fs.statSync(file).mode & 0o777);
    } catch {
      // A new file.
    }
  };
  let current = dir;
  let step = 'written';
  try {
    for (const w of writes) {
      current = confined(path.join(dir, w.rel), dir, 'a preview file');
      mkdir(path.dirname(current));
      stage(current, w.text);
    }
    for (const w of writes) {
      current = path.join(dir, w.rel);
      touched.push({file: current, before: before(current)});
      fs.renameSync(tmp(current), current);
    }
    staged.length = 0;
    step = 'removed';
    for (const rel of deletes) {
      current = confined(path.join(dir, rel), dir, 'a preview file');
      const was = before(current);
      if (was == null) continue;
      touched.push({file: current, before: was});
      fs.rmSync(current);
    }
    step = 'written';
    const hashes = {...data.hashes};
    for (const w of writes)
      if (!w.keepHash || !hashes[w.rel]) hashes[w.rel] = contentHash(w.text);
    for (const rel of deletes) delete hashes[rel];
    for (const rel of Object.keys(hashes))
      if (!data.files.includes(rel)) delete hashes[rel];
    data.hashes = hashes;
    if (!data.files.includes(PREVIEW_DATA)) data.files.push(PREVIEW_DATA);
    current = path.join(dir, PREVIEW_DATA);
    touched.push({file: current, before: before(current)});
    stage(current, `${JSON.stringify(data, null, 2)}\n`);
    fs.renameSync(tmp(current), current);
  } catch (e) {
    for (const t of staged) fs.rmSync(t, {force: true});
    for (const t of touched.reverse())
      try {
        if (t.before == null) fs.rmSync(t.file, {force: true});
        else fs.writeFileSync(t.file, t.before);
      } catch {
        // Best effort: the refusal below names the file.
      }
    for (const d of made.reverse())
      try {
        fs.rmdirSync(d);
      } catch {
        // Not empty: something else is in it now.
      }
    if (/** @type {any} */ (e)?.code === undefined) throw e;
    refuse(
      E.ERR_WRITE_FAILED,
      `${shown(cwd, current)} could not be ${step} (${/** @type {any} */ (e).code}), so every file of the preview was put back as it was.`,
      {run: [`${again}  # once the cause is fixed`]},
    );
  }
}

/**
 * Move the pages an older release wrote into pages/ to {@link PAGES_DIR}/,
 * in the plan and in `data`: a pages/ folder at the project root or in
 * src/ is Next's Pages Router. A page the preview did not write keeps its
 * place.
 * @param {string} cwd
 * @param {string} dir
 * @param {PreviewData} data
 * @returns {{writes: Array<{rel: string, text: string, keepHash: boolean}>, deletes: string[], moved: string[]}}
 */
function movedPages(cwd, dir, data) {
  /** @type {Array<{rel: string, text: string, keepHash: boolean}>} */
  const writes = [];
  /** @type {string[]} */
  const deletes = [];
  /** @type {string[]} */
  const moved = [];
  for (const p of data.pages) {
    const from = `${p.file}.tsx`;
    if (
      !p.file.startsWith(`${LEGACY_PAGES_DIR}/`) ||
      !data.files.includes(from)
    )
      continue;
    const to = `${PAGES_DIR}/${p.id}.tsx`;
    const target = confined(path.join(dir, to), dir, 'a preview file');
    /** @type {string | null} */
    let text = null;
    try {
      text = fs.readFileSync(
        confined(path.join(dir, from), dir, 'a preview file'),
        'utf8',
      );
    } catch {
      // Gone already: only the record moves.
    }
    if (
      fs.existsSync(target) &&
      (text == null || fs.readFileSync(target, 'utf8') !== text)
    )
      refuse(
        E.ERR_FILE_EXISTS,
        `${shown(cwd, target)} exists and the preview did not write it; the preview moves its pages there.`,
        {
          fix: `give ${shown(cwd, target)} another name if you want to keep it, then run the command again`,
        },
      );
    p.file = `${PAGES_DIR}/${p.id}`;
    data.files = data.files.map(f => (f === from ? to : f));
    if (data.hashes?.[from]) {
      data.hashes[to] = data.hashes[from];
      delete data.hashes[from];
    }
    if (text == null) continue;
    writes.push({rel: to, text, keepHash: true});
    deletes.push(from);
    moved.push(p.id);
  }
  return {writes, deletes, moved};
}

/** Remove the page folders when nothing is left in them. @param {string} dir */
function tidyPageFolders(dir) {
  for (const sub of [PAGES_DIR, LEGACY_PAGES_DIR])
    try {
      fs.rmdirSync(path.join(dir, sub));
    } catch {
      // Not there, or not empty: something there is not the preview's.
    }
}

/** The themes this command made, by name. @param {string} cwd */
function editedThemes(cwd) {
  const root = path.join(cwd, 'themes');
  return fs.existsSync(root)
    ? fs
        .readdirSync(root)
        .filter(d => fs.existsSync(themeFiles(cwd, d).settings))
        .sort()
    : [];
}

/**
 * The theme the route imports; null for the app's own theme. A theme that
 * does not load is refused here, before the route or any page is written.
 * With `build`, a theme with no build yet is built now; without it,
 * `unbuilt` says so and the caller builds it once every check has passed
 * ({@link buildWorn}).
 * @param {string} cwd
 * @param {string} dir
 * @param {PreviewData} data
 * @param {{build?: boolean}} [opts]
 * @returns {Promise<{name: string, module: string, css: string[], mode: 'system' | 'light' | 'dark', unbuilt?: boolean} | null>}
 */
async function routeTheme(cwd, dir, data, opts = {}) {
  if (!data.theme) return null;
  const t = loadTheme(cwd, data.theme);
  const ctx = await context(cwd);
  const unbuilt = !fs.existsSync(themeFiles(cwd, data.theme).js);
  if (unbuilt && opts.build !== false) await buildTheme(ctx, data.theme, t);
  const ti = themeImports(ctx, data.theme, t, dir);
  return {
    name: data.theme,
    module: ti.module,
    css: ti.css,
    mode: ti.mode,
    ...(unbuilt && opts.build === false ? {unbuilt: true} : {}),
  };
}

/**
 * Build the theme a preview wears when it has no build yet, holding that
 * theme's lock (an `editor set` on it waits), with a note: a preview
 * command writes the theme's build only once every check has passed.
 * @param {string} cwd
 * @param {{name: string, unbuilt?: boolean} | null} theme from {@link routeTheme}
 * @param {any} options the command's options, with `lockTheme` from the adapter
 * @param {string[]} notes
 */
async function buildWorn(cwd, theme, options, notes) {
  if (!theme?.unbuilt) return;
  const slug = theme.name;
  const build = async () => {
    if (fs.existsSync(themeFiles(cwd, slug).js)) return;
    await buildTheme(await context(cwd), slug, loadTheme(cwd, slug));
  };
  await (typeof options?.lockTheme === 'function'
    ? options.lockTheme(slug, build)
    : build());
  notes.push(
    `built ${shown(cwd, themeFiles(cwd, slug).dir)}/ first: its build was missing`,
  );
}

/** The Colors page: its id and file, relative to the route folder. */
const COLORS_PAGE = {
  id: 'colors',
  label: 'Colors',
  file: `${PAGES_DIR}/colors`,
};

/**
 * The Colors page source of a theme, and whether the theme has generated
 * colors. The page imports the generated color module, so it follows every
 * change; the tokens that use each shade are written into it.
 * @param {string} cwd
 * @param {string} dir the route folder
 * @param {string} slug
 * @returns {Promise<{source: string, colors: boolean}>}
 */
async function colorsPage(cwd, dir, slug) {
  const data = loadTheme(cwd, slug);
  const ctx = await context(cwd);
  const pal = paletteMapping(
    cwd,
    slug,
    data,
    await baseResolved(ctx.project, data.like),
    ctx.project.core.tokenDefaults,
  );
  const file = path.join(cwd, paletteFiles(slug).palette);
  if (!pal || !fs.existsSync(file))
    return {
      source: colorsPageSource({slug, module: null, seeds: {}, uses: {}}),
      colors: false,
    };
  /** Whether the theme sets a token exactly, as a whole-theme value, in a mode. @param {string} token @param {'light' | 'dark'} m */
  const exact = (token, m) =>
    data.settings.some(
      s =>
        s.source === 'token' &&
        s.thing === token &&
        !s.on &&
        !s.when &&
        !s.state &&
        (!s.mode || s.mode === m),
    );
  /** @type {Record<string, Record<'light' | 'dark', Record<string, string[]>>>} */
  const uses = {};
  // Only the theme's own modes have shades; text on a fill is marked on
  // the neutral shade it uses, and pure black or white on no shade.
  const modes = /** @type {Array<'light' | 'dark'>} */ (
    data.mode === 'light-only'
      ? ['light']
      : data.mode === 'dark-only'
        ? ['dark']
        : ['light', 'dark']
  );
  for (const [token, v] of Object.entries(pal.tokens)) {
    for (const m of modes) {
      if (exact(token, m)) continue;
      const r = v[m];
      if (r.family === 'black' || r.family === 'white') continue;
      const byMode = (uses[r.family ?? v.family] ??= {light: {}, dark: {}});
      (byMode[m][r.stop] ??= []).push(
        `${token}${r.alpha ? ` (opacity ${r.alpha})` : ''}`,
      );
    }
  }
  const pageDir = path.join(dir, path.dirname(COLORS_PAGE.file));
  const rel = path
    .relative(pageDir, file.replace(/\.ts$/, ''))
    .split(path.sep)
    .join('/');
  return {
    source: colorsPageSource({
      slug,
      module: rel.startsWith('.') ? rel : `./${rel}`,
      seeds: Object.fromEntries(pal.families.map(f => [f.id, f.seed])),
      uses,
    }),
    colors: true,
  };
}

/**
 * The route file and, when the preview has one, the Colors page as the
 * page list and the theme say now. With `gone`, the theme the preview wore
 * was deleted: its Colors page says the preview has no theme colors.
 * @param {string} cwd
 * @param {string} dir
 * @param {PreviewData} data
 * @param {{name: string, module: string, css: string[], mode?: 'system' | 'light' | 'dark'} | null} theme from {@link routeTheme}
 * @param {{gone?: string | null, by?: string}} [opts] `by`: the command named in the route's header
 * @returns {Promise<Array<{rel: string, text: string}>>}
 */
async function routeWrites(cwd, dir, data, theme, opts = {}) {
  /** @type {Array<{rel: string, text: string}>} */
  const out = [];
  const colors = data.pages.find(p => p.id === COLORS_PAGE.id);
  const rel = colors && `${colors.file}.tsx`;
  if (rel && data.files.includes(rel)) {
    if (data.theme)
      out.push({rel, text: (await colorsPage(cwd, dir, data.theme)).source});
    else if (opts.gone)
      out.push({
        rel,
        text: colorsPageSource({
          slug: opts.gone,
          module: null,
          seeds: {},
          uses: {},
        }),
      });
  }
  out.push({
    rel: 'page.tsx',
    text: previewRouteSource({pages: data.pages, theme, by: opts.by}),
  });
  return out;
}

/**
 * Rewrite the in-app preview routes of a theme when their imports changed, so
 * a font package installed after `set` loads on the next change or `show`,
 * and its Colors page, so it names the shades the tokens use now.
 * The preview in the usual place (app/ or src/app/theme-preview) and every
 * preview added with --path for the theme are kept this way. A damaged
 * preview, and a file changed by hand, are left as they are.
 * @param {string} cwd
 * @param {string} slug
 * @returns {Promise<{changed: boolean, stale: string[]}>} `changed`: the
 *   route or the Colors page was rewritten; `stale`: preview files changed by
 *   hand, which keep showing the theme as it was
 */
export async function refreshPreviewRoute(cwd, slug) {
  const at = previewDir(cwd, undefined, {optional: true});
  const dirs = [
    ...new Set([...(at ? [at.dir] : []), ...recordedPreviews(cwd, slug)]),
  ];
  let changed = false;
  /** @type {string[]} */
  const stale = [];
  for (const dir of dirs) {
    /** @type {PreviewData | null} */
    let data;
    try {
      data = readPreview(cwd, dir);
    } catch {
      continue;
    }
    if (!data || data.theme !== slug || !data.files.includes('page.tsx'))
      continue;
    const writes = (
      await routeWrites(cwd, dir, data, await routeTheme(cwd, dir, data))
    ).filter(w => {
      const file = confined(path.join(dir, w.rel), dir, 'a preview file');
      if (!data.files.includes(w.rel)) return false;
      if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === w.text)
        return false;
      if (editedByHand(dir, data, w.rel)) {
        stale.push(shown(cwd, file));
        return false;
      }
      return true;
    });
    if (!writes.length) continue;
    commitPreview(cwd, dir, data, writes, [], `${EDITOR} show ${slug}`);
    changed = true;
  }
  return {changed, stale};
}

/**
 * Where a theme's previews are, so a preview added with --path is kept in
 * step too: themes/<theme>/previews.json, project-relative folders.
 * @param {string} cwd
 * @param {string} slug
 */
const previewsFile = (cwd, slug) =>
  path.join(themeFiles(cwd, slug).dir, 'previews.json');

/**
 * The preview folders recorded for a theme that are still inside the
 * project.
 * @param {string} cwd
 * @param {string} slug
 * @returns {string[]}
 */
function recordedPreviews(cwd, slug) {
  try {
    const list = JSON.parse(fs.readFileSync(previewsFile(cwd, slug), 'utf8'));
    return (Array.isArray(list) ? list : [])
      .map(rel => path.resolve(cwd, String(rel)))
      .filter(dir => !path.relative(cwd, dir).startsWith('..'));
  } catch {
    return [];
  }
}

/**
 * Record a preview folder for a theme, or with `keep` false forget it.
 * @param {string} cwd
 * @param {string} slug
 * @param {string} dir
 * @param {boolean} [keep]
 */
function recordPreview(cwd, slug, dir, keep = true) {
  if (!fs.existsSync(themeFiles(cwd, slug).dir)) return;
  const rel = path.relative(cwd, dir).split(path.sep).join('/');
  const list = recordedPreviews(cwd, slug)
    .map(d => path.relative(cwd, d).split(path.sep).join('/'))
    .filter(x => x !== rel);
  if (keep) list.push(rel);
  const file = previewsFile(cwd, slug);
  if (list.length) writeWhole(file, `${JSON.stringify(list, null, 2)}\n`);
  else fs.rmSync(file, {force: true});
}

/**
 * How to open the preview, from where it is.
 * @param {string} cwd
 * @param {{dir: string, app: string | null}} at
 */
function openLine(cwd, at) {
  // The routes folder by place, also one this command has just made.
  const app =
    at.app ??
    [path.join(cwd, 'app'), path.join(cwd, 'src', 'app')].find(r =>
      at.dir.startsWith(r + path.sep),
    );
  if (app) {
    // A (group) folder is not part of the URL; a [param] folder is a value
    // the person picks; each other folder is one URL segment, encoded.
    const segs = urlSegments(app, at.dir);
    const params = segs.filter(seg => /^\[.+\]$/.test(seg));
    const url = segs
      .map(seg =>
        /^\[.+\]$/.test(seg)
          ? `<${seg.replace(/^\[+\.*|\]+$/g, '')}>`
          : encodeURIComponent(seg),
      )
      .join('/');
    return `open /${url} in the running app${params.length ? `, with a value for ${params.join(', ')}` : ''}`;
  }
  const routes = ['app', path.join('src', 'app')].filter(r =>
    fs.existsSync(path.join(cwd, r)),
  );
  if (routes.length)
    return `the preview is in ${shownDir(cwd, at.dir)}/, outside the app's routes folder (${routes[0].split(path.sep).join('/')}/), so the app does not serve it: put it there with --path ${routes[0].split(path.sep).join('/')}/theme-preview`;
  return `no app routes folder (app/ or src/app/) was found, so the preview is in ${shownDir(cwd, at.dir)}/; serve page.tsx from a route of your app, or make a starter app around a preview with ${PREVIEW} app <dir>`;
}

/**
 * Why a template page was skipped.
 * @param {{missingPackages: string[], notInstalled: string[], stylexCompiler: boolean}} s
 */
function skipReason(s) {
  return [
    ...(s.missingPackages.length
      ? [`needs ${s.missingPackages.join(', ')}`]
      : []),
    ...(s.notInstalled.length
      ? [
          `needs ${s.notInstalled.join(', ')}, which the app's package.json names but is not installed`,
        ]
      : []),
    ...(s.stylexCompiler
      ? [
          'uses StyleX, and this app has no StyleX compiler (astryx docs styling-overview)',
        ]
      : []),
  ].join(' and ');
}

/**
 * The page templates for a description, best first, each with why: the
 * build ranking's picks, then the template search's, so a page the app
 * cannot show has a next match. App frames (the Shell templates) are left
 * out: the preview is an app shell already, and `--template` can still name
 * one. The closest page is added even when it is not exactly the page asked
 * for, with a note; only a description no page relates to is refused, with
 * the closest pages to name instead, and nothing is written.
 * @param {string} words
 * @param {string} cwd
 * @param {string[]} notes notes for the result
 * @param {string} flags the caller's other flags, for the suggestions
 * @returns {Promise<Array<{name: string, displayName: string, why: string}>>}
 */
async function rankedPages(words, cwd, notes, flags) {
  const kit =
    /** @type {import('../build/build.type.mjs').BuildKitResponse} */ (
      await build(words, {cwd})
    );
  const start = kit.data.start;
  const listed = await pageTemplates(cwd);
  const frames = new Set(
    listed.filter(t => /^Shell\b/.test(t.category ?? '')).map(t => t.id),
  );
  const found = /** @type {any} */ (
    await search(words, {cwd, type: 'template', limit: 20})
  ).data.results.filter((/** @type {any} */ r) => r.kind === 'page');
  /** @type {Map<string, string>} */
  const matchedWords = new Map(
    found.map((/** @type {any} */ r) => [
      r.name,
      String(r.reason ?? '').replace(/^matches \d+\/\d+ terms: /, ''),
    ]),
  );
  const names = [
    ...(start ? [start.name, ...start.alternatives.map(a => a.name)] : []),
    ...found.map((/** @type {any} */ r) => r.name),
  ].filter((n, i, a) => a.indexOf(n) === i);
  const skippedFrames = names.filter(n => frames.has(n));
  const pages = names.filter(n => !frames.has(n));
  /** @param {string} name */
  const label = name => listed.find(t => t.id === name)?.name ?? name;
  const suggest = (/** @type {string[]} */ list) =>
    list.slice(0, 3).map(n => `${PREVIEW} add --template ${n}${flags}`);
  // With no page close, a few pages that need nothing more, and the list.
  const fallback = [
    ...suggest(
      ['dashboard', 'settings', 'login'].filter(id =>
        listed.some(t => t.id === id),
      ),
    ),
    'astryx template --list --type page',
  ];
  // No page relates when the ranking fell back to a frame with no direct
  // match, and no page the search found matches three words of the request
  // or two fifths of them.
  const termsMatched = (/** @type {any} */ r) => {
    const m = /^matches (\d+)\/(\d+)/.exec(String(r.reason ?? ''));
    if (!m) return 0;
    const [hit, of] = [Number(m[1]), Number(m[2])];
    return hit >= 3 || hit / of >= 0.4 ? hit : 0;
  };
  // A page the description names in a phrase (a blog post, an issue
  // tracker) always relates.
  const named = APP_PAGES.some(([re]) => re.test(words.toLowerCase()));
  const unrelated =
    !named &&
    (!pages.length ||
      (start &&
        start.basis === 'fallback' &&
        frames.has(start.name) &&
        !kit.data.directMatch &&
        !found.some(
          (/** @type {any} */ r) => !frames.has(r.name) && termsMatched(r) >= 2,
        )));
  if (unrelated)
    refuse(
      E.ERR_NOT_FOUND,
      `No page template relates to "${words}". Name a page to add it anyway.`,
      {
        run: pages.length
          ? [...suggest(pages), 'astryx template --list --type page']
          : fallback,
      },
    );
  if (skippedFrames.length)
    notes.push(
      `left out ${skippedFrames.join(', ')}: app frames, not pages (add one with --template <id>)`,
    );
  const closest = start && start.basis === 'closest';
  const text = words.toLowerCase();
  // An app the description names (an app screenshot, an issue tracker, a
  // board) shows its theme better than a hero, so a page for it goes first.
  const exists = (/** @type {string} */ id) =>
    listed.some(t => t.id === id) && !frames.has(id);
  const app = APP_PAGES.find(([re, ids]) => re.test(text) && ids.some(exists));
  // A hero described as left-aligned or split takes the side layout.
  const side =
    /\bleft[- ]aligned\b|\bsplit\b|\bside[- ]by[- ]side\b|\basymmetric/.test(
      text,
    ) &&
    pages[0] !== 'side-gallery' &&
    /hero|landing/.test(text);
  /** @type {Map<string, string>} */
  const reasons = new Map();
  if (app) {
    // The ranked page stays first when it already serves the app named;
    // the app's pages come next, in order, so the next one is taken when
    // one cannot be shown here.
    const named = /** @type {RegExpExecArray} */ (app[0].exec(text))[0];
    const keep = app[1].includes(pages[0]) ? pages[0] : null;
    const ids = app[1].filter(id => exists(id) && id !== keep);
    for (const id of [...ids].reverse()) {
      if (pages.includes(id)) pages.splice(pages.indexOf(id), 1);
      pages.splice(keep ? 1 : 0, 0, id);
    }
    if (keep)
      reasons.set(
        keep,
        `the description names ${named}, and this page is that app`,
      );
    ids.forEach((id, k) =>
      reasons.set(
        id,
        k === 0 && !keep
          ? `the description names ${named}, and this page is made for that`
          : `the next page for ${named}`,
      ),
    );
  } else if (side && listed.some(t => t.id === 'side-gallery')) {
    if (pages.includes('side-gallery'))
      pages.splice(pages.indexOf('side-gallery'), 1);
    pages.unshift('side-gallery');
    reasons.set(
      'side-gallery',
      'the description asks for a left-aligned or split hero, and this hero puts the copy beside the picture',
    );
  }
  if (/\btop[- ]?nav|\bnav ?bar|\bnavigation bar|\bheader nav/.test(text))
    notes.push(
      'no page has a top nav of its own: the preview frame has one, and your app keeps its own',
    );
  return pages.map((name, i) => {
    const words = matchedWords.get(name);
    const doc = listed.find(t => t.id === name)?.description ?? '';
    const shape = doc.split(/(?<=\.)\s/)[0];
    const reason = reasons.get(name);
    return {
      name,
      displayName: label(name),
      why: reason
        ? `${reason}${words ? `; it covers ${words}` : ''}. ${shape}`
        : i === 0 && closest
          ? `the closest page, not exactly the one described${words ? `: it covers ${words}` : ''}; the rest of the description is not on it. ${shape}`
          : `${i === 0 ? 'the best match' : 'the next match'}${words ? `: it covers ${words}` : ''}. ${shape}`,
    };
  });
}

/**
 * App pages for the apps a description names, best first. Each is matched
 * by a phrase, never one loose word, so "buy tickets" is not an issue
 * tracker and "an AI tool" is not a chat. A detail view comes before its
 * list.
 * @type {Array<[RegExp, string[]]>}
 */
const APP_PAGES = [
  [
    /\b(issue|ticket|bug|task|work[- ]item) (detail|details|view|page)\b/,
    ['work-item-detail', 'detail-page'],
  ],
  [
    /\b(issue[- ]?tracker|bug[- ]tracker|issue (list|table|queue|board)|ticket(ing)? (system|queue|tracker)|backlog)\b/,
    ['table-grouped', 'table'],
  ],
  [/\b(kanban|task board|project board)\b/, ['kanban-board']],
  [/\b(analytics )?dashboard\b|\banalytics (app|page|view)\b/, ['dashboard']],
  [
    /\b(email|mail) (inbox|client|app)\b|\binbox (app|view|page)\b/,
    ['table-inbox'],
  ],
  [
    /\b(chat (app|interface|ui|window|screen|view)|chatbot|ai (chat|assistant) (app|interface|ui))\b/,
    ['ai-chat'],
  ],
  [/\b(settings|preferences) (page|screen|panel|view)\b/, ['settings']],
  [/\b(docs|documentation) (site|page|portal)\b/, ['documentation']],
  [/\b(data ?table|spreadsheet|data grid)\b/, ['table']],
  [
    /\b(blog( post)?|article|news (story|article|page)|essay|long[- ]read)\b/,
    ['documentation-design', 'course-detail'],
  ],
  [
    /\b(app|product) (screenshot|window|preview|ui)\b/,
    ['table-grouped', 'dashboard', 'table'],
  ],
];

/**
 * The page templates this project has, with their display names.
 * @param {string} cwd
 * @returns {Promise<Array<{id: string, name: string, category?: string, description?: string}>>}
 */
async function pageTemplates(cwd) {
  return /** @type {any} */ (
    (await template(undefined, {list: true, type: 'page', cwd})).data
  );
}

/**
 * Whether a package is installed for the project: its folder is in a
 * node_modules/ of the project or above it. A package the package.json
 * names but nobody installed does not count.
 * @param {string} cwd
 * @param {string} pkg
 */
function installed(cwd, pkg) {
  for (let dir = cwd; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'node_modules', pkg, 'package.json')))
      return true;
    if (path.dirname(dir) === dir) return false;
  }
}

/**
 * The packages a source really imports: import and export-from statements
 * and `import('…')` calls in code, never words in comments, strings or
 * template literals (a template's sample text may read `from "Next"`).
 * Only valid npm package names count.
 * @param {string} source
 * @returns {string[]}
 */
function importedPackages(source) {
  /** @type {string[]} */
  const strings = [];
  let code = '';
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i);
      i = end === -1 ? source.length : end;
      code += ' ';
    } else if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 2;
      code += ' ';
    } else if (c === '`') {
      let j = i + 1;
      let depth = 0;
      while (j < source.length && !(source[j] === '`' && depth === 0)) {
        if (source[j] === '\\') j++;
        else if (source[j] === '$' && source[j + 1] === '{') depth++;
        else if (source[j] === '}' && depth > 0) depth--;
        j++;
      }
      i = j + 1;
      code += '``';
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < source.length && source[j] !== c && source[j] !== '\n')
        j += source[j] === '\\' ? 2 : 1;
      if (source[j] === c) {
        strings.push(source.slice(i + 1, j));
        code += `"\u0000${strings.length - 1}\u0000"`;
        i = j + 1;
      } else {
        // An apostrophe in JSX text, not a string.
        code += c;
        i++;
      }
    } else {
      code += c;
      i++;
    }
  }
  const STR = '"\\u0000(\\d+)\\u0000"';
  const patterns = [
    new RegExp(
      `(?:^|[;}\\n])\\s*import\\s+(?:type\\s+)?(?:[\\w$*{}\\s,]+?\\s+from\\s*)?${STR}`,
      'g',
    ),
    new RegExp(
      `(?:^|[;}\\n])\\s*export\\s+(?:type\\s+)?(?:\\*(?:\\s+as\\s+[\\w$]+)?|\\{[^}]*\\})\\s*from\\s*${STR}`,
      'g',
    ),
    new RegExp(`\\bimport\\s*\\(\\s*${STR}\\s*\\)`, 'g'),
  ];
  /** @type {Set<string>} */
  const out = new Set();
  for (const re of patterns)
    for (const m of code.matchAll(re)) {
      const spec = strings[Number(m[1])];
      if (!spec || /^[./]/.test(spec) || spec.startsWith('node:')) continue;
      const name = spec.startsWith('@')
        ? spec.split('/').slice(0, 2).join('/')
        : spec.split('/')[0];
      if (/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name))
        out.add(name);
    }
  return [...out];
}

/**
 * The package-manager command that adds packages to the app.
 * @param {string} cwd
 * @param {string[]} pkgs
 */
function addCommandOf(cwd, pkgs) {
  const pm = installCommandOf(cwd).split(' ')[0];
  return `${pm === 'npm' ? 'npm install' : `${pm} add`} ${pkgs.join(' ')}`;
}

/**
 * What a template page needs that the app lacks, from its real imports:
 * packages the app's package.json does not name (with the command that
 * adds them), packages it names that are not installed (with the install
 * command), and a StyleX compiler.
 * @param {string} cwd
 * @param {string} source
 */
function pageNeeds(cwd, source) {
  const pkgs = importedPackages(source);
  // The shared check reads its own regex over the source; it gets only the
  // real imports here.
  const needs = analyzeTemplateNeeds(
    pkgs.map(p => `import '${p}';`).join('\n'),
    cwd,
  );
  /** @type {Record<string, string>} */
  let declared = {};
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'),
    );
    declared = {
      ...pkg.optionalDependencies,
      ...pkg.peerDependencies,
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
  } catch {
    // No readable package.json: nothing is declared.
  }
  const absent = pkgs.filter(
    p =>
      !needs.missingPackages.includes(p) &&
      !/^(react|react-dom|next)$/.test(p) &&
      !p.startsWith('@astryxdesign/') &&
      !installed(cwd, p),
  );
  const notInstalled = absent.filter(p => p in declared);
  const undeclared = absent.filter(p => !(p in declared));
  const missingPackages = [...needs.missingPackages, ...undeclared];
  const commands = [
    ...(needs.installCommand
      ? [[needs.installCommand, ...undeclared].join(' ')]
      : undeclared.length
        ? [addCommandOf(cwd, undeclared)]
        : []),
    ...(notInstalled.length ? [installCommandOf(cwd)] : []),
  ];
  return {
    missingPackages,
    notInstalled,
    installCommand: commands.length ? commands.join(' && ') : null,
    noCommand: needs.missingPackages.length > 0 && !needs.installCommand,
    stylexCompiler:
      pkgs.includes('@stylexjs/stylex') &&
      detectStylingSystem(cwd) !== 'stylex',
  };
}

/** The command that installs what the package.json names. @param {string} cwd */
function installCommandOf(cwd) {
  for (const [lock, pm] of /** @type {const} */ ([
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
    ['bun.lock', 'bun'],
  ]))
    if (fs.existsSync(path.join(cwd, lock))) return `${pm} install`;
  return 'npm install';
}

/**
 * The settings of the theme a preview wears, or a refusal that names the
 * themes there are: the closest editor theme by name, or for a package
 * theme (the base themes) what to do instead.
 * @param {string} cwd
 * @param {string} slug
 * @param {(theme: string | null) => string} again the command with this --theme (null: none)
 * @param {string} without what leaving --theme out does
 */
function wornTheme(cwd, slug, again, without) {
  try {
    return loadTheme(cwd, slug);
  } catch (e) {
    const code = /** @type {any} */ (e)?.code;
    // A theme that is there but does not load is its own refusal.
    if (code === E.ERR_THEME_INVALID || code === E.ERR_THEME_LOAD) throw e;
    const name = String(slug)
      .trim()
      .toLowerCase()
      .replace(/^@astryxdesign\/theme-/, '')
      .replace(/^\.?\/?themes\//, '')
      .replace(/\/+$/, '');
    const themes = editedThemes(cwd);
    if (!themes.includes(name) && isPackageTheme(cwd, name)) {
      const missing =
        name !== 'neutral' && !installed(cwd, `@astryxdesign/theme-${name}`);
      refuse(
        E.ERR_UNKNOWN_THEME,
        `${slug} is a package theme, not a theme made by ${EDITOR}; ${without}.`,
        {
          run: [
            again(null),
            ...(missing
              ? [
                  `${addCommandOf(cwd, [`@astryxdesign/theme-${name}`])}  # then a theme of your own can start from it`,
                ]
              : []),
            `${EDITOR} new my-${name} --like ${name}  # a theme of your own that starts from it`,
          ],
        },
      );
    }
    const near = themes.includes(name) ? [name] : nearest(name, themes);
    if (near.length)
      refuse(
        E.ERR_UNKNOWN_THEME,
        `There is no theme "${slug}" under themes/.`,
        {run: near.map(n => again(n))},
      );
    throw e;
  }
}

/**
 * Whether a name is a theme package: the neutral base, or an installed
 * `@astryxdesign/theme-<name>`.
 * @param {string} cwd
 * @param {string} name
 */
function isPackageTheme(cwd, name) {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) return false;
  // The base themes ship with the CLI, installed or not.
  const bases = fs.existsSync(BASE_THEMES)
    ? fs.readdirSync(BASE_THEMES)
    : ['neutral'];
  return bases.includes(name) || installed(cwd, `@astryxdesign/theme-${name}`);
}

/** The base themes this CLI knows, one folder each. */
const BASE_THEMES = path.join(CLI_PACKAGE, 'assets', 'templates', 'themes');

/**
 * The page template `--template` names, or a refusal: a block or component
 * example is not a page, and the suggestions are page templates only, as
 * commands.
 * @param {string} cwd
 * @param {string} id
 * @param {string} flags the caller's other flags
 * @returns {Promise<{name: string, displayName: string, why: string}>}
 */
async function namedTemplate(cwd, id, flags) {
  const pages = await pageTemplates(cwd);
  // Page ids are lowercase: LOGIN names login.
  const hit =
    pages.find(t => t.id === id) ?? pages.find(t => t.id === id.toLowerCase());
  if (hit)
    return {
      name: hit.id,
      displayName: hit.name ?? hit.id,
      why: 'named with --template',
    };
  try {
    const shownTemplate =
      /** @type {import('../template/template.type.mjs').TemplateShowResponse} */ (
        await template(id, {cwd, type: 'page'})
      );
    const name = shownTemplate.data.template;
    return {
      name,
      displayName: pages.find(t => t.id === name)?.name ?? name,
      why: 'named with --template',
    };
  } catch (e) {
    if (/** @type {any} */ (e)?.code !== E.ERR_UNKNOWN_TEMPLATE) throw e;
  }
  const all = /** @type {Array<{id: string, type: string}>} */ (
    /** @type {any} */ (await template(undefined, {list: true, cwd})).data
  );
  const other = all.find(t => t.id === id);
  const near = nearest(
    id.toLowerCase(),
    pages.map(t => t.id),
    5,
  );
  refuse(
    E.ERR_UNKNOWN_TEMPLATE,
    other
      ? `${id} is a ${other.type} template, not a page; preview add takes page templates.`
      : `There is no page template "${id}".`,
    {
      run: [
        ...near.map(n => `${PREVIEW} add --template ${n}${flags}`),
        'astryx template --list --type page',
      ],
    },
  );
}

/**
 * The text of a recorded page written again: a default page, or the page
 * template its id names when the app can show it; else null.
 * @param {string} cwd
 * @param {string} id
 * @param {(id: string) => Promise<{text: string}>} defaultPage
 * @returns {Promise<string | null>}
 */
async function pageAgain(cwd, id, defaultPage) {
  if (id === 'overview' || id === 'components')
    return (await defaultPage(id)).text;
  try {
    const shownTemplate =
      /** @type {import('../template/template.type.mjs').TemplateShowResponse} */ (
        await template(id, {cwd, type: 'page'})
      );
    const source = shownTemplate.data.source;
    const needs = pageNeeds(cwd, source);
    if (
      needs.missingPackages.length ||
      needs.notInstalled.length ||
      needs.stylexCompiler
    )
      return null;
    return source;
  } catch {
    return null;
  }
}

/**
 * Add pages to the in-app theme preview, and write the preview route the
 * first time. With a description, the build ranking picks the template
 * pages that fit it best (`top` of them); `template` names one instead.
 * With neither, the default pages: the sample app page, every component,
 * and the theme's generated colors when it has any.
 * Every check runs before the first write, so a refusal changes nothing;
 * the files are staged and renamed into place together.
 * @experimental
 * @param {string} [description]
 * @param {import('./theme-edit.type.mjs').ThemeEditPreviewAddOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditPreviewAddResponse>}
 */
export async function themeEditPreviewAdd(description, options = {}) {
  const {cwd = process.cwd()} = options;
  if (isOutsideProject(cwd))
    refuse(
      E.ERR_PROJECT_REQUIRED,
      'No package.json here, so there is no app to put the preview in.',
      {
        run: [
          `${PREVIEW} add  # run in your app`,
          `${PREVIEW} app <dir>  # a new starter app with the preview in it`,
        ],
      },
    );
  const pf = options.path != null ? ` --path ${shq(options.path)}` : '';
  const tf = options.theme != null ? ` --theme ${shq(options.theme)}` : '';
  const said = (description ?? '').trim();
  const named =
    options.template == null ? null : String(options.template).trim();
  if (named === '')
    refuse(E.ERR_INVALID_ARGUMENT, '--template needs a page template id.', {
      run: [
        `${PREVIEW} add --template dashboard${tf}${pf}`,
        'astryx template --list --type page',
      ],
    });
  if (said && named != null)
    refuse(
      E.ERR_INVALID_ARGUMENT,
      '--template names the page; a description asks the ranking to pick one, so drop one of them.',
      {
        run: [
          `${PREVIEW} add --template ${shq(named)}${tf}${pf}`,
          `${PREVIEW} add ${shq(said)}${tf}${pf}`,
        ],
      },
    );
  const top = options.top == null ? 1 : Number(String(options.top));
  if (options.top != null && !/^[1-3]$/.test(String(options.top)))
    refuse(
      E.ERR_INVALID_ARGUMENT,
      `--top takes 1, 2 or 3, not "${String(options.top)}".`,
      {
        run: [
          `${PREVIEW} add ${shq(said || 'a sales dashboard')} --top 2${tf}${pf}`,
        ],
      },
    );
  if (options.top != null && !said)
    refuse(
      E.ERR_INVALID_ARGUMENT,
      named != null
        ? '--top says how many ranked pages to add; --template names one page, so drop --top.'
        : '--top says how many pages to add for a description, and there is none.',
      {
        run: [
          named != null
            ? `${PREVIEW} add --template ${shq(named)}${tf}${pf}`
            : `${PREVIEW} add 'a sales dashboard' --top ${String(options.top)}${tf}${pf}`,
        ],
      },
    );
  /** @type {string[]} */
  const notes = [];
  let words = said;
  const allWords = said ? said.split(/\s+/) : [];
  if (allWords.length > MAX_WORDS) {
    const seen = new Set();
    words = allWords
      .filter(w => {
        const k = w.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, MAX_WORDS)
      .join(' ');
    notes.push(
      `the description has ${allWords.length} words; the first ${MAX_WORDS} different ones picked the page`,
    );
  }
  const retry = (/** @type {string | null} */ p) =>
    `${PREVIEW} add${said ? ` ${shq(said)}` : ''}${named != null ? ` --template ${shq(named)}` : ''}${tf}${p == null ? '' : ` --path ${shq(p)}`}`;
  const at = previewDir(cwd, options.path, {write: true, retry});
  const existing = readPreview(cwd, at.dir, pf);
  /** @type {PreviewData} */
  const data = existing ?? {version: 1, theme: null, pages: [], files: []};
  const wore = data.theme;
  const againWith = (/** @type {string | null} */ t) =>
    `${PREVIEW} add${said ? ` ${shq(said)}` : ''}${named != null ? ` --template ${shq(named)}` : ''}${t == null ? '' : ` --theme ${t}`}${pf}`;
  const without = "leave out --theme and the pages wear the app's own theme";
  if (options.theme != null) {
    wornTheme(cwd, options.theme, againWith, without);
    data.theme = options.theme;
  } else if (data.theme && !fs.existsSync(themeFiles(cwd, data.theme).dir)) {
    const themes = editedThemes(cwd);
    data.theme = themes.length === 1 ? themes[0] : null;
    notes.push(
      `the preview wore ${wore}, which is gone; it now wears ${data.theme ?? "the app's own theme"}`,
    );
  } else if (!data.theme) {
    const themes = editedThemes(cwd);
    data.theme = themes.length === 1 ? themes[0] : null;
    if (themes.length > 1)
      notes.push(
        `${themes.length} themes under themes/ (${themes.join(', ')}): the pages wear the app's own theme; pass --theme ${themes[0]} to wear one`,
      );
  }
  if (data.theme) wornTheme(cwd, data.theme, againWith, without);
  const switched = existing != null && wore !== data.theme;
  const gone =
    wore && !data.theme && !fs.existsSync(themeFiles(cwd, wore).dir)
      ? wore
      : null;
  if (switched && !gone)
    notes.push(
      `the preview now wears ${data.theme ?? "the app's own theme"} (was ${wore ?? "the app's own theme"}), so its pages are written again`,
    );
  const project = await openProject(cwd);
  /** @param {string} id */
  const defaultPage = async id =>
    id === 'overview'
      ? {
          id,
          label: 'Overview',
          text: overviewPageSource(project, {theme: data.theme}),
        }
      : {
          id,
          label: 'Components',
          text: componentsPageSource(project, {
            theme: data.theme,
            C: (await context(cwd)).C,
          }).source,
        };
  /** @type {Array<{id: string, label: string, text: string}>} */
  const add = [];
  /** @type {Array<{page: string, reason: string, installCommand: string | null}>} */
  const skipped = [];
  /** @type {Array<{page: string, why: string}>} */
  const matched = [];
  /** @type {string[]} */
  const runs = [];
  let stylexSkipped = false;
  let firstSkipped = false;
  const explicit = named != null;
  if (!words && !explicit) {
    add.push(await defaultPage('overview'), await defaultPage('components'));
    if (data.theme) {
      const colors = await colorsPage(cwd, at.dir, data.theme);
      if (colors.colors)
        add.push({
          id: COLORS_PAGE.id,
          label: COLORS_PAGE.label,
          text: colors.source,
        });
    }
  } else {
    const flags = `${tf}${pf}`;
    const picks = explicit
      ? [await namedTemplate(cwd, /** @type {string} */ (named), flags)]
      : await rankedPages(words, cwd, notes, flags);
    for (const [i, pick] of picks.entries()) {
      if (add.length >= (explicit ? 1 : top)) break;
      const shownTemplate =
        /** @type {import('../template/template.type.mjs').TemplateShowResponse} */ (
          await template(pick.name, {cwd, type: 'page'})
        );
      const source = shownTemplate.data.source;
      const needs = pageNeeds(cwd, source);
      // A StyleX page calls stylex.create when its module loads, so without
      // a StyleX compiler it breaks the whole route.
      const needsCompiler = needs.stylexCompiler;
      if (
        needs.missingPackages.length ||
        needs.notInstalled.length ||
        needsCompiler
      ) {
        const installCommand = needs.installCommand;
        skipped.push({
          page: pick.name,
          reason: `${skipReason({
            missingPackages: needs.missingPackages,
            notInstalled: needs.notInstalled,
            stylexCompiler: needsCompiler,
          })}${needs.noCommand ? ' (the app has more than one lockfile, so install it with the package manager you use)' : ''}`,
          installCommand,
        });
        if (installCommand) runs.push(installCommand);
        if (needsCompiler) stylexSkipped = true;
        if (i === 0) firstSkipped = true;
        continue;
      }
      add.push({id: pick.name, label: pick.displayName, text: source});
      matched.push({page: pick.name, why: pick.why});
    }
  }
  for (const s of skipped)
    notes.push(
      `the ${s.page} page was not added: it ${s.reason}${s.installCommand ? `; ${s.installCommand}, then add it again` : ''}`,
    );
  if (firstSkipped && add.length && !explicit)
    notes.push(`added ${add.map(a => a.id).join(', ')} in its place`);
  if (!add.length)
    refuse(
      E.ERR_DEP_MISSING,
      `No page was added: ${skipped.map(s => `the ${s.page} page ${s.reason}`).join('; ')}.`,
      {
        run: [
          ...new Set(runs),
          ...(stylexSkipped
            ? ['astryx docs styling-overview  # how to add a StyleX compiler']
            : []),
          `${PREVIEW} add${tf}${pf}  # the default pages, which need nothing more`,
        ],
      },
    );
  if (switched)
    for (const id of ['overview', 'components'])
      if (data.pages.some(p => p.id === id) && !add.some(a => a.id === id))
        add.push(await defaultPage(id));

  // The plan: every check below runs before the first write.
  const free = (() => {
    const base = path.basename(at.dir) || 'theme-preview';
    let n = 2;
    while (fs.existsSync(path.join(path.dirname(at.dir), `${base}-${n}`))) n++;
    return shown(cwd, path.join(path.dirname(at.dir), `${base}-${n}`));
  })();
  const elsewhere = retry(free);
  const move = movedPages(cwd, at.dir, data);
  /** @type {Map<string, {rel: string, text: string, keepHash?: boolean}>} */
  const writes = new Map(move.writes.map(w => [w.rel, w]));
  /** @type {string[]} */
  const added = [];
  /** Pages that were there already and are written again. @type {string[]} */
  const refreshed = [];
  for (const page of add) {
    const rel = `${PAGES_DIR}/${page.id}.tsx`;
    const w = {rel, text: page.text};
    if (!move.moved.includes(page.id))
      checkWrite(cwd, at.dir, data, w, elsewhere);
    writes.set(rel, w);
    if (!data.files.includes(rel)) data.files.push(rel);
    const had = data.pages.find(x => x.id === page.id);
    if (!had) {
      data.pages.push({
        id: page.id,
        label: page.label,
        file: `${PAGES_DIR}/${page.id}`,
      });
      added.push(page.id);
    } else {
      had.label = page.label;
      refreshed.push(page.id);
    }
  }
  // A recorded page whose file is gone is written again (a default page,
  // or the template its id names), or else left out of the nav, so the
  // route never imports a missing file.
  /** @type {string[]} */
  const rewrote = [];
  /** @type {string[]} */
  const dropped = [];
  for (const p of [...data.pages]) {
    const rel = `${p.file}.tsx`;
    if (writes.has(rel) || fs.existsSync(path.join(at.dir, rel))) continue;
    if (
      p.id === COLORS_PAGE.id &&
      data.files.includes(rel) &&
      (data.theme || gone)
    )
      continue;
    const text = data.files.includes(rel)
      ? await pageAgain(cwd, p.id, defaultPage)
      : null;
    if (text != null) {
      const to = `${PAGES_DIR}/${p.id}.tsx`;
      const w = {rel: to, text};
      checkWrite(cwd, at.dir, data, w, elsewhere);
      writes.set(to, w);
      data.files = data.files.filter(f => f !== rel);
      if (!data.files.includes(to)) data.files.push(to);
      p.file = `${PAGES_DIR}/${p.id}`;
      rewrote.push(p.id);
    } else {
      data.pages = data.pages.filter(x => x !== p);
      data.files = data.files.filter(f => f !== rel);
      dropped.push(p.id);
    }
  }
  if (rewrote.length)
    notes.push(
      `wrote ${rewrote.join(', ')} again: ${rewrote.length > 1 ? 'their files were' : 'its file was'} gone`,
    );
  if (dropped.length)
    notes.push(
      `left ${dropped.join(', ')} out of the nav: ${dropped.length > 1 ? 'their files were' : 'its file was'} gone, and the preview cannot write ${dropped.length > 1 ? 'them' : 'it'} again`,
    );
  if (!data.files.includes('page.tsx'))
    checkWrite(cwd, at.dir, data, {rel: 'page.tsx', text: '\0'}, elsewhere);
  const theme = await routeTheme(cwd, at.dir, data, {build: false});
  for (const w of await routeWrites(cwd, at.dir, data, theme, {gone})) {
    if (!writes.has(w.rel)) checkWrite(cwd, at.dir, data, w, elsewhere);
    writes.set(w.rel, w);
    if (!data.files.includes(w.rel)) data.files.push(w.rel);
  }
  await buildWorn(cwd, theme, options, notes);
  commitPreview(
    cwd,
    at.dir,
    data,
    [...writes.values()],
    move.deletes,
    retry(options.path ?? null),
  );
  tidyPageFolders(at.dir);
  if (move.moved.length)
    notes.push(
      `moved ${move.moved.join(', ')} from ${LEGACY_PAGES_DIR}/ to ${PAGES_DIR}/, a folder Next never serves as a route`,
    );
  if (wore && wore !== data.theme) recordPreview(cwd, wore, at.dir, false);
  if (data.theme) recordPreview(cwd, data.theme, at.dir);
  return {
    type: 'themeEdit.previewAdd',
    data: {
      folder: shownDir(cwd, at.dir),
      theme: data.theme,
      added,
      refreshed,
      matched,
      skipped,
      notes,
      pages: data.pages.map(x => x.id),
      files: data.files.map(f => shown(cwd, path.join(at.dir, f))),
      open: openLine(cwd, at),
    },
  };
}

/**
 * Make a new starter app (Next.js app router, Core and the neutral theme,
 * with the Astryx packages pinned to this CLI's release) in `dir`, with the
 * theme preview route and its default pages inside. With `theme`, the theme
 * folder is copied into the app and the pages wear it. No install runs.
 * Every check runs before the first write, so a refusal changes nothing.
 * @experimental
 * @param {string} dir
 * @param {import('./theme-edit.type.mjs').ThemeEditPreviewAppOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditPreviewAppResponse>}
 */
export async function themeEditPreviewApp(dir, options = {}) {
  const {cwd = process.cwd()} = options;
  if (typeof dir !== 'string' || !dir.trim())
    refuse(
      E.ERR_INVALID_ARGUMENT,
      'Name the folder for the new app: a new or empty folder inside the current one.',
      {run: [`${PREVIEW} app theme-app`]},
    );
  const slug = options.theme ?? null;
  const theme =
    slug == null
      ? null
      : wornTheme(
          cwd,
          slug,
          t => `${PREVIEW} app ${shq(dir)}${t == null ? '' : ` --theme ${t}`}`,
          'leave out --theme and the app wears the neutral theme',
        );
  // A new app has no Core installed yet: its pages come from this CLI's own
  // Core when the current folder has none.
  const project = await openProject(cwd).catch(() => openProject(CLI_PACKAGE));
  /** @type {Record<string, string>} */
  const dependencies = {};
  /** @type {Array<{rel: string, text: string | Buffer}>} */
  const themeCopy = [];
  /** @type {{name: string, module: string, css: string[], mode: 'system' | 'light' | 'dark'} | null} */
  let routeTheme = null;
  /** @type {string[]} */
  const notes = [];
  const routeDir = path.join('src', 'app', 'theme-preview');
  // The folder checks come before the theme build, so a refusal writes nothing.
  planStarterApp(cwd, dir, () => [], {}, slug);
  /** @type {string | null} */
  let colorsSource = null;
  if (slug != null && theme) {
    const from = themeFiles(cwd, slug);
    const ctx = await context(cwd);
    const mtime = (/** @type {string} */ f) => {
      try {
        return fs.statSync(f).mtimeMs;
      } catch {
        return -1;
      }
    };
    const built = Math.min(mtime(from.js), mtime(from.css));
    // The editor writes the settings a moment after the build, so only a
    // settings file clearly newer than the build means the build is stale.
    if (built < 0 || mtime(from.settings) > built + 2000) {
      await buildTheme(ctx, slug, theme);
      notes.push(
        `built ${shown(cwd, from.dir)}/ first: its build was ${built < 0 ? 'missing' : 'older than its settings'}, and the app gets a current copy`,
      );
    }
    const to = themeFiles('', slug);
    // The theme and its build, with the type declarations the build writes;
    // not its history, preview pages or pictures.
    const skip = new Set(
      [
        from.history,
        previewsFile(cwd, slug),
        from.preview,
        from.sheet,
        from.previewPng,
        from.sheetPng,
      ].map(f => path.basename(f)),
    );
    // The whole folder, tokens/ included, as bytes: a font or a picture
    // there must arrive as it is.
    /** @param {string} rel */
    const copyDir = rel => {
      for (const entry of fs.readdirSync(path.join(from.dir, rel), {
        withFileTypes: true,
      })) {
        const sub = path.join(rel, entry.name);
        if (entry.isDirectory()) copyDir(sub);
        else if (entry.isFile() && !(rel === '' && skip.has(entry.name)))
          themeCopy.push({
            rel: path.join(to.dir, sub),
            text: fs.readFileSync(path.join(from.dir, sub)),
          });
      }
    };
    copyDir('');
    if (theme.like && theme.like !== 'neutral')
      dependencies[`@astryxdesign/theme-${theme.like}`] = cliVersion();
    /** @param {string} rel */
    const fromRoute = rel => {
      const r = path.relative(routeDir, rel).split(path.sep).join('/');
      return r.startsWith('.') ? r : `./${r}`;
    };
    // The new app installs its own packages, so every open font the theme
    // names is added, at the version this project has, else a known one.
    const fonts = fontPackages(ctx, theme);
    for (const font of fonts)
      dependencies[font.pkg] =
        readVersion(project, font.pkg) ?? OPEN_FONT_RANGE;
    routeTheme = {
      name: slug,
      module: fromRoute(to.js),
      css: [fromRoute(to.css), ...fonts.map(x => `${x.pkg}/index.css`)],
      mode: themeImports(ctx, slug, theme, path.join(cwd, routeDir)).mode,
    };
    // The app's theme folder sits where this project's does, so the Colors
    // page imports the copied colors by the same relative path.
    const colors = await colorsPage(cwd, path.join(cwd, routeDir), slug);
    if (colors.colors) colorsSource = colors.source;
  }
  /** @type {PreviewData} */
  const data = {version: 1, theme: slug, pages: [], files: [], hashes: {}};
  /** @type {Array<{rel: string, text: string}>} */
  const preview = [];
  /** @type {Array<[string, string, string]>} */
  const pages = [
    ['overview', 'Overview', overviewPageSource(project, {theme: slug})],
    [
      'components',
      'Components',
      componentsPageSource(project, {theme: slug}).source,
    ],
    ...(colorsSource == null
      ? []
      : [
          /** @type {[string, string, string]} */ ([
            COLORS_PAGE.id,
            COLORS_PAGE.label,
            colorsSource,
          ]),
        ]),
  ];
  for (const [id, label, source] of pages) {
    data.pages.push({id, label, file: `${PAGES_DIR}/${id}`});
    preview.push({rel: `${PAGES_DIR}/${id}.tsx`, text: source});
  }
  preview.push({
    rel: 'page.tsx',
    text: previewRouteSource({
      pages: data.pages,
      theme: routeTheme,
      by: `${PREVIEW} app`,
    }),
  });
  data.files = [...preview.map(x => x.rel), PREVIEW_DATA];
  data.hashes = Object.fromEntries(preview.map(x => [x.rel, digest(x.text)]));
  const plan = planStarterApp(
    cwd,
    dir,
    () => [
      ...themeCopy,
      ...preview.map(x => ({rel: path.join(routeDir, x.rel), text: x.text})),
      {
        rel: path.join(routeDir, PREVIEW_DATA),
        text: `${JSON.stringify(data, null, 2)}\n`,
      },
    ],
    dependencies,
    slug,
  );
  const files = writeStarterApp(
    cwd,
    plan,
    d =>
      `${PREVIEW} app ${shq(d)}${slug == null ? '' : ` --theme ${shq(slug)}`}`,
  );
  const folder = shownDir(cwd, plan.root);
  if (
    plan.root !== cwd &&
    !isOutsideProject(cwd) &&
    fs.existsSync(path.join(cwd, 'tsconfig.json'))
  )
    notes.push(
      `add "${folder}" to "exclude" in this project's tsconfig.json, so its own type check leaves the new app out`,
    );
  return {
    type: 'themeEdit.previewApp',
    data: {
      folder,
      theme: slug,
      pages: data.pages.map(x => x.id),
      files,
      notes,
      open: `cd ${shq(folder)} && npm install && npm run dev, then open /theme-preview`,
    },
  };
}

/** The version range of an open font package the host project lacks. */
const OPEN_FONT_RANGE = '^5.0.0';

/**
 * The installed version of a package, as the project resolves it.
 * @param {import('./_project.mjs').ThemeProject} project
 * @param {string} pkg
 * @returns {string | null}
 */
function readVersion(project, pkg) {
  try {
    return JSON.parse(
      fs.readFileSync(project.req.resolve(`${pkg}/package.json`), 'utf8'),
    ).version;
  } catch {
    return null;
  }
}

/**
 * The pages of the in-app theme preview. With no preview, and with no
 * routes folder for one, the list is empty; a damaged theme-preview.json is
 * refused, naming the file.
 * @experimental
 * @param {import('./theme-edit.type.mjs').ThemeEditPreviewListOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditPreviewListResponse>}
 */
export async function themeEditPreviewList(options = {}) {
  const {cwd = process.cwd()} = options;
  requireProject(cwd);
  const pf = options.path != null ? ` --path ${shq(options.path)}` : '';
  const at = previewDir(cwd, options.path, {
    optional: true,
    retry: p => `${PREVIEW} list${p == null ? '' : ` --path ${shq(p)}`}`,
  });
  const data = at && readPreview(cwd, at.dir, pf);
  /** @type {string[]} */
  const notes = [];
  if (data?.theme && !fs.existsSync(themeFiles(cwd, data.theme).dir)) {
    const themes = editedThemes(cwd);
    notes.push(
      `the preview wears ${data.theme}, which is gone, so its route does not build; ${PREVIEW} add${pf} switches it to ${themes.length === 1 ? themes[0] : "the app's own theme"}`,
    );
  }
  return {
    type: 'themeEdit.previewList',
    data: {
      folder: at && data ? shownDir(cwd, at.dir) : null,
      theme: data?.theme ?? null,
      pages: (data?.pages ?? []).map(x => ({id: x.id, label: x.label})),
      notes,
    },
  };
}

/**
 * Remove one page from the in-app theme preview, or with no page the whole
 * preview. Only files the preview wrote are deleted, only inside the route
 * folder, and never one changed by hand since: those are kept and named.
 * Every check, the theme included, runs before the first delete.
 * @experimental
 * @param {string} [page]
 * @param {import('./theme-edit.type.mjs').ThemeEditPreviewListOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditPreviewRemoveResponse>}
 */
export async function themeEditPreviewRemove(page, options = {}) {
  const {cwd = process.cwd()} = options;
  requireProject(cwd);
  const pf = options.path != null ? ` --path ${shq(options.path)}` : '';
  const retry = (/** @type {string | null} */ p) =>
    `${PREVIEW} remove${page != null ? ` ${shq(page)}` : ''}${p == null ? '' : ` --path ${shq(p)}`}`;
  const at = previewDir(cwd, options.path, {retry});
  const data = readPreview(cwd, at.dir, pf);
  if (!data)
    refuse(
      E.ERR_NOT_FOUND,
      `There is no theme preview in ${shownDir(cwd, at.dir)}/ (no ${PREVIEW_DATA}).`,
      {run: [`${PREVIEW} add${pf}`]},
    );
  const folder = shownDir(cwd, at.dir);
  // theme-preview.json is a file anyone can edit: every path in it must
  // stay in the route folder before anything is removed.
  const inside = (/** @type {string} */ rel) =>
    confined(path.join(at.dir, rel), at.dir, `${PREVIEW_DATA} names`);
  for (const rel of data.files) inside(rel);
  for (const p of data.pages) inside(`${p.file}.tsx`);
  /** @type {string[]} */
  const notes = [];
  /** @type {string[]} */
  const kept = [];
  /** @type {string[]} */
  const missing = [];

  /** @type {PreviewPage | undefined} */
  let one;
  if (page != null) {
    const key = String(page).trim();
    one =
      data.pages.find(x => x.id === key) ??
      data.pages.find(x => x.id.toLowerCase() === key.toLowerCase());
    if (!one)
      refuse(E.ERR_NOT_FOUND, `The preview has no page "${page}".`, {
        didYouMean: nearest(
          key.toLowerCase(),
          data.pages.map(x => x.id),
        ),
        run: [`${PREVIEW} list${pf}`],
      });
  }

  if (one && data.pages.length > 1) {
    const target = one;
    const rel = `${target.file}.tsx`;
    const name = shown(cwd, inside(rel));
    /** @type {string[]} */
    const deletes = [];
    const ids = new Set(data.pages.map(p => p.id));
    const verdict = ownedUnchanged(at.dir, data, rel, ids);
    if (!data.files.includes(rel)) {
      kept.push(name);
      notes.push(
        `${name} was not written by the preview, so it is kept; only its nav item is gone`,
      );
    } else if (!fs.existsSync(inside(rel))) missing.push(name);
    else if (verdict !== 'delete') {
      kept.push(name);
      notes.push(keptNote(name, verdict));
    } else deletes.push(rel);
    data.pages = data.pages.filter(x => x !== target);
    data.files = data.files.filter(f => f !== rel);
    const wore = data.theme;
    /** @type {string | null} */
    let gone = null;
    if (wore && !fs.existsSync(themeFiles(cwd, wore).dir)) {
      gone = wore;
      data.theme = null;
      notes.push(
        `the preview wore ${wore}, which is gone; it now wears the app's own theme`,
      );
    }
    const move = movedPages(cwd, at.dir, data);
    // A page whose file is gone leaves the nav, so the route never imports
    // a missing file.
    const moving = new Set(move.writes.map(w => w.rel));
    const lost = data.pages.filter(p => {
      const rel = `${p.file}.tsx`;
      if (moving.has(rel) || fs.existsSync(path.join(at.dir, rel)))
        return false;
      return !(
        p.id === COLORS_PAGE.id &&
        data.files.includes(rel) &&
        (data.theme || gone)
      );
    });
    if (lost.length) {
      data.pages = data.pages.filter(p => !lost.includes(p));
      data.files = data.files.filter(
        f => !lost.some(p => f === `${p.file}.tsx`),
      );
      notes.push(
        `left ${lost.map(p => p.id).join(', ')} out of the nav: ${lost.length > 1 ? 'their files were' : 'its file was'} gone`,
      );
    }
    /** @type {Array<{rel: string, text: string}>} */
    let planned;
    /** @type {Awaited<ReturnType<typeof routeTheme>>} */
    let theme;
    try {
      theme = await routeTheme(cwd, at.dir, data, {build: false});
      planned = await routeWrites(cwd, at.dir, data, theme, {gone});
    } catch (e) {
      const err = /** @type {any} */ (e);
      if (
        [E.ERR_THEME_INVALID, E.ERR_UNKNOWN_THEME, E.ERR_THEME_LOAD].includes(
          err?.code,
        )
      )
        err.suggestions = [
          {
            name: `${PREVIEW} remove${pf}`,
            reason:
              'do this instead: removes the whole preview, which needs no theme',
          },
          ...(err.suggestions ?? []),
        ];
      throw e;
    }
    const elsewhere = `${PREVIEW} remove${pf}`;
    /** @type {Map<string, {rel: string, text: string, keepHash?: boolean}>} */
    const writes = new Map(move.writes.map(w => [w.rel, w]));
    /** @type {string[]} */
    const rewritten = [];
    for (const w of planned) {
      const was = checkWrite(cwd, at.dir, data, w, elsewhere);
      writes.set(w.rel, w);
      if (!data.files.includes(w.rel)) data.files.push(w.rel);
      if (was !== 'same') rewritten.push(shown(cwd, path.join(at.dir, w.rel)));
    }
    await buildWorn(cwd, theme, options, notes);
    commitPreview(
      cwd,
      at.dir,
      data,
      [...writes.values()],
      [...deletes, ...move.deletes],
      retry(options.path ?? null),
    );
    tidyPageFolders(at.dir);
    if (gone) recordPreview(cwd, gone, at.dir, false);
    return {
      type: 'themeEdit.previewRemove',
      data: {
        folder,
        removed: deletes.map(r => shown(cwd, path.join(at.dir, r))),
        kept,
        missing,
        rewritten,
        notes,
        pages: data.pages.map(x => x.id),
      },
    };
  }

  // The whole preview: every entry is checked before the first delete. A
  // route changed by hand would be kept and still import the pages, so it
  // stops the remove instead.
  if (data.files.includes('page.tsx') && editedByHand(at.dir, data, 'page.tsx'))
    refuse(
      E.ERR_FILE_EXISTS,
      `${shown(cwd, path.join(at.dir, 'page.tsx'))} was changed by hand after the preview wrote it. It imports the preview pages, so removing them would leave a route that does not build.`,
      {
        fix: `copy your changes out of ${shown(cwd, path.join(at.dir, 'page.tsx'))}, delete it or give it another name, then run ${PREVIEW} remove${pf} again`,
      },
    );
  const ids = new Set(data.pages.map(p => p.id));
  // A route the preview keeps still imports its pages, so they stay too.
  const routeKept =
    fs.existsSync(path.join(at.dir, 'page.tsx')) &&
    (!data.files.includes('page.tsx') ||
      ownedUnchanged(at.dir, data, 'page.tsx', ids) !== 'delete');
  /** @type {Array<{file: string, before: Buffer}>} */
  const plan = [];
  for (const rel of data.files) {
    const file = inside(rel);
    /** @type {fs.Stats} */
    let st;
    try {
      st = fs.lstatSync(file);
    } catch {
      missing.push(shown(cwd, file));
      continue;
    }
    if (st.isDirectory())
      damagedPreview(
        cwd,
        at.dir,
        `"files" holds ${rel}, which is a folder; the preview writes only files`,
        pf,
      );
    const verdict = ownedUnchanged(at.dir, data, rel, ids);
    if (verdict !== 'delete') {
      kept.push(shown(cwd, file));
      notes.push(keptNote(shown(cwd, file), verdict));
      continue;
    }
    if (routeKept && rel !== PREVIEW_DATA) {
      kept.push(shown(cwd, file));
      notes.push(
        `${shown(cwd, file)} is kept: page.tsx stays, and it imports the pages`,
      );
      continue;
    }
    plan.push({file, before: fs.readFileSync(file)});
  }
  // theme-preview.json goes last, so an interrupted remove can run again.
  plan.sort(
    (a, b) =>
      Number(path.basename(a.file) === PREVIEW_DATA) -
      Number(path.basename(b.file) === PREVIEW_DATA),
  );
  /** @type {string[]} */
  const removed = [];
  for (const [i, p] of plan.entries())
    try {
      fs.rmSync(p.file);
      removed.push(shown(cwd, p.file));
    } catch (e) {
      for (const back of plan.slice(0, i))
        try {
          fs.writeFileSync(back.file, back.before);
        } catch {
          // Best effort: the refusal below names the file.
        }
      refuse(
        E.ERR_WRITE_FAILED,
        `${shown(cwd, p.file)} could not be removed (${/** @type {any} */ (e)?.code ?? 'error'}), so the preview's files were put back.`,
        {run: [`${retry(options.path ?? null)}  # once the cause is fixed`]},
      );
    }
  tidyPageFolders(at.dir);
  try {
    fs.rmdirSync(at.dir);
    // Route group folders, such as (tools)/, that only held the preview.
    for (
      let up = path.dirname(at.dir);
      /^\(.+\)$/.test(path.basename(up)) && at.app && up.startsWith(at.app);
      up = path.dirname(up)
    )
      fs.rmdirSync(up);
  } catch {
    // Not empty: something there is not the preview's.
  }
  if (data.theme) recordPreview(cwd, data.theme, at.dir, false);
  return {
    type: 'themeEdit.previewRemove',
    data: {folder, removed, kept, missing, rewritten: [], notes, pages: []},
  };
}
