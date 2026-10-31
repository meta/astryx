// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A project's `compilerOptions.paths` (tsconfig.json or jsconfig.json),
 * read and matched by TypeScript's rules, for `astryx experimental render`:
 * an exact key matches only itself; a key may hold one `*` anywhere, and the
 * longest matching prefix wins; a target may hold one `*`, which takes what
 * the key's `*` matched; targets are tried in order. Targets resolve from
 * `baseUrl` (default: the config's folder).
 *
 * @position foundation/render — used by page-worker.mjs and embedded-imports.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * @typedef {object} PathPattern
 * @property {string} key - The key as written.
 * @property {string} prefix - What comes before the key's `*` (all of it, for an exact key).
 * @property {string} suffix - What comes after the key's `*`.
 * @property {boolean} wildcard - Whether the key holds a `*`.
 * @property {string[]} targets - Absolute target patterns, in order.
 */

/** Extensions an extensionless candidate may stand for, in resolution order. */
const EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '.mts', '.cts', '.json'];

/**
 * The path patterns of the config in `dir` (tsconfig.json, else
 * jsconfig.json), or none. Comments and trailing commas are allowed.
 * @param {string} dir
 * @returns {PathPattern[] | null} null when neither file is there
 */
export function readPathsIn(dir) {
  for (const name of ['tsconfig.json', 'jsconfig.json']) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) continue;
    try {
      const text = fs
        .readFileSync(file, 'utf8')
        .replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_, str) => str ?? '')
        .replace(/,(\s*[}\]])/g, '$1');
      const options = JSON.parse(text)?.compilerOptions ?? {};
      const base = path.resolve(dir, typeof options.baseUrl === 'string' ? options.baseUrl : '.');
      /** @type {PathPattern[]} */
      const out = [];
      for (const [key, targets] of Object.entries(options.paths ?? {})) {
        if (!Array.isArray(targets)) continue;
        const star = key.indexOf('*');
        if (star !== key.lastIndexOf('*')) continue;
        out.push({
          key,
          prefix: star === -1 ? key : key.slice(0, star),
          suffix: star === -1 ? '' : key.slice(star + 1),
          wildcard: star !== -1,
          targets: targets
            .filter(t => typeof t === 'string' && t.indexOf('*') === t.lastIndexOf('*'))
            .map(t => path.resolve(base, t)),
        });
      }
      return out;
    } catch {
      return [];
    }
  }
  return null;
}

/**
 * The pattern a specifier matches by TypeScript's rules, and what its `*`
 * matched: an exact key first, else the wildcard key with the longest prefix.
 * @param {PathPattern[]} patterns
 * @param {string} spec
 * @returns {{pattern: PathPattern, capture: string} | null}
 */
export function matchPath(patterns, spec) {
  const exact = patterns.find(p => !p.wildcard && p.key === spec);
  if (exact) return {pattern: exact, capture: ''};
  /** @type {{pattern: PathPattern, capture: string} | null} */
  let best = null;
  for (const p of patterns) {
    if (!p.wildcard) continue;
    if (spec.length < p.prefix.length + p.suffix.length) continue;
    if (!spec.startsWith(p.prefix) || !spec.endsWith(p.suffix)) continue;
    if (best && best.pattern.prefix.length >= p.prefix.length) continue;
    best = {pattern: p, capture: spec.slice(p.prefix.length, spec.length - p.suffix.length)};
  }
  return best;
}

/**
 * The absolute paths a match names, one per target, in order.
 * @param {{pattern: PathPattern, capture: string}} match
 * @returns {string[]}
 */
export const candidatesOf = match => match.pattern.targets.map(t => t.replace('*', match.capture));

/**
 * The file a candidate path stands for: itself, with an extension, or its
 * folder's index; null when none exists.
 * @param {string} candidate
 * @returns {string | null}
 */
export function existingFile(candidate) {
  const isFile = (/** @type {string} */ f) => {
    try {
      return fs.statSync(f).isFile();
    } catch {
      return false;
    }
  };
  if (isFile(candidate)) return candidate;
  for (const ext of EXTENSIONS) if (isFile(candidate + ext)) return candidate + ext;
  for (const ext of EXTENSIONS) if (isFile(path.join(candidate, `index${ext}`))) return path.join(candidate, `index${ext}`);
  return null;
}

/**
 * Resolve a specifier through path patterns: the first target that names an
 * existing file wins.
 * @param {PathPattern[]} patterns
 * @param {string} spec
 * @returns {string | null} the file, or null when the specifier matches no
 *   pattern or no target exists
 */
export function resolvePath(patterns, spec) {
  const match = matchPath(patterns, spec);
  if (!match) return null;
  for (const candidate of candidatesOf(match)) {
    const file = existingFile(candidate);
    if (file) return file;
  }
  return null;
}
