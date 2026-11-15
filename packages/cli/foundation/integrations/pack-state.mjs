// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which files npm packs for a package's own folder: what
 * `npm pack --dry-run` lists, asked only when a `files` field or an ignore
 * file can leave a path out, and what `files` alone proves when npm cannot
 * answer.
 *
 * @input A package directory, its package.json `files`, and a path in it.
 * @output Whether npm packs the path, leaves it out (by npm's list or by
 *   `files`), or cannot be asked.
 * @position foundation/integrations; read by the template-asset and logo
 *   checks (validate-contributions.mjs) and the shipped-import check
 *   (shipped-imports.mjs). Inside `withListingCache` (one validation) npm is
 *   asked once per package folder, however many checks ask, and its list is
 *   kept between runs while nothing it depends on has changed.
 */

import {AsyncLocalStorage} from 'node:async_hooks';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {npmCommand} from '../release/cache.mjs';
import {oncePerListing} from '../fs/listing-cache.mjs';
import {keptTreeSummary} from '../fs/kept-tree.mjs';
import {gatherCacheDir, makeGatherCacheDir} from '../fs/gather-cache.mjs';
import {withoutRecording} from '../fs/read-record.mjs';

/** The module's own file: its code decides what a kept list holds. */
const OWN_FILE = fileURLToPath(import.meta.url);

/** The files whose text decides which of a folder's files npm packs. */
const IGNORE_FILES = new Set(['.npmignore', '.gitignore']);

/**
 * Set inside `integration check`'s check of a package ({@link asPackageCheck}).
 * @type {AsyncLocalStorage<true>}
 */
const packageCheck = new AsyncLocalStorage();

/**
 * Run `fn` as `integration check`'s check of the package: inside it, npm's
 * list may make the per-user catalogs folder to be kept in. Elsewhere, as in
 * doctor's `integration validate`, which only diagnoses, the list is kept only
 * where that folder already exists.
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
export function asPackageCheck(fn) {
  return packageCheck.run(true, fn);
}

/**
 * The paths npm packs for the package in `base`, read from
 * `npm pack --dry-run --json --ignore-scripts` (nothing runs, nothing is
 * written), started the way the CLI starts npm everywhere else, or why npm
 * could not answer. Inside `withListingCache`, the answer it already gave for
 * the folder: the template-asset, logo and shipped-import checks of one
 * validation each ask, and npm takes seconds to answer.
 * @param {string} base
 * @returns {{paths: Set<string>} | {error: string}}
 */
export function npmPackedPaths(base) {
  const folder = path.resolve(base);
  return oncePerListing(`npm-pack\0${folder}`, () => keptNpmAnswer(folder));
}

/**
 * npm's list for the package in `folder`, kept between runs (kept-tree.mjs):
 * the stored list while no folder npm walks has changed, nor package.json,
 * an ignore file in any folder of the package or above it, a package.json
 * above it, or an npmrc file npm reads. Which files npm
 * packs depends on those and on the files' names and types, never on what
 * the files hold, so an edit inside a file keeps the list. It is kept only
 * for the npm entry file this check starts, by that npm's version and the
 * major version of the Node that runs it, and only as a list: an error, a
 * package that bundles dependencies (npm then walks their folders too), or a
 * tree with a link in it is asked every time. It is kept only where the
 * per-user catalogs folder exists, or inside `integration check`, which may
 * make it ({@link asPackageCheck}).
 * @param {string} folder
 * @returns {{paths: Set<string>} | {error: string}}
 */
