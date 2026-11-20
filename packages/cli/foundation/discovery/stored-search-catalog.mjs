// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Search's catalog for a project that adds nothing to it, as gathered at
 * publish from the CLI and the Core it was published with
 * (scripts/generate-search-catalog.mjs), with the state of every file and
 * folder of the two packages that the gather read.
 *
 * @input `storedSearchCatalog(coreDir, cwd)`.
 * @output The stored catalog (its candidates, encoded as a kept gather encodes
 *   them, docs' commands spelled for the package manager docs render for)
 *   while the project adds nothing to a catalog and every recorded file
 *   and folder of the CLI and of the Core in `coreDir` is in its recorded
 *   state; else null, and search gathers live. An edited, added or removed
 *   file, a patched install, another Core version or a checkout all gather
 *   live.
 * @position Read by search's adapter (api/search/_adapter.mjs) before it
 *   gathers. The project's side is checked live on every run, never stored:
 *   the run is not hosted, no integration can load (mayHaveIntegrations:
 *   no Astryx config, no integration manifest in the project or its declared
 *   dependencies, and the run is inside a project), no installed package
 *   declares Astryx docs or blocks (discoverExternalPackages), and the
 *   project's local themes root holds no theme folder. The generator checks
 *   that every path in the project the gather reads is one this check, or
 *   the lookup of the project's Core, reads too.
 *
 *   The file holds two lines. The first is the header (StoredCatalogHeader).
 *   The second is the body (StoredCatalogBody), whose text may hold
 *   references: `{"\u0000at":[file,offset,length]}` stands for the JSON text
 *   at that byte range of the header's `files[file]`. The body is read only
 *   once the check passes.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CLI_ROOT,
  discoverExternalPackages,
  findPackageRoot,
} from '../fs/paths.mjs';
import {mayHaveIntegrations} from '../integrations/may-have-integrations.mjs';
import {hostedRun} from '../runtime/package-root.mjs';
import {docPackageManager} from '../env/package-manager.mjs';
import {inputsUnchanged} from './stored-self-audit.mjs';
import {CORE_FOLDER_SKIP} from './stored-component-list.mjs';
import {discoverLocalThemes} from './theme-discovery.mjs';

/** Where the stored catalog is written at `prepack`. */
export const SEARCH_CATALOG_FILE = path.join(
  CLI_ROOT,
  'assets',
  'search-catalog.generated.json',
);

/**
 * @typedef {object} StoredCatalogHeader
 * @property {Record<string, string>} cli - State of each CLI file and folder
 *   the gather read, by path in the CLI.
 * @property {Record<string, string>} core - The same for Core, by path in
 *   Core.
 * @property {string} base - The package manager `value`'s docs spell
 *   commands for.
 * @property {string[]} files - The CLI's files the body's references point
 *   into, by path in the CLI. Each is an input checked by its content.
 */

/**
 * @typedef {object} StoredCatalogBody
 * @property {{all: unknown[]}} value - The gathered catalog, encoded as
 *   search's kept gather encodes it.
 * @property {Record<string, [number, (string | number)[], unknown][]>} differences -
 *   For each other package manager, each value that differs from `value`'s:
 *   the candidate's position, the path to the value in it, and the value.
 */

/**
 * A reference in the body's text. A raw `{"` never occurs inside a JSON
 * string, whose quotes are escaped, so the pattern matches only references.
 */
const REFERENCE = /\{"\\u0000at":\[(\d+),(\d+),(\d+)\]\}/g;

/** The key of a reference, as an object, before it is written. */
export const AT = '\0at';

/**
 * Whether the project in `cwd` can add anything to a catalog: an integration
 * that can load, an installed package that declares Astryx docs or blocks,
 * or a local theme. A hosted run reads the host's packages, so it counts as
 * adding.
 * @param {string} cwd
 * @returns {boolean}
 */
export function projectAddsToCatalog(cwd) {
  return (
    hostedRun() != null ||
    mayHaveIntegrations(cwd) ||
    discoverExternalPackages(cwd).length > 0 ||
    holdsLocalThemes(findPackageRoot(cwd) ?? cwd)
  );
}

/**
 * Whether the project's local themes root holds a theme folder, valid or not,
 * found as the project's theme list finds them (discoverLocalThemes).
 * @param {string} projectDir
 * @returns {boolean}
 */
function holdsLocalThemes(projectDir) {
  let broken = false;
  try {
    const found = discoverLocalThemes(projectDir, undefined, {
      onFolderError: () => {
        broken = true;
      },
    });
    return found.length > 0 || broken;
  } catch {
    // A root discovery cannot read is a project the store cannot stand for.
    return true;
  }
}

/**
 * The catalog stored at publish, with docs' commands spelled for the package
 * manager docs render for here (docPackageManager), while the project in
 * `cwd` adds nothing to a catalog and every file and folder of the CLI and of
 * the Core in `coreDir` that its gather read is unchanged; else null.
 * @param {string} coreDir
 * @param {string} cwd
 * @returns {{pm: string, value: {all: unknown[]}} | null}
 */
