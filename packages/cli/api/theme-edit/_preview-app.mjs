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
  q,
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
import {paletteFiles, paletteMapping} from './_palette.mjs';
import {build} from '../build/build.mjs';
import {search} from '../search/search.mjs';
import {template} from '../template/template.mjs';
import {analyzeTemplateNeeds} from '../../foundation/discovery/template-needs.mjs';
import {createFileProtectionResolver} from '../../foundation/fs/file-protection.mjs';
import {detectStylingSystem} from '../../foundation/agent-docs/agent-docs.mjs';
import {requireProject, context} from './_context.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';

const E = ERROR_CODES;

/** The preview's data file: the pages it shows and the files it wrote. */
const PREVIEW_DATA = 'theme-preview.json';
const PREVIEW = 'astryx experimental theme preview';

/**
 * @typedef {{id: string, label: string, file: string}} PreviewPage
 * @typedef {{version: 1, theme: string | null, pages: PreviewPage[], files: string[]}} PreviewData
 */

/**
 * Where the preview route lives. `--path` names it (inside the project);
 * else an existing preview in the app's routes folder; else the routes
 * folder of a Next app router (`app/` or `src/app/`); else
 * `./theme-preview/` at the project root, with no app around it.
 * @param {string} cwd
 * @param {string | undefined} where
 * @param {{optional?: boolean}} [opts] `optional`: null instead of a refusal when there is no routes folder
 * @returns {{dir: string, app: string | null}} `app`: the routes folder, when the route is in one
 */
function previewDir(cwd, where, opts = {}) {
  const routes = ['app', path.join('src', 'app')]
    .map(r => path.join(cwd, r))
    .filter(r => fs.existsSync(r) && fs.statSync(r).isDirectory());
  const appOf = (/** @type {string} */ dir) =>
    routes.find(r => dir.startsWith(r + path.sep)) ?? null;
  if (where != null) {
    try {
      const dir = assertWithin(path.resolve(cwd, where), cwd, {
        allowAbsolute: true,
        label: '--path',
      });
      return {dir, app: appOf(dir)};
    } catch (e) {
      if (e instanceof PathSafetyError)
        refuse(
          E.ERR_PATH_TRAVERSAL,
          `--path ${where} is outside the project; put the preview inside the folder you run the command from.`,
        );
      throw e;
    }
  }
  const candidates = routes.map(r => path.join(r, 'theme-preview'));
  const known = candidates.find(d => fs.existsSync(path.join(d, PREVIEW_DATA)));
  const dir = known ?? candidates[0];
  if (!dir && opts.optional) return /** @type {any} */ (null);
  if (!dir)
    refuse(
      E.ERR_NOT_FOUND,
      'No app routes folder here (app/ or src/app/), so there is no app to put the preview in.',
      {
        run: [
          `${PREVIEW} add --path <dir>   (a folder inside your app's routes)`,
          `${PREVIEW} app <dir>          (a new starter app with the preview in it)`,
        ],
      },
    );
  return {dir, app: appOf(dir)};
}

const CLI_PACKAGE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const STARTER = path.join(CLI_PACKAGE, 'assets', 'preview-app');
/** Starter files a folder may already have: they are the app's own, so never replaced. */
const STARTER_KEEP = new Set(['package.json', '.gitignore']);
/** What the starter's own package.json depends on. */
const STARTER_DEPENDENCIES = Object.keys(
  JSON.parse(fs.readFileSync(path.join(STARTER, 'package.json'), 'utf8'))
    .dependencies,
);

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
    if (e instanceof PathSafetyError)
      refuse(
        E.ERR_PATH_TRAVERSAL,
        `${what} ${file} is outside ${root}; nothing was written or removed.`,
      );
    throw e;
  }
}

/**
 * The files a new starter app (Next.js app router, Core and the neutral
 * theme) writes into `where`, with `extra` files beside them, checked before
 * anything is written: every file stays inside the folder, also through
 * links; with `overwrite`, a protected file there is refused and the app's
 * own package.json and .gitignore are kept.
 * @param {string} cwd
 * @param {string} where
 * @param {boolean} overwrite
 * @param {(root: string) => Array<{rel: string, text: string}>} extra files relative to the app folder
 * @param {Record<string, string>} dependencies added to the starter's package.json
 * @returns {{root: string, writes: Array<{file: string, text: string}>, kept: string[]}}
 */
