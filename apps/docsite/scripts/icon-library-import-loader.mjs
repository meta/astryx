// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file icon-library-import-loader.mjs
 *
 * Experimental: may change or be removed in a patch release. A Webpack loader
 * that keeps a template preview's compile small when its icon set's library
 * is one huge barrel module. It runs only when the `DOCSITE_ICON_SET` build
 * setting names a set (next.config.mjs adds it then).
 *
 * A set's generated module imports its icons from the library the set's
 * `source` names. When that library's entry re-exports thousands of icon
 * files, Webpack compiles every one of them in development, because the
 * docsite compiles with Babel and Next's per-package import optimizations do
 * not run. This loader rewrites each import from a chosen set's library into
 * imports of the icon files themselves. It finds each file through the
 * barrel's own `export {default as X} from './X.js'` lines. A name the barrel
 * does not map keeps the original import.
 *
 * @input A module inside a chosen icon set's package, and the chosen sets
 * @output The module with its library imports pointed at the icon files
 * @position Build-time docsite tooling, read by next.config.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {parse} from '@babel/parser';
import {previewIconSetList, previewIconSets} from './template-icon-loader.mjs';

/** @typedef {{file: string, imported: string}} BarrelEntry */

/** @type {Map<string, Map<string, BarrelEntry>>} */
const barrelMaps = new Map();

/**
 * The names a barrel module re-exports from relative files, each with the
 * file and the name that file exports it under. Read once per barrel.
 * @param {string} barrelFile
 * @returns {Map<string, BarrelEntry>}
 */
export function readBarrel(barrelFile) {
  let map = barrelMaps.get(barrelFile);
  if (map) return map;
  map = new Map();
  const ast = parse(fs.readFileSync(barrelFile, 'utf8'), {
    sourceType: 'module',
  });
  for (const node of ast.program.body) {
    if (node.type !== 'ExportNamedDeclaration' || !node.source) continue;
    const from = node.source.value;
    if (!from.startsWith('./') && !from.startsWith('../')) continue;
    const file = path.resolve(path.dirname(barrelFile), from);
    for (const spec of node.specifiers) {
      if (spec.type !== 'ExportSpecifier') continue;
      map.set(nameOf(spec.exported), {file, imported: nameOf(spec.local)});
    }
  }
  barrelMaps.set(barrelFile, map);
  return map;
}

/** @param {{type: string, name?: string, value?: string}} node */
function nameOf(node) {
  return node.type === 'Identifier' ? node.name : node.value;
}

/** @param {string} name */
function binding(name) {
  return /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(name) ? name : JSON.stringify(name);
}

/**
 * Rewrite a module's named imports and re-exports from the given libraries
 * into imports of the files the libraries' barrels map each name to. A name
 * the barrel does not map, and a default, namespace or star statement, stay
 * as they are.
 * @param {string} source
 * @param {Set<string>} libraries the package names to rewrite
 * @param {(library: string) => Promise<string | null>} resolveBarrel the file
 *   a library's entry resolves to, or null when it does not resolve
 * @returns {Promise<string>}
 */