export function storedSearchCatalog(coreDir, cwd) {
  if (projectAddsToCatalog(cwd)) return null;
  const store = openStore();
  if (
    !store ||
    !inputsUnchanged(CLI_ROOT, store.header.cli) ||
    !inputsUnchanged(coreDir, store.header.core, CORE_FOLDER_SKIP)
  ) {
    return null;
  }
  const pm = docPackageManager(cwd);
  const value = catalogFor(store, pm);
  return value && {pm, value};
}

/**
 * The catalog stored at publish for `pm`, unchecked: for a kept gather that
 * read it in a run whose every file the check read is unchanged since.
 * @param {string} pm
 * @returns {{all: unknown[]} | null}
 */
export function keptStoredCatalog(pm) {
  const store = openStore();
  return store && catalogFor(store, pm);
}

/**
 * @typedef {object} OpenStore
 * @property {StoredCatalogHeader} header
 * @property {Buffer} bodyText - The body's text, references unresolved.
 * @property {StoredCatalogBody | null} [body] - The body, once read.
 */

/** The store, read once per process; null when it cannot be used. */
/** @type {OpenStore | null | undefined} */
let opened;

/** @returns {OpenStore | null} */
function openStore() {
  if (opened === undefined) {
    try {
      opened = parseStore(fs.readFileSync(SEARCH_CATALOG_FILE));
    } catch {
      opened = null;
    }
  }
  return opened;
}

/**
 * The store's header and its body's text, or null when the bytes are not a
 * store's shape.
 * @param {Buffer} bytes
 * @returns {OpenStore | null}
 */
export function parseStore(bytes) {
  const end = bytes.indexOf(0x0a);
  if (end === -1) return null;
  try {
    const header = JSON.parse(bytes.toString('utf-8', 0, end));
    return header &&
      typeof header.cli === 'object' &&
      typeof header.core === 'object' &&
      typeof header.base === 'string' &&
      Array.isArray(header.files)
      ? {header, bodyText: bytes.subarray(end + 1)}
      : null;
  } catch {
    return null;
  }
}

/**
 * The body, its references read from the CLI's files they point into, once
 * per store; null when a file cannot be read or the body is not a body's
 * shape.
 * @param {OpenStore} store
 * @returns {StoredCatalogBody | null}
 */
function bodyOf(store) {
  if (store.body === undefined) {
    try {
      store.body = parseBody(
        store.bodyText,
        store.header.files.map(rel =>
          fs.readFileSync(path.join(CLI_ROOT, ...rel.split('/'))),
        ),
      );
    } catch {
      store.body = null;
    }
  }
  return store.body;
}

/**
 * The body in `text`, each reference replaced by the JSON text it points at
 * in `files`; null when it is not a body's shape. Throws when the text does
 * not parse.
 * @param {Buffer} text
 * @param {Buffer[]} files
 * @returns {StoredCatalogBody | null}
 */
export function parseBody(text, files) {
  const body = JSON.parse(
    text
      .toString('utf-8')
      .replace(REFERENCE, (_, file, offset, length) =>
        files[Number(file)].toString(
          'utf-8',
          Number(offset),
          Number(offset) + Number(length),
        ),
      ),
  );
  return Array.isArray(body?.value?.all) && typeof body.differences === 'object'
    ? body
    : null;
}

/**
 * The catalog with docs' commands spelled for `pm`, or null for a package
 * manager the store holds none for, or a body that cannot be read.
 * @param {OpenStore} store
 * @param {string} pm
 * @returns {{all: unknown[]} | null}
 */
function catalogFor(store, pm) {
  const body = bodyOf(store);
  return body && catalogIn(body, store.header.base, pm);
}

/**
 * The catalog in `body` for `pm`, whose `value` is for `base`; null for a
 * package manager it holds none for.
 * @param {StoredCatalogBody} body
 * @param {string} base
 * @param {string} pm
 * @returns {{all: unknown[]} | null}
 */
export function catalogIn(body, base, pm) {
  if (pm === base) return body.value;
  const changes = body.differences[pm];
  if (!Array.isArray(changes)) return null;
  const all = [...body.value.all];
  for (const [at, where, change] of changes) {
    all[at] = withChange(all[at], where, change);
  }
  return {...body.value, all};
}

/**
 * `value` with the value at `where` (keys and positions, outermost first)
 * replaced by `change`, sharing every part it does not change.
 * @param {any} value
 * @param {(string | number)[]} where
 * @param {unknown} change
 * @returns {any}
 */
function withChange(value, where, change) {
  if (where.length === 0) return change;
  const [key, ...rest] = where;
  const copy = Array.isArray(value) ? [...value] : {...value};
  copy[key] = withChange(value[key], rest, change);
  return copy;
}
