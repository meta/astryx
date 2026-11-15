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
 *   (shipped-imports.mjs).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {npmCommand} from '../release/cache.mjs';

/**
 * The paths npm packs for the package in `base`, read from
 * `npm pack --dry-run --json --ignore-scripts` (nothing runs, nothing is
 * written), started the way the CLI starts npm everywhere else, or why npm
 * could not answer.
 * @param {string} base
 * @returns {{paths: Set<string>} | {error: string}}
 */
export function npmPackedPaths(base) {
  let npm;
  try {
    npm = npmCommand();
  } catch {
    return {error: 'npm was not found'};
  }
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
      fs.existsSync(path.join(base, folder, name)),
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
