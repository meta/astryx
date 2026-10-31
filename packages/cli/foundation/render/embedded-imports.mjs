// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which embedded files the page itself reaches, for `astryx
 * experimental render --reverse`. A received file is untrusted, so its list
 * of files is not: a file is written only when the embedded page reaches it
 * through its own imports (static, re-exports, `import()` and `require()` of
 * a string), followed module by module through the embedded tree. Relative
 * imports resolve inside the tree; an alias import resolves through the
 * receiving project's own `tsconfig.json` or `jsconfig.json` paths, never the
 * sender's.
 *
 * @position foundation/render — used by the render subject's adapter
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {parse} from '@babel/parser';
import {PAGE_EXTENSIONS} from './embedded-files.mjs';
import postcss from 'postcss';
import {matchPath, readPathsIn} from './ts-paths.mjs';
import {isAssetPath} from './assets.mjs';

/**
 * What a stylesheet's `@import` rules load, read with postcss so comments
 * are ignored.
 * @param {string} css
 * @returns {string[]}
 */
function cssImports(css) {
  /** @type {string[]} */
  const out = [];
  try {
    postcss.parse(css).walkAtRules(/^import$/i, rule => {
      const m = /^\s*(?:url\(\s*(['"]?)([\s\S]*?)\1\s*\)|(['"])([\s\S]*?)\3)/.exec(rule.params);
      const url = m ? (m[2] ?? m[4]) : '';
      if (url) out.push(url);
    });
  } catch {
    // Not valid CSS: it imports nothing a restore needs.
  }
  return out;
}

/** Extensions an extensionless import may stand for, in resolution order. */
const RESOLVE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'];

/**
 * The string specifiers one module imports.
 * @param {string} source
 * @param {string} file for the parser's TypeScript/JSX choice
 * @returns {string[]}
 */
export function importSpecifiers(source, file) {
  return scanModule(source, file).imports;
}

/**
 * Relative asset paths in a piece of text: a `./`/`../` path to an image or
 * font, bare or inside `url(...)`.
 * @param {string} text
 * @returns {string[]}
 */
export function assetRefsIn(text) {
  /** @type {string[]} */
  const out = [];
  for (const m of text.matchAll(/(?:^|url\(\s*['"]?)(\.\.?\/[^'")\s]+)/g)) {
    const ref = m[1].split(/[?#]/)[0];
    if (isAssetPath(ref)) out.push(ref);
  }
  return out;
}

/**
 * One module's imports, and the relative asset paths its strings name
 * (`<img src="./logo.png">`, `url(./bg.png)` in a style).
 * @param {string} source
 * @param {string} file
 * @returns {{imports: string[], assets: string[]}}
 */
function scanModule(source, file) {
  /** @type {string[]} */
  const assets = [];
  /** @type {any} */
  let ast;
  try {
    ast = parse(source, {
      sourceType: 'module',
      allowReturnOutsideFunction: true,
      errorRecovery: true,
      plugins: /\.(tsx?|mts|cts)$/.test(file) ? ['jsx', 'typescript'] : ['jsx'],
    });
  } catch {
    return {imports: [], assets: []};
  }
  /** @type {string[]} */
  const out = [];
  /** @param {any} node */
  const visit = node => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'StringLiteral') assets.push(...assetRefsIn(node.value));
    else if (node.type === 'TemplateElement') assets.push(...assetRefsIn(node.value?.cooked ?? ''));
    if (
      (node.type === 'ImportDeclaration' ||
        node.type === 'ExportNamedDeclaration' ||
        node.type === 'ExportAllDeclaration') &&
      node.source?.type === 'StringLiteral'
    ) {
      out.push(node.source.value);
    } else if (
      node.type === 'ImportExpression' &&
      node.source?.type === 'StringLiteral'
    ) {
      out.push(node.source.value);
    } else if (
      node.type === 'CallExpression' &&
      node.arguments?.[0]?.type === 'StringLiteral' &&
      (node.callee?.type === 'Import' ||
        (node.callee?.type === 'Identifier' && node.callee.name === 'require'))
    ) {
      out.push(node.arguments[0].value);
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra') continue;
      const value = node[key];
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object' && typeof value.type === 'string') visit(value);
    }
  };
  visit(ast.program);
  return {imports: out, assets};
}

/**
 * The path aliases (`compilerOptions.paths`) of the project that holds
 * `dir`, by TypeScript's rules (see ts-paths.mjs).
 * @param {string} dir
 * @returns {import('./ts-paths.mjs').PathPattern[]}
 */
export function receivingAliases(dir) {
  let d = dir;
  while (!fs.existsSync(d) && path.dirname(d) !== d) d = path.dirname(d);
  for (;;) {
    const found = readPathsIn(d);
    if (found) return found;
    if (fs.existsSync(path.join(d, 'package.json'))) return [];
    const up = path.dirname(d);
    if (up === d) return [];
    d = up;
  }
}

/**
 * @typedef {object} Reach
 * @property {boolean} relative - Reached by a relative import (or it is the
 *   page), so it goes where the page's layout puts it.
 * @property {Set<string>} aliased - Absolute paths a receiving-project alias
 *   import names for it, so it also goes there.
 */

/**
 * The embedded files the page reaches through its imports.
 * @param {{path: string, base64: string}[]} files the embedded files, page
 *   first; every path appears once (callers refuse duplicates first)
 * @param {{aliases?: import('./ts-paths.mjs').PathPattern[]}} [options] the
 *   receiving project's path aliases (see receivingAliases)
 * @returns {{reached: Map<string, Reach>, missing: string[]}} the reached
 *   tree paths, and the relative imports the file does not carry
 */
export function reachableFiles(files, {aliases = []} = {}) {
  const byPath = new Map(files.map(f => [f.path, f]));
  /** @type {Map<string, Reach>} */
  const reached = new Map();
  /** @type {Set<string>} */
  const missing = new Set();
  /** @param {string} candidate tree path, `/`-separated */
  const resolveIn = candidate => {
    if (byPath.has(candidate)) return candidate;
    for (const ext of RESOLVE_EXTENSIONS) if (byPath.has(candidate + ext)) return candidate + ext;
    for (const ext of RESOLVE_EXTENSIONS) if (byPath.has(`${candidate}/index${ext}`)) return `${candidate}/index${ext}`;
    return null;
  };
  /**
   * The one tree file an alias import names: the file whose path ends with
   * the import's rest (`@/components/Header` -> `.../components/Header.tsx`).
   * @param {string} rest
   */
  const bySuffix = rest => {
    /** @type {{path: string, tail: string}[]} */
    const hits = [];
    for (const p of byPath.keys()) {
      for (const tail of [rest, ...RESOLVE_EXTENSIONS.map(e => rest + e), ...RESOLVE_EXTENSIONS.map(e => `${rest}/index${e}`)]) {
        if (p === tail || p.endsWith(`/${tail}`)) {
          hits.push({path: p, tail});
          break;
        }
      }
    }
    return hits.length === 1 ? hits[0] : null;
  };
  /** @param {string} p */
  const reach = p => {
    let r = reached.get(p);
    const fresh = !r;
    if (!r) {
      r = {relative: false, aliased: new Set()};
      reached.set(p, r);
    }
    return {r, fresh};
  };
  /** @type {string[]} */
  const queue = [];
  if (files.length > 0) {
    reach(files[0].path).r.relative = true;
    queue.push(files[0].path);
  }
  while (queue.length > 0) {
    const current = /** @type {string} */ (queue.shift());
    const ext = path.posix.extname(current).toLowerCase();
    const isModule = PAGE_EXTENSIONS.includes(ext);
    if (!isModule && ext !== '.css') continue;
    const entry = byPath.get(current);
    if (!entry) continue;
    const source = Buffer.from(entry.base64, 'base64').toString('utf8');
    // Images and fonts a module or stylesheet names by a relative path are
    // part of the page too.
    const scanned = isModule
      ? scanModule(source, current)
      : {
          // A stylesheet's own `@import`s count as imports.
          // A stylesheet's own relative `@import`s count as imports (read
          // with postcss, so a commented-out one does not); a package one
          // (`@scope/pkg/x.css`) or a remote one is not the page's file.
          imports: cssImports(source)
            .filter(ref => !/^([a-z]+:)?\/\//i.test(ref) && !/^[@~]/.test(ref))
            // A bare name (`theme.css`) is the sheet beside it when the file
            // carries one, else a package's.
            .filter(ref => ref.startsWith('.') || byPath.has(path.posix.normalize(path.posix.join(path.posix.dirname(current), ref))))
            .map(ref => (ref.startsWith('.') ? ref : `./${ref}`)),
          assets: assetRefsIn(source),
        };
    for (const ref of scanned.assets) {
      const joined = path.posix.normalize(path.posix.join(path.posix.dirname(current), ref));
      if (joined.startsWith('..')) continue;
      if (!byPath.has(joined)) {
        missing.add(joined);
        continue;
      }
      reach(joined).r.relative = true;
    }
    for (const spec of scanned.imports) {
      const bare = spec.split('?')[0];
      if (bare.startsWith('./') || bare.startsWith('../')) {
        const joined = path.posix.normalize(path.posix.join(path.posix.dirname(current), bare));
        const target = joined.startsWith('..') ? null : resolveIn(joined);
        if (!target) {
          missing.add(joined);
          continue;
        }
        const {r, fresh} = reach(target);
        r.relative = true;
        if (fresh) queue.push(target);
        continue;
      }
      const match = matchPath(aliases, bare);
      if (match) {
        // Each target in order: the file the alias names, matched in the
        // tree by the path's tail, and placed where this project's target
        // puts it (`@/c/Header` -> `<target>/c/Header.tsx`).
        for (const target of match.pattern.targets) {
          const named = target.replace('*', match.capture);
          const ext = path.extname(named);
          const star = target.indexOf('*');
          const rest = (star === -1 ? path.basename(named, ext) : target.slice(star).replace('*', match.capture))
            .split(path.sep)
            .join('/')
            .replace(/^\/+/, '');
          const hit = rest ? bySuffix(rest) : null;
          if (!hit) continue;
          // The file keeps its own extension or index: `<target>/c/Header` ->
          // `<target>/c/Header.tsx`.
          const abs =
            star !== -1
              ? target.slice(0, star) + hit.tail
              : ext
                ? named
                : named + hit.tail.slice(rest.length);
          const {r, fresh} = reach(hit.path);
          r.aliased.add(abs);
          if (fresh) queue.push(hit.path);
          break;
        }
      }
    }
  }
  return {reached, missing: [...missing].sort()};
}