function keptNpmAnswer(folder) {
  let npm;
  try {
    npm = npmCommand();
  } catch {
    return {error: 'npm was not found'};
  }
  const version = npmVersion(npm);
  const kept =
    version != null &&
    (packageCheck.getStore()
      ? makeGatherCacheDir()
      : withoutRecording(gatherCacheDir) != null);
  if (!kept) return askNpm(folder, npm);
  /** @type {{paths: string[], keep: boolean} | {error: string}} */
  const answer = keptTreeSummary(
    {
      kind: 'npm-packed-paths',
      roots: [folder],
      code: [OWN_FILE],
      // npm packs no .git folder, and no node_modules at the package's
      // root (one deeper is packed); a bundled dependency is never kept
      // (below).
      skip: (name, rel) =>
        name === '.git' || (rel === '' && name === 'node_modules'),
      key: [version, process.versions.node.split('.')[0], npmEnvironment()],
      recorded: true,
      keep: value => 'paths' in value && value.keep,
    },
    ([{folders, readText}]) => {
      let linked = false;
      for (const {rel, entries} of folders) {
        for (const {name, isDir, isLink} of entries) {
          if (isLink) linked = true;
          if (!isDir && IGNORE_FILES.has(name)) {
            readText(rel === '' ? name : path.join(rel, name));
          }
        }
      }
      /** @type {any} */
      let pkg = null;
      try {
        pkg = JSON.parse(readText('package.json'));
      } catch {
        // npm says why.
      }
      readNpmrcFiles(folder, npm);
      readFilesAbove(folder);
      const result = askNpm(folder, npm);
      if ('error' in result) return result;
      const bundles = [pkg?.bundleDependencies, pkg?.bundledDependencies].some(
        each =>
          each === true ||
          (Array.isArray(each) && each.length > 0) ||
          (each != null && typeof each === 'object' && !Array.isArray(each)),
      );
      return {paths: [...result.paths], keep: !linked && !bundles};
    },
  );
  return 'paths' in answer ? {paths: new Set(answer.paths)} : answer;
}

/**
 * The version of the npm whose entry file `npm` starts, or null when the
 * check starts a bare `npm` and cannot tell which one runs.
 * @param {{command: string, prefix: string[]}} npm
 * @returns {string | null}
 */
function npmVersion(npm) {
  const entry = npm.prefix[0];
  if (typeof entry !== 'string') return null;
  try {
    const pkg = JSON.parse(
      fs.readFileSync(
        path.join(path.dirname(entry), '..', 'package.json'),
        'utf-8',
      ),
    );
    return typeof pkg?.version === 'string' ? pkg.version : null;
  } catch {
    return null;
  }
}

/**
 * The npm settings the environment gives (`npm_config_*`), as a digest: they
 * can change what npm reads, and a token among them is never kept.
 * @returns {string}
 */
function npmEnvironment() {
  const settings = Object.entries(process.env)
    .filter(([name]) => name.toLowerCase().startsWith('npm_config_'))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return createHash('sha256').update(JSON.stringify(settings)).digest('hex');
}

/**
 * Read the files above the package in `folder` that npm may apply to it, so a
 * kept list holds their stamps, present or not: in each folder above it, the
 * package.json that can make that folder a workspace root, and the ignore
 * files npm applies to a workspace's members from its root and each folder
 * between.
 * @param {string} folder
 */
function readFilesAbove(folder) {
  for (let dir = path.dirname(folder); ; dir = path.dirname(dir)) {
    for (const name of ['package.json', ...IGNORE_FILES]) {
      const file = path.join(dir, name);
      try {
        if (fs.existsSync(file)) fs.readFileSync(file);
      } catch {
        // Unreadable: npm cannot read it either.
      }
    }
    if (path.dirname(dir) === dir) break;
  }
}

/**
 * Read each npmrc file npm may read for a package in `folder`, so a kept list
 * holds its stamp, present or not: the package's own and each folder's above
 * it, the user's, the global one and npm's own.
 * @param {string} folder
 * @param {{prefix: string[]}} npm
 */
function readNpmrcFiles(folder, npm) {
  /** @type {string[]} */
  const files = [];
  for (let dir = folder; ; dir = path.dirname(dir)) {
    files.push(path.join(dir, '.npmrc'));
    if (path.dirname(dir) === dir) break;
  }
  const env = process.env;
  files.push(env.npm_config_userconfig ?? path.join(os.homedir(), '.npmrc'));
  const npmRoot = path.join(path.dirname(npm.prefix[0]), '..');
  const prefix =
    env.npm_config_prefix ??
    (process.platform === 'win32'
      ? path.join(npmRoot, '..', '..')
      : path.join(npmRoot, '..', '..', '..'));
  files.push(env.npm_config_globalconfig ?? path.join(prefix, 'etc', 'npmrc'));
  files.push(path.join(npmRoot, 'npmrc'));
  for (const file of files) {
    try {
      if (fs.existsSync(file)) fs.readFileSync(file);
    } catch {
      // Unreadable: npm cannot read it either.
    }
  }
}

/**
 * What npm answers for the package in `base` (npmPackedPaths).
 * @param {string} base
 * @param {{command: string, prefix: string[]}} npm
 * @returns {{paths: Set<string>} | {error: string}}
 */
