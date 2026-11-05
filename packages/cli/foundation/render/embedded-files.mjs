// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which files a rendered page may carry, for `astryx experimental
 * render`. Rendering embeds only these, and `--reverse` writes only these: a
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

/** JSON files that configure a project or a tool rather than hold page data. */
const CONFIG_JSON =
  /^(package|package-lock|composer|deno|turbo|vercel|nx|lerna|app|bower|now|netlify|firebase|renovate|project|workspace|angular|biome|components)\.jsonc?$|config|(^|[._-])rc\.jsonc?$|(^|[._-])lock\.jsonc?$/i;

/** Tool configuration modules: `vite.config.ts`, `astryx.config.mjs`, `next.config.js`, `.eslintrc.js`, ... */
const CONFIG_MODULE = /(^|\.)config\.[cm]?[jt]sx?$|^[a-z0-9-]+rc\.[cm]?[jt]s$/i;

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
 * Why a path may not be carried by a rendered page, or null when it may.
 * @param {string} p a `/`-separated path relative to the embedded tree's root
 * @param {{page?: boolean}} [options] `page`: the path is the page itself
 * @returns {{code: 'ERR_PATH_TRAVERSAL' | 'ERR_RENDER_SOURCE_DAMAGED', reason: string} | null}
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
  if (((ext === '.json' || ext === '.jsonc') && CONFIG_JSON.test(base)) || CONFIG_MODULE.test(base)) {
    return {code: 'ERR_RENDER_SOURCE_DAMAGED', reason: `a project or tool configuration file (${p})`};
  }
  if (PAGE_EXTENSIONS.includes(ext) || ext === '.css' || ext === '.json' || isAssetPath(p)) return null;
  return {code: 'ERR_RENDER_SOURCE_DAMAGED', reason: `a kind of file a render never embeds (${p})`};
}
