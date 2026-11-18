// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which files a rendered page may carry, for `astryx experimental
 * export`. Rendering embeds only these, and `--reverse` writes only these: a
 * file someone sends can name nothing else. A page is a module; beside it go
 * only the stylesheets, JSON and images it imports. Never a dotfile or a
 * dot-folder (such as `.git/`), never `node_modules`, never a package
 * manifest, lockfile or tool configuration (`package.json`, `tsconfig.json`,
 * `vite.config.ts`, `astryx.config.mjs`, ...), and never a path that climbs
 * (`..`) or starts at the root.
 *
 * @position foundation/render — used by render-page.mjs and the render subject
 */

import {isAssetPath} from './assets.mjs';

/** The file extensions a page module may have. */
export const PAGE_EXTENSIONS = ['.tsx', '.jsx', '.ts', '.js', '.mjs'];

/**
 * The file extensions of a module a render carries: a page module's, and the
 * module kinds a page module may import that hold no JSX (`.mts`, `.cts`,
 * `.cjs`).
 */
export const MODULE_EXTENSIONS = [...PAGE_EXTENSIONS, '.mts', '.cts', '.cjs'];

/**
 * JSON files that configure a project or a tool rather than hold page data,
 * by the names tools read: a manifest or a tool's own file (`package.json`,
 * `turbo.json`, `project.json`, ...), a TypeScript or JavaScript project
 * (`tsconfig.json`, `tsconfig.app.json`, `jsconfig.json`), a `*.config.json`,
 * and a lockfile. Page data may have any other name (`config.json`,
 * `chart-config.json`). An rc file a tool reads is a dotfile, which no render
 * carries.
 */
const CONFIG_JSON =
  /^(package|package-lock|composer|deno|turbo|vercel|nx|lerna|app|bower|now|netlify|firebase|renovate|project|workspace|angular|biome|components)\.jsonc?$|^(ts|js)config(\.[^.]+)*\.jsonc?$|\.config\.jsonc?$|(^|[._-])lock\.jsonc?$/i;

/**
 * Tool configuration modules, by the names tools read: `vite.config.ts`,
 * `astryx.config.mjs`, `next.config.js`. A module named `config.ts` or
 * `arc.ts` is the page's own; an rc module a tool reads (`.eslintrc.js`) is
 * a dotfile, which no render carries.
 */
const CONFIG_MODULE = /\.config\.[cm]?[jt]sx?$/i;

/** Any script module. */
const SCRIPT = /\.(c|m)?[jt]sx?$/i;
/** Script modules `node --test` and AVA match by a `test-*` name (no JSX). */
const PLAIN_SCRIPT = /\.(c|m)?[jt]s$/i;

/**
 * Whether a test, story or benchmark runner would run the file with nothing
 * importing it, by the union of their default patterns: Jest and Vitest
 * (`*.test.*`, `*.spec.*`, `test.*`, `spec.*`, `__tests__/`), Vitest bench
 * (`*.bench.*`, `*.benchmark.*`), Storybook (`*.stories.*`, `*.story.*`),
 * Cypress (`*.cy.*`), Bun (`*_test.*`, `*_spec.*`), `node --test`
 * (`*-test.*`, `test/`) and AVA (`tests/`), and `test-*` for .js and .ts.
 * @param {string[]} segments the path where the file lands, from the project
 *   root (the folder runners search), `/`-split
 */
export function runnerPicksUp(segments) {
  const base = segments[segments.length - 1];
  if (!SCRIPT.test(base)) return false;
  const stem = base.replace(/\.[^.]+$/, '').toLowerCase();
  const folders = segments.slice(0, -1).map(seg => seg.toLowerCase());
  // Jest's `?(*.)+(spec|test)` repeats: `spectest.js`, `test.spec.js`.
  if (/(^|[._-])(test|spec)+$/.test(stem)) return true;
  if (/\.(bench|benchmark|stories|story|cy)$/.test(stem)) return true;
  if (folders.some(seg => seg === '__tests__' || seg === 'test' || seg === 'tests')) return true;
  // `test-*` only for the .js and .ts families: no default runner picks up
  // `test-results.tsx`.
  if (PLAIN_SCRIPT.test(base) && /^test[-_]/.test(stem)) return true;
  return false;
}

/** @param {string} p */
const extOf = p => {
  const base = p.slice(p.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot).toLowerCase() : '';
};

/**
 * Whether a file name reads as a project's or a tool's configuration, which a
 * render never carries and --reverse never writes.
 * @param {string} base the file's name, without its folder
 */
export function readsAsToolConfig(base) {
  const ext = extOf(base);
  return ((ext === '.json' || ext === '.jsonc') && CONFIG_JSON.test(base)) || CONFIG_MODULE.test(base);
}

/**
 * What to do with a file a render leaves out because its name reads as
 * configuration, so that it is carried. A `*.config.json` holds the page's
 * data under a tool's kind of name: rename it (`chart.config.json` becomes
 * `chart-data.json`). Any other such file is a tool's own (`package.json`,
 * `tsconfig.json`, a lockfile, `vite.config.ts`): the page moves the values it
 * reads into a file of its own (`page-data.json`). Each name offered is one a
 * render carries where the file is.
 * @param {string} p the file's `/`-separated path among the carried files
 * @returns {{action: 'rename' | 'move', name: string}}
 */
export function carriedNameFor(p) {
  const slash = p.lastIndexOf('/');
  const dir = slash < 0 ? '' : p.slice(0, slash + 1);
  const base = p.slice(slash + 1);
  const ext = extOf(base);
  const carries = (/** @type {string} */ name) => embeddedPathProblem(dir + name) === null;
  const data = /^(.+)\.config\.jsonc?$/i.exec(base);
  if (data) {
    const name = `${data[1].replace(/\./g, '-')}-data${ext}`;
    if (carries(name)) return {action: 'rename', name};
  }
  const own = `page-data${ext === '.jsonc' ? '.json' : ext}`;
  return {action: 'move', name: carries(own) ? own : 'page-data.json'};
}

/**
 * Why a path may not be carried by a rendered page, or null when it may.
 * @param {string} p a `/`-separated path relative to the embedded tree's root
 * @param {{page?: boolean}} [options] `page`: the path is the page itself
 * @returns {{code: 'ERR_PATH_TRAVERSAL' | 'ERR_RENDER_SOURCE_DAMAGED', reason: string, toolConfig?: true} | null}
 *   `toolConfig`: the only problem is a name that reads as configuration
 */
export function embeddedPathProblem(p, options = {}) {
  if (typeof p !== 'string' || p.length === 0 || p.includes('\0')) {
    return {code: 'ERR_RENDER_SOURCE_DAMAGED', reason: 'an empty or invalid path'};
  }
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p) || p.includes('\\')) {
    return {code: 'ERR_PATH_TRAVERSAL', reason: `an absolute path (${p})`};
  }
  const segments = p.split('/');
  if (segments.some(s => s === '..' || s === '.' || s === '')) {
    return {code: 'ERR_PATH_TRAVERSAL', reason: `a path outside its own tree (${p})`};
  }
  if (segments.some(s => s.startsWith('.'))) {
    return {code: 'ERR_RENDER_SOURCE_DAMAGED', reason: `a dotfile or dot-folder (${p})`};
  }
  if (segments.includes('node_modules')) {
    return {code: 'ERR_RENDER_SOURCE_DAMAGED', reason: `a file inside node_modules (${p})`};
  }
  const base = segments[segments.length - 1];
  const ext = extOf(p);
  // The page is judged by where it lands (its name in the file is only a
  // default), so only its kind counts here.
  if (options.page) {
    if (!PAGE_EXTENSIONS.includes(ext)) {
      return {code: 'ERR_RENDER_SOURCE_DAMAGED', reason: `a page that is not a page module (${p})`};
    }
    return null;
  }
  // A file a test, story or benchmark runner picks up by its name or folder
  // runs without anyone importing it.
  if (runnerPicksUp(segments)) {
    return {code: 'ERR_RENDER_SOURCE_DAMAGED', reason: `a test, spec, story or benchmark file (${p})`};
  }
  if (readsAsToolConfig(base)) {
    return {code: 'ERR_RENDER_SOURCE_DAMAGED', reason: `a project or tool configuration file (${p})`, toolConfig: true};
  }
  if (MODULE_EXTENSIONS.includes(ext) || ext === '.css' || ext === '.json' || isAssetPath(p)) return null;
  return {code: 'ERR_RENDER_SOURCE_DAMAGED', reason: `a kind of file a render never embeds (${p})`};
}