function askNpm(base, npm) {
  const result = spawnSync(
    npm.command,
    [
      ...npm.prefix,
      'pack',
      '--dry-run',
      '--json',
      '--ignore-scripts',
      '--silent',
    ],
    {
      cwd: base,
      encoding: 'utf-8',
      shell: false,
      timeout: 60_000,
      // One line per packed file: room for a very large package.
      maxBuffer: 256 * 1024 * 1024,
    },
  );
  if (result.error) return {error: `npm did not run (${result.error.message})`};
  if (result.status !== 0) {
    let code = '';
    try {
      code = JSON.parse(result.stdout)?.error?.code ?? '';
    } catch {
      // not JSON
    }
    return {
      error: `npm pack failed${code ? ` (${code})` : ` with exit ${result.status}`}`,
    };
  }
  try {
    const [info] = JSON.parse(result.stdout);
    if (Array.isArray(info?.files)) {
      return {
        paths: new Set(
          info.files.map((/** @type {{path: string}} */ f) => f.path),
        ),
      };
    }
  } catch {
    // fall through
  }
  return {error: 'npm pack printed no file list'};
}

/**
 * Whether an ignore file is there. npm reads its content in a child process,
 * which a kept check's record does not see, so this stats the file: a kept
 * check that asked is checked by the file's stamp, not only by whether it is
 * there.
 * @param {string} file
 * @returns {boolean}
 */
function ignoreFileThere(file) {
  try {
    return fs.statSync(file, {throwIfNoEntry: false}) !== undefined;
  } catch {
    return false;
  }
}

/**
 * The ignore files npm reads for one path in a package with no `files`
 * field: in the root and each folder down to the path's own, `.npmignore`,
 * or `.gitignore` where that folder has none. Root first, each relative to
 * the package root.
 * @param {string} base
 * @param {string} rel POSIX, relative to the package root
 * @returns {string[]}
 */
export function ignoreFilesFor(base, rel) {
  /** @type {string[]} */
  const found = [];
  const folders = rel.split('/').slice(0, -1);
  for (let depth = 0; depth <= folders.length; depth++) {
    const folder = folders.slice(0, depth).join('/');
    const file = ['.npmignore', '.gitignore'].find(name =>
      ignoreFileThere(path.join(base, folder, name)),
    );
    if (file) found.push(folder ? `${folder}/${file}` : file);
  }
  return found;
}

/**
 * Every spelling a glob's `{a,b}` braces stand for, nested braces included.
 * @param {string} pattern
 * @returns {string[]}
 */
function expandBraces(pattern) {
  let depth = 0;
  let open = -1;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\') {
      i++;
    } else if (ch === '{') {
      if (depth++ === 0) open = i;
    } else if (ch === '}' && depth > 0 && --depth === 0) {
      const body = pattern.slice(open + 1, i);
      /** @type {string[]} */
      const parts = [];
      let level = 0;
      let from = 0;
      for (let j = 0; j < body.length; j++) {
        if (body[j] === '{') level++;
        else if (body[j] === '}') level--;
        else if (body[j] === ',' && level === 0) {
          parts.push(body.slice(from, j));
          from = j + 1;
        }
      }
      parts.push(body.slice(from));
      if (parts.length < 2) continue;
      const head = pattern.slice(0, open);
      const tail = pattern.slice(i + 1);
      return parts.flatMap(part => expandBraces(head + part + tail));
    }
  }
  return [pattern];
}

/**
 * One brace-free glob as a regular expression source: `**`, `*`, `?` and
 * `[…]` classes (`[!…]` negated), as npm's `files` matching reads them.
 * @param {string} pattern
 */
function globSource(pattern) {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        const slashAfter = pattern[i + 2] === '/';
        const atStart = i === 0 || pattern[i - 1] === '/';
        if (atStart && slashAfter) {
          out += '(?:.*/)?';
          i += 2;
        } else if (atStart && i + 2 === pattern.length) {
          out = out.replace(/\/$/u, '') + '(?:/.*)?';
          i += 1;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
      }
    } else if (ch === '?') {
      out += '[^/]';
    } else if (ch === '[') {
      const close = pattern.indexOf(']', i + 2);
      if (close === -1) {
        out += '\\[';
      } else {
        let body = pattern.slice(i + 1, close);
        const negated = body.startsWith('!') || body.startsWith('^');
        if (negated) body = body.slice(1);
        out += `[${negated ? '^' : ''}${body.replace(/[\\\]]/gu, '\\$&')}]`;
        i = close;
      }
    } else if (ch === '\\' && i + 1 < pattern.length) {
      out += pattern[++i].replace(/[.+^${}()|[\]\\*?/]/gu, '\\$&');
    } else {
      out += ch.replace(/[.+^${}()|[\]\\]/gu, '\\$&');
    }
  }
  return out;
}

