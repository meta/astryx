// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Doc module importers: how the doc reader and discovery execute an
 *   authored doc file.
 *
 * @input An absolute path to a `.doc.{ts,mjs,js}` (or legacy template) file.
 * @output The module's exports: for a doc Astryx ships whose text matches its
 *   stored exports, a non-extensible, namespace-like object built from them (see
 *   `storedModule`); otherwise the namespace object a plain import of the file
 *   gives, until the file changes; then the edited file's, read once by each
 *   importer, its own way, and shared until the next change. A long-running
 *   process (a docs site's search, an agent harness) thereby sees an edit to
 *   a doc file it already read, as a new process would read it. Only the doc
 *   file's own edits count: a module it imports stays as first loaded.
 * @position Called by ./read.mjs, which hands what comes back to the compiler,
 *   and by discovery, which reads a contributed topic's name and relationships
 *   to build the catalog. Doc files also run outside these importers: each CLI
 *   command imports its own self-docs statically for its help text, and the
 *   README script imports them at build time. ./doc-loads.test.mjs lists, site
 *   by site, every use of these importers and every other place the CLI runs
 *   anything but its static imports of other CLI code (a static doc import is
 *   one); a new site fails it. It catches every ordinary way of running code,
 *   whatever the local names; deliberate obfuscation is out of scope.
 */

import * as fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {importUrl} from '../fs/import-url.mjs';
import {jitiCacheOptions} from '../fs/jiti-cache.mjs';
import {
  importUserModule,
  readFreshInTurn,
  readInTurn,
} from '../fs/module-loader.mjs';
import {fileStamp, recordContentRead} from '../fs/read-record.mjs';
import {readStore, storedKey, STORED_DOCS_FILE} from './stored-docs.mjs';

const requireFromHere = createRequire(import.meta.url);

/**
 * jiti, loaded on first use: only TypeScript doc files need it.
 * @type {typeof import('jiti').createJiti}
 */
const createJiti = (...args) => requireFromHere('jiti').createJiti(...args);

/** @type {ReturnType<typeof createJiti> | undefined} */
let jsxJiti;

/**
 * Each doc file imported in this process: its stamp at the last import and,
 * once it changed, the module each importer read for that change.
 * @type {Map<string, {stamp: string, changed: Record<string, Promise<any>> | null}>}
 */
const imported = new Map();

/** Numbers each fresh native import's URL, so it names a new module. */
let changes = 0;

/**
 * Import `file` with `load` until it changes, then once with `loadFresh` for
 * each change, sharing that module until the next one. Each importer (`kind`)
 * keeps its own module, as each has its own loader. The file counts as read
 * by the running operation (see ../fs/read-record.mjs).
 * @param {string} file
 * @param {'doc' | 'template' | 'native'} kind
 * @param {(file: string) => Promise<any>} load
 * @param {(file: string) => Promise<any>} loadFresh
 * @returns {Promise<any>}
 */
function importCurrent(file, kind, load, loadFresh) {
  recordContentRead(file);
  const stamp = fileStamp(file);
  let seen = imported.get(file);
  if (!seen) {
    imported.set(file, {stamp, changed: null});
    return loadFirst(file, load);
  }
  if (seen.stamp !== stamp) {
    seen = {stamp, changed: {}};
    imported.set(file, seen);
  }
  if (!seen.changed) return loadFirst(file, load);
  return (seen.changed[kind] ??= loadFresh(file));
}

/**
 * A doc file as first imported: a doc Astryx ships answers from its stored
 * exports (STORED_DOCS_FILE), anything else is imported with `load`.
 * @param {string} file
 * @param {(file: string) => Promise<any>} load
 * @returns {Promise<any>}
 */
function loadFirst(file, load) {
  const stored = storedModule(file);
  return stored ? Promise.resolve(stored) : load(file);
}

/**
 * Each stored doc's module, by file, so every read of an unchanged file gets
 * the same object, as an import of it does.
 * @type {Map<string, {key: string, module: Record<string, unknown>}>}
 */
const storedModules = new Map();

/**
 * The module of a doc file whose text has stored exports: an object
 * shaped as its namespace (no prototype, the export names in order, tagged
 * `Module`, closed to new names). Null for any other file.
 * @param {string} file
 * @returns {Record<string, unknown> | null}
 */
function storedModule(file) {
  if (!file.endsWith('.doc.mjs')) return null;
  let text;
  try {
    text = fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
  const key = storedKey(text);
  const known = storedModules.get(file);
  if (known?.key === key) return known.module;
  const exports = readStore(STORED_DOCS_FILE).get(key);
  if (!exports) return null;
  /** @type {Record<string, unknown>} */
  const module = Object.create(null);
  for (const name of Object.keys(exports).sort()) {
    Object.defineProperty(module, name, {
      value: exports[name],
      enumerable: true,
      writable: true,
    });
  }
  Object.defineProperty(module, Symbol.toStringTag, {value: 'Module'});
  Object.preventExtensions(module);
  storedModules.set(file, {key, module});
  return module;
}

/**
 * The file's URL, naming a new module for each change.
 * @param {string} file
 * @returns {string}
 */
function freshUrl(file) {
  const url = pathToFileURL(file);
  url.searchParams.set('astryx-doc', String(++changes));
  return url.href;
}

/**
 * Import `file` from `url`, in its turn with every other read of the file in
 * this process (`readInTurn`, ../fs/module-loader.mjs).
 * @param {string} file
 * @param {string} url
 * @returns {Promise<any>}
 */
function importInTurn(file, url) {
  return readInTurn(file, () => importUrl(url));
}

/**
 * Import `file` again, for a change, as a new module. Node chooses its format
 * as for the first import. The read takes its turn without the file's
 * CommonJS cache entry (`readFreshInTurn`, ../fs/module-loader.mjs).
 * @param {string} file
 * @returns {Promise<any>}
 */
function importFresh(file) {
  return readFreshInTurn(file, () => importUrl(freshUrl(file)));
}

/**
 * Import a component, hook, topic, or self-doc module: `.ts` through jiti,
 * anything else natively.
 * @param {string} file
 * @returns {Promise<any>}
 */
export function importDocModule(file) {
  return importCurrent(file, 'doc', importUserModule, changed =>
    importUserModule(changed, {fresh: true}),
  );
}

/**
 * How core and external template docs have always been imported: `.ts`
 * through a JSX-aware jiti, anything else natively.
 * @param {string} file
 * @returns {Promise<any>}
 */
export function importTemplateModule(file) {
  return importCurrent(
    file,
    'template',
    first => {
      if (first.endsWith('.ts')) {
        jsxJiti ??= createJiti(import.meta.url, {
          ...jitiCacheOptions(),
          jsx: true,
        });
        return jsxJiti.import(first);
      }
      return importInTurn(first, `file://${first}`);
    },
    changed =>
      changed.endsWith('.ts')
        ? createJiti(import.meta.url, {
            ...jitiCacheOptions(),
            jsx: true,
            moduleCache: false,
          }).import(changed)
        : importFresh(changed),
  );
}

/**
 * Import a module natively, by file URL: how the docs API, search, and the
 * unchecked component and hook readers have always imported docs. A `.ts`
 * file goes through jiti, as {@link importDocModule} imports it: Node cannot
 * strip types from a file under node_modules, and below 22.18 it does not
 * strip types at all, so a plain import of an installed or linked
 * integration's `.doc.ts` fails.
 * @param {string} file
 * @returns {Promise<any>}
 */
export function importNativeModule(file) {
  if (file.endsWith('.ts')) {
    return importDocModule(file);
  }
  return importCurrent(
    file,
    'native',
    first => importInTurn(first, pathToFileURL(first).href),
    changed => importFresh(changed),
  );
}
