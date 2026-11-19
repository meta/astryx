// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The files a shell-style glob pattern names.
 * @input a pattern (`themes/*.ts`, `src/**\/theme.ts`) and the folder it is read from
 * @output the files it matches, as relative paths with `/`
 * @position used where a command is given a pattern the shell did not expand
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * One path segment of a pattern as a regular expression: `*` is any run of
 * characters but `/`, `?` one character, `[...]` one of a set, `{a,b}` one
 * of the words. A leading dot is matched only when the segment names it.
 * @param {string} segment
 */
function segmentRegex(segment) {
  let out = '';
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i];
    if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else if (c === '[') {
      const end = segment.indexOf(']', i + 1);
      if (end < 0) out += '\\[';
      else {
        const set = segment.slice(i + 1, end).replace(/^!/, '^');
        out += `[${set.replace(/\\/g, '\\\\')}]`;
        i = end;
      }
    } else if (c === '{') {
      const end = segment.indexOf('}', i + 1);
      if (end < 0) out += '\\{';
      else {
        out += `(?:${segment
          .slice(i + 1, end)
          .split(',')
          .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('|')})`;
        i = end;
      }
    } else out += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

/**
 * The files a pattern matches, read from `cwd`, sorted; `**` is any number
 * of folders (none included). Folders are walked only as the pattern
 * reaches them, and node_modules and hidden folders only when a segment
 * names them.
 * @param {string} pattern
 * @param {string} cwd
 * @param {{limit?: number}} [options]
 * @returns {string[]}
 */
export function expandGlob(pattern, cwd, {limit = 200} = {}) {
  const segments = pattern.split('/').filter(s => s !== '' && s !== '.');
  const absolute = path.isAbsolute(pattern);
  /** @type {Set<string>} */
  const out = new Set();
  /** @param {string} dir absolute @param {number} at */
  const walk = (dir, at) => {
    if (out.size >= limit) return;
    if (at === segments.length) return;
    const segment = segments[at];
    if (segment === '**') {
      walk(dir, at + 1);
      for (const entry of entries(dir))
        if (
          entry.isDirectory() &&
          !entry.name.startsWith('.') &&
          entry.name !== 'node_modules'
        )
          walk(path.join(dir, entry.name), at);
      return;
    }
    if (segment === '..') return walk(path.dirname(dir), at + 1);
    const re = segmentRegex(segment);
    const last = at === segments.length - 1;
    for (const entry of entries(dir)) {
      if (!re.test(entry.name)) continue;
      if (entry.name.startsWith('.') && !segment.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (last) {
        if (entry.isFile()) out.add(full);
      } else if (entry.isDirectory()) walk(full, at + 1);
    }
  };
  walk(absolute ? path.parse(pattern).root : cwd, 0);
  return [...out]
    .map(f => (absolute ? f : path.relative(cwd, f).split(path.sep).join('/')))
    .sort();
}

/** @param {string} dir */
function entries(dir) {
  try {
    return fs.readdirSync(dir, {withFileTypes: true});
  } catch {
    return [];
  }
}