export async function rewriteLibraryImports(source, libraries, resolveBarrel) {
  if (![...libraries].some(library => source.includes(library))) return source;
  const ast = parse(source, {sourceType: 'module', plugins: ['jsx']});
  /** @type {{start: number, end: number, text: string}[]} */
  const edits = [];
  /** @type {Map<string, Promise<Map<string, BarrelEntry> | null>>} */
  const barrels = new Map();
  const barrelFor = library => {
    let found = barrels.get(library);
    if (!found) {
      found = resolveBarrel(library).then(file =>
        file ? readBarrel(file) : null,
      );
      barrels.set(library, found);
    }
    return found;
  };
  for (const node of ast.program.body) {
    const isImport = node.type === 'ImportDeclaration';
    const isExport = node.type === 'ExportNamedDeclaration' && node.source;
    if (!isImport && !isExport) continue;
    const library = node.source.value;
    if (!libraries.has(library)) continue;
    const specKind = isImport ? 'ImportSpecifier' : 'ExportSpecifier';
    if (node.specifiers.length === 0) continue;
    if (node.specifiers.some(spec => spec.type !== specKind)) continue;
    const barrel = await barrelFor(library);
    if (!barrel) continue;
    const direct = [];
    const kept = [];
    for (const spec of node.specifiers) {
      const [inner, outer] = isImport
        ? [nameOf(spec.imported), spec.local.name]
        : [nameOf(spec.local), nameOf(spec.exported)];
      const entry = barrel.get(inner);
      if (!entry) {
        kept.push(source.slice(spec.start, spec.end));
        continue;
      }
      const from = JSON.stringify(entry.file);
      const name = entry.imported;
      const named =
        name === outer
          ? binding(name)
          : `${binding(name)} as ${binding(outer)}`;
      direct.push(
        isImport && name === 'default'
          ? `import ${outer} from ${from};`
          : `${isImport ? 'import' : 'export'} {${named}} from ${from};`,
      );
    }
    if (direct.length === 0) continue;
    if (kept.length > 0) {
      const keyword = isImport ? 'import' : 'export';
      direct.push(
        `${keyword} {${kept.join(', ')}} from ${JSON.stringify(library)};`,
      );
    }
    edits.push({start: node.start, end: node.end, text: direct.join(' ')});
  }
  let out = source;
  for (const edit of edits.reverse()) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return out;
}

/** @type {Map<string, Promise<{dirs: string[], libraries: Set<string>}>>} */
const scopesByKey = new Map();

/**
 * The sets the setting names, main first. The ordered list the template
 * rewrite reads also holds every other installed set after these, and those
 * are not rewritten.
 * @template T
 * @param {{order?: T[], set?: T | null}} choice
 * @returns {T[]}
 */
export function chosenSets(choice) {
  return choice.order ?? (choice.set ? [choice.set] : []);
}

/**
 * @param {Array<{packageDir: string, data?: {source?: {package?: unknown}}}>} sets
 */
function scopeOf(sets) {
  return {
    dirs: [...new Set(sets.map(set => fs.realpathSync(set.packageDir)))],
    libraries: new Set(
      sets
        .map(set => set.data?.source?.package)
        .filter(library => typeof library === 'string'),
    ),
  };
}

/**
 * The chosen sets' package folders and the libraries their `source` names.
 * @param {string} projectDir
 * @param {string[]} list
 */
function scopeFor(projectDir, list) {
  const key = `${projectDir}\0${list.join(',')}`;
  let found = scopesByKey.get(key);
  if (!found) {
    found = previewIconSets(projectDir, list).then(({choice}) => {
      return scopeOf(chosenSets(choice));
    });
    scopesByKey.set(key, found);
  }
  return found;
}

/**
 * @this {{async: () => (error: Error | null, out?: string) => void, getOptions: () => {iconSet: string, projectDir: string}, getResolve: (options: object) => (context: string, request: string) => Promise<string>, resourcePath: string, context: string}}
 * @param {string} source
 */
export default function iconLibraryImportLoader(source) {
  const done = this.async();
  const {iconSet, projectDir} = this.getOptions();
  const resolve = this.getResolve({dependencyType: 'esm'});
  const file = this.resourcePath;
  const context = this.context;
  // A set that does not load fails the build in the template loader, which
  // names the reason; here it only leaves the module as it is.
  scopeFor(projectDir, previewIconSetList(iconSet))
    .catch(() => ({dirs: [], libraries: new Set()}))
    .then(({dirs, libraries}) => {
      const inSet = dirs.some(dir => file.startsWith(dir + path.sep));
      if (!inSet || libraries.size === 0) return source;
      return rewriteLibraryImports(source, libraries, library =>
        resolve(context, library).catch(() => null),
      );
    })
    .then(
      out => done(null, out),
      error => done(error),
    );
}