function planStarterApp(cwd, where, overwrite, extra, dependencies) {
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
      );
    throw e;
  }
  if (fs.existsSync(root) && fs.readdirSync(root).length && !overwrite)
    refuse(
      E.ERR_FILE_EXISTS,
      `${shown(cwd, root) || '.'} exists and is not empty; a starter app goes into a new or empty folder (--overwrite replaces its files).`,
    );
  /** @type {Array<{file: string, text: string}>} */
  const writes = [];
  /** @type {string[]} */
  const kept = [];
  /** @param {string} from */
  const walk = from => {
    for (const entry of fs.readdirSync(from, {withFileTypes: true})) {
      const src = path.join(from, entry.name);
      if (entry.isDirectory()) walk(src);
      else if (entry.name !== 'README.md') {
        const rel = path.relative(STARTER, src);
        const name = rel === 'gitignore' ? '.gitignore' : rel;
        const file = confined(
          path.join(root, name),
          root,
          'a starter app file',
        );
        if (STARTER_KEEP.has(name) && fs.existsSync(file)) {
          kept.push(shown(cwd, file));
          continue;
        }
        const text = fs.readFileSync(src, 'utf8');
        writes.push({
          file,
          text:
            rel === 'package.json'
              ? starterPackageJson(text, dependencies)
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
  const existing = writes.map(w => w.file).filter(f => fs.existsSync(f));
  if (existing.length) {
    /** @type {ReturnType<typeof createFileProtectionResolver>} */
    let resolver;
    try {
      resolver = createFileProtectionResolver(cwd);
    } catch (e) {
      refuse(
        E.ERR_FILE_EXISTS,
        `Could not read this project's file protection (${e instanceof Error ? e.message : String(e)}), so no existing file is replaced; nothing was written.`,
      );
    }
    const blocked = existing.flatMap(f => {
      const protection = resolver.classify(f)[0];
      return protection ? [`${shown(cwd, f)} (${protection.declaration})`] : [];
    });
    if (blocked.length)
      refuse(
        E.ERR_FILE_EXISTS,
        `${blocked.join(', ')} ${blocked.length === 1 ? 'is' : 'are'} protected, so never replaced, even with --overwrite; nothing was written. Choose another app folder.`,
      );
  }
  return {root, writes, kept: kept.sort()};
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
 * Write a planned starter app. No install runs here.
 * @param {string} cwd
 * @param {{writes: Array<{file: string, text: string}>}} plan
 * @returns {string[]} the files written
 */
function writeStarterApp(cwd, plan) {
  for (const w of plan.writes) {
    fs.mkdirSync(path.dirname(w.file), {recursive: true});
    fs.writeFileSync(w.file, w.text);
  }
  return plan.writes.map(w => shown(cwd, w.file)).sort();
}

/** @param {string} dir @returns {PreviewData | null} */
function readPreview(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, PREVIEW_DATA), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * A preview file, checked: inside the route folder, also through links, and
 * not a file there that the preview did not write, which is never replaced.
 * @param {string} cwd
 * @param {string} dir
 * @param {PreviewData} data
 * @param {string} rel relative to dir
 * @returns {string} the absolute file
 */
function previewFile(cwd, dir, data, rel) {
  const file = confined(path.join(dir, rel), dir, 'a preview file');
  const key = rel.split(path.sep).join('/');
  if (fs.existsSync(file) && !data.files.includes(key))
    refuse(
      E.ERR_FILE_EXISTS,
      `${shown(cwd, file)} exists and the preview did not write it; it is never replaced. Move it, or put the preview elsewhere with --path.`,
    );
  return file;
}

/**
 * Write one file of the preview, checked as {@link previewFile} checks it.
 * @param {string} cwd
 * @param {string} dir
 * @param {PreviewData} data
 * @param {string} rel relative to dir
 * @param {string} text
 */
function writePreviewFile(cwd, dir, data, rel, text) {
  const file = previewFile(cwd, dir, data, rel);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, text);
  const key = rel.split(path.sep).join('/');
  if (!data.files.includes(key)) data.files.push(key);
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
 * The theme the route imports, built first when it has no build yet; null
 * for the app's own theme. A theme that does not load or build is refused
 * here, before the route or any page is written.
 * @param {string} cwd
 * @param {string} dir
 * @param {PreviewData} data
 * @returns {Promise<{name: string, module: string, css: string[]} | null>}
 */
async function routeTheme(cwd, dir, data) {
  if (!data.theme) return null;
  const t = loadTheme(cwd, data.theme);
  const ctx = await context(cwd);
  if (!fs.existsSync(themeFiles(cwd, data.theme).js))
    await buildTheme(ctx, data.theme, t);
  const ti = themeImports(ctx, data.theme, t, dir);
  return {name: data.theme, module: ti.module, css: ti.css};
}

/** The Colors page: its id and file, relative to the route folder. */
const COLORS_PAGE = {id: 'colors', label: 'Colors', file: 'pages/colors'};

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
  const exact = new Set(
    data.settings.filter(s => s.source === 'token' && !s.on).map(s => s.thing),
  );
  /** @type {Record<string, Record<'light' | 'dark', Record<string, string[]>>>} */
  const uses = {};
  for (const [token, v] of Object.entries(pal.tokens)) {
    if (exact.has(token)) continue;
    const byMode = (uses[v.family] ??= {light: {}, dark: {}});
    for (const m of /** @type {const} */ (['light', 'dark'])) {
      const r = v[m];
      // A dark fill that keeps the exact color uses the light ramp's shade:
      // it is marked there, for dark mode.
      const ramp = r.from ?? m;
      (byMode[ramp][r.stop] ??= []).push(
        `${token}${r.alpha ? ` (opacity ${r.alpha})` : ''}${ramp !== m ? ` (${m} mode too)` : ''}`,
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
 * Rewrite the Colors page when the preview has one, so it names the shades
 * the theme's tokens use now, or says the theme has no color left.
 * @param {string} cwd
 * @param {string} dir
 * @param {PreviewData} data
 * @returns {Promise<boolean>} whether it was rewritten
 */
async function refreshColorsPage(cwd, dir, data) {
  const rel = `${COLORS_PAGE.file}.tsx`;
  if (!data.theme || !data.files.includes(rel)) return false;
  const file = previewFile(cwd, dir, data, rel);
  const {source} = await colorsPage(cwd, dir, data.theme);
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === source)
    return false;
  fs.writeFileSync(file, source);
  return true;
}

/**
 * Write the route and the data file from the page list.
 * @param {string} cwd
 * @param {string} dir
 * @param {PreviewData} data
 * @param {{name: string, module: string, css: string[]} | null} [theme] from {@link routeTheme}
 */
async function writeRoute(cwd, dir, data, theme) {
  if (theme === undefined) theme = await routeTheme(cwd, dir, data);
  await refreshColorsPage(cwd, dir, data);
  writePreviewFile(
    cwd,
    dir,
    data,
    'page.tsx',
    previewRouteSource({pages: data.pages, theme}),
  );
  if (!data.files.includes(PREVIEW_DATA)) data.files.push(PREVIEW_DATA);
  fs.writeFileSync(
    path.join(dir, PREVIEW_DATA),
    `${JSON.stringify(data, null, 2)}\n`,
  );
}

/**
 * Rewrite the in-app preview routes of a theme when their imports changed, so
 * a font package installed after `set` loads on the next change or `show`,
 * and its Colors page, so it names the shades the tokens use now.
 * The preview in the usual place (app/ or src/app/theme-preview) and every
 * preview added with --path for the theme are kept this way.
 * @param {string} cwd
 * @param {string} slug
 * @returns {Promise<boolean>} whether the route or the Colors page was rewritten
 */
export async function refreshPreviewRoute(cwd, slug) {
  const at = previewDir(cwd, undefined, {optional: true});
  const dirs = [
    ...new Set([...(at ? [at.dir] : []), ...recordedPreviews(cwd, slug)]),
  ];
  let changed = false;
  for (const dir of dirs) {
    const data = readPreview(dir);
    if (!data || data.theme !== slug || !data.files.includes('page.tsx'))
      continue;
    if (await refreshColorsPage(cwd, dir, data)) changed = true;
    const file = previewFile(cwd, dir, data, 'page.tsx');
    const text = previewRouteSource({
      pages: data.pages,
      theme: await routeTheme(cwd, dir, data),
    });
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) continue;
    fs.writeFileSync(file, text);
    changed = true;
  }
  return changed;
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
  if (list.length) fs.writeFileSync(file, `${JSON.stringify(list, null, 2)}\n`);
  else fs.rmSync(file, {force: true});
}

/**
 * How to open the preview, from where it is.
 * @param {string} cwd
 * @param {{dir: string, app: string | null}} at
 */
function openLine(cwd, at) {
  if (at.app)
    return `open /${path.relative(at.app, at.dir).split(path.sep).join('/')} in the running app`;
  return `no app routes folder (app/ or src/app/) was found, so the preview is in ${shown(cwd, at.dir)}/; a starter app around it is not set up yet: serve page.tsx from a route of your app, or move it there with --path`;
}

const STYLEX_IMPORT = /from\s+['"]@stylexjs\/stylex['"]/;

/**
 * Why a template page was skipped.
 * @param {{missingPackages: string[], stylexCompiler: boolean}} s
 */
function skipReason(s) {
  return [
    ...(s.missingPackages.length
      ? [`needs ${s.missingPackages.join(', ')}`]
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
  // No page relates when the ranking fell back to a frame with no direct
  // match, and no page the search found matches two words of the request.
  const termsMatched = (/** @type {any} */ r) =>
    Number(/^matches (\d+)\//.exec(String(r.reason ?? ''))?.[1] ?? 0);
  const unrelated =
    !pages.length ||
    (start &&
      start.basis === 'fallback' &&
      frames.has(start.name) &&
      !kit.data.directMatch &&
      !found.some(
        (/** @type {any} */ r) => !frames.has(r.name) && termsMatched(r) >= 2,
      ));
  if (unrelated)
    refuse(
      E.ERR_NOT_FOUND,
      `No page template relates to "${words}". Name a page to add it anyway.`,
      {run: suggest(pages.length ? pages : skippedFrames)},
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
    const id = /** @type {string} */ (app[1].find(exists));
    if (pages.includes(id)) pages.splice(pages.indexOf(id), 1);
    pages.unshift(id);
    reasons.set(
      id,
      `the description names ${/** @type {RegExpExecArray} */ (app[0].exec(text))[0]}, and an app page shows a theme better than a hero`,
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
 * App pages for the apps a description can name, best first.
 * @type {Array<[RegExp, string[]]>}
 */
const APP_PAGES = [
  [
    /\b(issue[- ]?tracker|issues|tickets?|bug tracker|backlog)\b/,
    ['table-grouped', 'work-item-detail', 'table'],
  ],
  [/\b(kanban|task board|boards?)\b/, ['kanban-board']],
  [/\b(dashboard|analytics|metrics|charts?)\b/, ['dashboard']],
  [/\b(inbox|email|messages)\b/, ['table-inbox']],
  [/\b(chat|assistant|ai)\b/, ['ai-chat', 'ai-chat-landing']],
  [/\b(settings|preferences)\b/, ['settings']],
  [/\b(docs|documentation)\b/, ['documentation']],
  [/\b(data ?table|table|spreadsheet|data grid)\b/, ['table']],
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
 * Add pages to the in-app theme preview, and write the preview route the
 * first time. With a description, the build ranking picks the template
 * pages that fit it best (`top` of them); `template` names one instead.
 * With neither, the default pages: the sample app page, every component,
 * and the theme's generated colors when it has any.
 * Every check runs before the first write, so a refusal changes nothing.
 * @experimental
 * @param {string} [description]
 * @param {import('./theme-edit.type.mjs').ThemeEditPreviewAddOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditPreviewAddResponse>}
 */
export async function themeEditPreviewAdd(description, options = {}) {
  const {cwd = process.cwd(), top = 1} = options;
  if (isOutsideProject(cwd))
    refuse(
      E.ERR_PROJECT_REQUIRED,
      'No package.json here, so there is no app to put the preview in.',
      {
        run: [
          `${PREVIEW} add --path <dir>   (run in your app: a folder inside its routes)`,
          `${PREVIEW} app <dir>          (a new starter app with the preview in it)`,
        ],
      },
    );
  const words = (description ?? '').trim();
  if (words && options.template != null)
    refuse(
      E.ERR_INVALID_ARGUMENT,
      '--template names the page; a description asks the ranking to pick one, so drop one of them.',
    );
  if (!Number.isInteger(top) || top < 1 || top > 3)
    refuse(E.ERR_INVALID_ARGUMENT, `--top takes 1, 2 or 3, not "${top}".`);
  const at = previewDir(cwd, options.path);
  const data = readPreview(at.dir) ?? {
    version: 1,
    theme: null,
    pages: [],
    files: [],
  };
  /** @type {string[]} */
  const notes = [];
  if (options.theme != null) {
    loadTheme(cwd, options.theme);
    data.theme = options.theme;
  } else if (!data.theme) {
    const themes = editedThemes(cwd);
    data.theme = themes.length === 1 ? themes[0] : null;
  }
  if (data.theme) loadTheme(cwd, data.theme);
  const project = await openProject(cwd);
  /** @type {Array<{id: string, label: string, source?: string, template?: string}>} */
  const add = [];
  /** @type {Array<{page: string, reason: string, installCommand: string | null}>} */
  const skipped = [];
  /** @type {Array<{page: string, why: string}>} */
  const matched = [];
  if (!words && options.template == null) {
    add.push(
      {
        id: 'overview',
        label: 'Overview',
        source: overviewPageSource(project, {theme: data.theme}),
      },
      {
        id: 'components',
        label: 'Components',
        source: componentsPageSource(project, {
          theme: data.theme,
          C: (await context(cwd)).C,
        }).source,
      },
    );
    if (data.theme) {
      const colors = await colorsPage(cwd, at.dir, data.theme);
      if (colors.colors)
        add.push({
          id: COLORS_PAGE.id,
          label: COLORS_PAGE.label,
          source: colors.source,
        });
    }
  } else {
    /** @type {Array<{name: string, displayName: string, why: string}>} */
    let picks;
    const explicit = options.template != null;
    if (explicit) {
      const name = /** @type {string} */ (options.template);
      picks = [
        {
          name,
          displayName:
            (await pageTemplates(cwd)).find(t => t.id === name)?.name ?? name,
          why: 'named with --template',
        },
      ];
    } else
      picks = await rankedPages(
        words,
        cwd,
        notes,
        [
          ...(options.theme != null ? [` --theme ${q(options.theme)}`] : []),
          ...(options.path != null ? [` --path ${q(options.path)}`] : []),
        ].join(''),
      );
    for (const pick of picks) {
      if (add.length >= (explicit ? 1 : top)) break;
      const shownTemplate =
        /** @type {import('../template/template.type.mjs').TemplateShowResponse} */ (
          await template(pick.name, {cwd, type: 'page'})
        );
      const needs = analyzeTemplateNeeds(shownTemplate.data.source, cwd);
      // A StyleX page calls stylex.create when its module loads, so without
      // a StyleX compiler it breaks the whole route.
      const needsCompiler =
        STYLEX_IMPORT.test(shownTemplate.data.source) &&
        detectStylingSystem(cwd) !== 'stylex';
      if (needs.missingPackages.length || needsCompiler) {
        skipped.push({
          page: pick.name,
          reason: skipReason({
            missingPackages: needs.missingPackages,
            stylexCompiler: needsCompiler,
          }),
          installCommand: needs.installCommand,
        });
        continue;
      }
      add.push({id: pick.name, label: pick.displayName, template: pick.name});
      matched.push({page: pick.name, why: pick.why});
    }
  }
  for (const s of skipped)
    notes.push(
      `the ${s.page} page was not added: it ${s.reason}${s.installCommand ? `; ${s.installCommand}, then add it again` : ''}${add.length ? `; added ${add.map(a => a.id).join(', ')} instead` : ''}`,
    );
  if (!add.length)
    refuse(
      E.ERR_DEP_MISSING,
      `No page was added: ${skipped.map(s => `the ${s.page} page ${s.reason}`).join('; ')}. Nothing was written.`,
      {
        run: skipped.flatMap(s => (s.installCommand ? [s.installCommand] : [])),
      },
    );
  for (const page of add)
    previewFile(cwd, at.dir, data, `pages/${page.id}.tsx`);
  previewFile(cwd, at.dir, data, 'page.tsx');
  previewFile(cwd, at.dir, data, PREVIEW_DATA);
  const theme = await routeTheme(cwd, at.dir, data);

  /** @type {string[]} */
  const added = [];
  /** Pages that were there already and are written again. @type {string[]} */
  const refreshed = [];
  for (const page of add) {
    const file = `pages/${page.id}`;
    if (page.template != null) {
      const target = previewFile(cwd, at.dir, data, `${file}.tsx`);
      await template(page.template, {
        cwd,
        type: 'page',
        targetPath: path.relative(cwd, target),
        overwrite: true,
      });
      if (!data.files.includes(`${file}.tsx`)) data.files.push(`${file}.tsx`);
    } else
      writePreviewFile(
        cwd,
        at.dir,
        data,
        `${file}.tsx`,
        /** @type {string} */ (page.source),
      );
    const had = data.pages.find(x => x.id === page.id);
    if (!had) {
      data.pages.push({id: page.id, label: page.label, file});
      added.push(page.id);
    } else {
      had.label = page.label;
      refreshed.push(page.id);
    }
  }
  await writeRoute(cwd, at.dir, data, theme);
  if (data.theme) recordPreview(cwd, data.theme, at.dir);
  return {
    type: 'themeEdit.previewAdd',
    data: {
      folder: shown(cwd, at.dir),
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
  const {cwd = process.cwd(), overwrite = false} = options;
  if (typeof dir !== 'string' || !dir.trim())
    refuse(
      E.ERR_INVALID_ARGUMENT,
      'Name the folder for the new app: a new or empty folder inside the current one.',
      {run: [`${PREVIEW} app <dir>`]},
    );
  const slug = options.theme ?? null;
  const theme = slug == null ? null : loadTheme(cwd, slug);
  // A new app has no Core installed yet: its pages come from this CLI's own
  // Core when the current folder has none.
  const project = await openProject(cwd).catch(() => openProject(CLI_PACKAGE));
  /** @type {Record<string, string>} */
  const dependencies = {};
  /** @type {Array<{rel: string, text: string}>} */
  const themeCopy = [];
  /** @type {{name: string, module: string, css: string[]} | null} */
  let routeTheme = null;
  const routeDir = path.join('src', 'app', 'theme-preview');
  // The folder checks come before the theme build, so a refusal writes nothing.
  planStarterApp(cwd, dir, overwrite, () => [], {});
  if (slug != null && theme) {
    const from = themeFiles(cwd, slug);
    if (!fs.existsSync(from.js) || !fs.existsSync(from.css))
      await buildTheme(await context(cwd), slug, theme);
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
    for (const entry of fs.readdirSync(from.dir, {withFileTypes: true}))
      if (entry.isFile() && !skip.has(entry.name))
        themeCopy.push({
          rel: path.join(to.dir, entry.name),
          text: fs.readFileSync(path.join(from.dir, entry.name), 'utf8'),
        });
    if (theme.like && theme.like !== 'neutral')
      dependencies[`@astryxdesign/theme-${theme.like}`] = cliVersion();
    /** @param {string} rel */
    const fromRoute = rel => {
      const r = path.relative(routeDir, rel).split(path.sep).join('/');
      return r.startsWith('.') ? r : `./${r}`;
    };
    const fonts = fontPackages(await context(cwd), theme).filter(
      x => x.installed,
    );
    for (const font of fonts)
      dependencies[font.pkg] = readVersion(project, font.pkg) ?? 'latest';
    routeTheme = {
      name: slug,
      module: fromRoute(to.js),
      css: [fromRoute(to.css), ...fonts.map(x => `${x.pkg}/index.css`)],
    };
  }
  /** @type {PreviewData} */
  const data = {version: 1, theme: slug, pages: [], files: []};
  /** @type {Array<{rel: string, text: string}>} */
  const preview = [];
  for (const [id, label, source] of /** @type {const} */ ([
    ['overview', 'Overview', overviewPageSource(project, {theme: slug})],
    [
      'components',
      'Components',
      componentsPageSource(project, {theme: slug}).source,
    ],
  ])) {
    data.pages.push({id, label, file: `pages/${id}`});
    preview.push({rel: `pages/${id}.tsx`, text: source});
  }
  preview.push({
    rel: 'page.tsx',
    text: previewRouteSource({pages: data.pages, theme: routeTheme}),
  });
  data.files = [...preview.map(x => x.rel), PREVIEW_DATA];
  preview.push({rel: PREVIEW_DATA, text: `${JSON.stringify(data, null, 2)}\n`});
  const plan = planStarterApp(
    cwd,
    dir,
    overwrite,
    () => [
      ...themeCopy,
      ...preview.map(x => ({rel: path.join(routeDir, x.rel), text: x.text})),
    ],
    dependencies,
  );
  const files = writeStarterApp(cwd, plan);
  const folder = shown(cwd, plan.root) || '.';
  /** @type {string[]} */
  const notes = [];
  if (plan.kept.length)
    notes.push(
      `kept the app's own ${plan.kept.join(', ')}: the starter needs ${[...STARTER_DEPENDENCIES, ...Object.keys(dependencies)].join(', ')} in package.json`,
    );
  return {
    type: 'themeEdit.previewApp',
    data: {
      folder,
      theme: slug,
      pages: data.pages.map(x => x.id),
      files,
      notes,
      open: `cd ${folder} && npm install && npm run dev, then open /theme-preview`,
    },
  };
}

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
 * routes folder for one, the list is empty.
 * @experimental
 * @param {import('./theme-edit.type.mjs').ThemeEditPreviewListOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditPreviewListResponse>}
 */
export async function themeEditPreviewList(options = {}) {
  const {cwd = process.cwd()} = options;
  requireProject(cwd);
  const at = previewDir(cwd, options.path, {optional: true});
  const data = at && readPreview(at.dir);
  return {
    type: 'themeEdit.previewList',
    data: {
      folder: at && data ? shown(cwd, at.dir) : null,
      theme: data?.theme ?? null,
      pages: (data?.pages ?? []).map(x => ({id: x.id, label: x.label})),
    },
  };
}

/**
 * Remove one page from the in-app theme preview, or with no page the whole
 * preview: only the files it wrote are deleted, and only inside the route
 * folder.
 * @experimental
 * @param {string} [page]
 * @param {import('./theme-edit.type.mjs').ThemeEditPreviewListOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditPreviewRemoveResponse>}
 */
export async function themeEditPreviewRemove(page, options = {}) {
  const {cwd = process.cwd()} = options;
  requireProject(cwd);
  const at = previewDir(cwd, options.path);
  const data = readPreview(at.dir);
  if (!data)
    refuse(
      E.ERR_NOT_FOUND,
      `There is no theme preview in ${shown(cwd, at.dir)}/ (no ${PREVIEW_DATA}).`,
      {run: [`${PREVIEW} add`]},
    );
  // theme-preview.json is a file anyone can edit: every path in it must
  // stay in the route folder before anything is removed.
  const inside = (/** @type {string} */ rel) =>
    confined(path.join(at.dir, rel), at.dir, `${PREVIEW_DATA} names`);
  for (const rel of data.files) inside(rel);
  for (const p of data.pages) inside(`${p.file}.tsx`);
  /** @param {string} rel */
  const drop = rel => {
    const file = inside(rel);
    fs.rmSync(file, {force: true});
    return shown(cwd, file);
  };
  if (page != null && data.pages.length > 1) {
    const one = data.pages.find(x => x.id === page);
    if (!one)
      refuse(E.ERR_NOT_FOUND, `The preview has no page "${page}".`, {
        didYouMean: nearest(
          page,
          data.pages.map(x => x.id),
        ),
        run: [`${PREVIEW} list`],
      });
    data.pages = data.pages.filter(x => x !== one);
    const rel = `${one.file}.tsx`;
    data.files = data.files.filter(f => f !== rel);
    const removed = [drop(rel)];
    await writeRoute(cwd, at.dir, data);
    return {
      type: 'themeEdit.previewRemove',
      data: {
        folder: shown(cwd, at.dir),
        removed,
        pages: data.pages.map(x => x.id),
      },
    };
  }
  if (page != null && !data.pages.some(x => x.id === page))
    refuse(E.ERR_NOT_FOUND, `The preview has no page "${page}".`, {
      run: [`${PREVIEW} list`],
    });
  const removed = data.files.map(drop);
  for (const sub of [path.join(at.dir, 'pages'), at.dir])
    try {
      fs.rmdirSync(sub);
    } catch {
      // Not empty: something there is not the preview's.
    }
  if (data.theme) recordPreview(cwd, data.theme, at.dir, false);
  return {
    type: 'themeEdit.previewRemove',
    data: {folder: shown(cwd, at.dir), removed, pages: []},
  };
}