/**
 * Whether no `files` entry can reach a path, read case-insensitively and
 * generously (`{a,b}` braces, globs, a no-slash entry at any depth, an entry
 * for the path or any folder above it), for when npm cannot say what it
 * packs: a path this misses is out of the package however npm reads the list.
 * @param {string} rel POSIX, relative to the package root
 * @param {unknown} files
 */
export function outsideFiles(rel, files) {
  if (!Array.isArray(files)) return false;
  const parts = rel.split('/');
  const paths = parts.map((_, i) => parts.slice(0, i + 1).join('/'));
  return !files.some(entry => {
    if (typeof entry !== 'string' || entry.startsWith('!')) return false;
    const trimmed = entry
      .replace(/^\.?\//u, '')
      .replace(/\/+$/u, '')
      .replace(/\/\*$/u, '/**');
    return expandBraces(trimmed).some(spelling => {
      const pattern = new RegExp(`^${globSource(spelling)}$`, 'iu');
      return spelling.includes('/') || /^\.?\//u.test(entry)
        ? paths.some(at => pattern.test(at))
        : parts.some(name => pattern.test(name));
    });
  });
}

/**
 * The `!` entry of a `files` field that leaves out `rel` or a folder above
 * it, as written; null when none does.
 * @param {string} rel package-relative path
 * @param {unknown} files the `files` field
 * @returns {string | null}
 */
export function negatedFilesEntry(rel, files) {
  if (!Array.isArray(files)) return null;
  const parts = rel.split('/');
  const paths = parts.map((_, i) => parts.slice(0, i + 1).join('/'));
  for (const entry of files) {
    if (typeof entry !== 'string' || !entry.startsWith('!')) continue;
    const trimmed = entry
      .slice(1)
      .replace(/^\.?\//u, '')
      .replace(/\/+$/u, '')
      .replace(/\/\*$/u, '/**');
    const hit = expandBraces(trimmed).some(spelling => {
      const pattern = new RegExp(`^${globSource(spelling)}$`, 'iu');
      return spelling.includes('/') || /^!\.?\//u.test(entry)
        ? paths.some(at => pattern.test(at))
        : parts.some(name => pattern.test(name));
    });
    if (hit) return entry;
  }
  return null;
}

/**
 * Whether npm packs one file (or, with `folder`, anything inside one
 * folder) of the package at `base`. `cache` holds what npm packs, asked at
 * most once per cache. With no `files` field and no ignore file on the
 * path, npm packs everything, so nothing is asked. Without npm's answer, a
 * path no `files` entry can reach is left out, and any other is unknown.
 * @param {string} base package root
 * @param {string} rel path relative to `base`, with forward slashes
 * @param {unknown} packedFiles package.json `files`
 * @param {{packed?: {paths: Set<string>} | {error: string}}} cache
 * @param {{folder?: boolean}} [options]
 * @returns {{packed: true} | {packed: false, by: 'npm' | 'files'} | {packed: 'unknown', error: string}}
 */
export function packState(
  base,
  rel,
  packedFiles,
  cache,
  {folder = false} = {},
) {
  if (!Array.isArray(packedFiles) && ignoreFilesFor(base, rel).length === 0) {
    return {packed: true};
  }
  cache.packed ??= npmPackedPaths(base);
  const packed = cache.packed;
  if ('paths' in packed) {
    if (packed.paths.has(rel)) return {packed: true};
    if (folder && [...packed.paths].some(each => each.startsWith(`${rel}/`))) {
      return {packed: true};
    }
    return {packed: false, by: 'npm'};
  }
  if (Array.isArray(packedFiles) && outsideFiles(rel, packedFiles)) {
    return {packed: false, by: 'files'};
  }
  return {packed: 'unknown', error: packed.error};
}
