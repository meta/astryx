#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Writes assets/search-catalog.generated.json at `prepack`: search's
 * catalog for a project that adds nothing to it, gathered in a project that
 * installs exactly the files the CLI and Core publish, with the state of every
 * file and folder of the two packages the gather read. The published CLI
 * uses it while a project adds nothing and every one of those files and
 * folders is unchanged (foundation/discovery/stored-search-catalog.mjs). The
 * file is not committed; a checkout without it gathers on every run, with the
 * same result. `--clean` (at `postpack`) removes it.
 *
 * It runs after the stores the gather reads (the stored docs, the template
 * component lists, the component list, the self-audit), so their final
 * content is what it records.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {CLI_ROOT} from '../foundation/fs/paths.mjs';
import {
  AT,
  SEARCH_CATALOG_FILE,
  catalogIn,
  parseBody,
  parseStore,
} from '../foundation/discovery/stored-search-catalog.mjs';
import {CORE_FOLDER_SKIP} from '../foundation/discovery/stored-component-list.mjs';
import {copyPublishedFiles} from './published-files.mjs';
import {copyPublishedCore} from './generate-component-list.mjs';
import {DOC_PACKAGE_MANAGERS} from '../foundation/doc-compiler/doc-syntax.mjs';
import {storedKey} from '../foundation/doc-compiler/stored-docs.mjs';
import {LOCKFILES} from './same-beside-lockfiles.mjs';

/**
 * What gathers the catalog in the working folder with the CLI copy at `cli`,
 * with docs' commands spelled for `pm` (the project's own when null), and
 * prints it with that package manager and the state of each file and folder
 * of the two packages it read. It fails when the gather reads or probes a
 * path outside the two packages (other than code it loads, and the per-user
 * folders, where only integrations installed for the computer are read, which
 * never load inside a project) that the run's live steps do not: the lookup of
 * the project's Core and the check that the project adds nothing.
 * @param {string} cli
 * @param {string} core
 * @param {string | null} pm
 * @returns {string}
 */
function gatherRunner(cli, core, pm) {
  const at = (/** @type {string} */ rel) =>
    JSON.stringify(pathToFileURL(path.join(cli, rel)).href);
  return `const {recordReads} = await import(${at('foundation/fs/read-record.mjs')});
const {selfAuditInputs} = await import(${at('foundation/discovery/stored-self-audit.mjs')});
const {projectAddsToCatalog} = await import(${at('foundation/discovery/stored-search-catalog.mjs')});
const {docPackageManager, runWithDocPackageManager} = await import(${at('foundation/env/package-manager.mjs')});
const {gatherCandidates, encodeStoredCatalog, requireSearchCoreDir, resolveSearchCore} = await import(${at('api/search/_adapter.mjs')});
const project = process.cwd();
const live = new Map();
const {realDir} = await import(${at('foundation/fs/paths.mjs')});
const adds = await recordReads(live, async () => {
  // What search's adapter does before it reads the store: the kept gather's
  // key (the real folder), the lookup of Core, and the project check.
  realDir(project);
  resolveSearchCore(undefined, requireSearchCoreDir, project);
  return projectAddsToCatalog(project);
}, {exact: true});
if (adds) throw new Error('the probe project adds to a catalog');
const pm = ${JSON.stringify(pm)} ?? docPackageManager(project);
const seen = new Map();
const probed = new Map();
const gathered = await runWithDocPackageManager(pm, () =>
  recordReads(probed, () => recordReads(seen, () => gatherCandidates({cwd: project})), {exact: true}));
if (gathered.coreSkipped != null) throw new Error('the gather found no Core: ' + gathered.coreSkipped);
const path = await import('node:path');
const within = (root, file) => {
  const rel = path.relative(root, file);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};
const packages = [${JSON.stringify(cli)}, ${JSON.stringify(core)}];
const home = process.env.HOME;
const uncovered = [...probed.keys()].filter(file =>
  !within(home, file) &&
  !packages.some(root => within(root, file)) &&
  !/\\.[cm]?js$/.test(file) &&
  !live.has(file));
if (uncovered.length > 0) throw new Error('the gather reads paths outside the packages that the live check does not: ' + uncovered.join(', '));
process.stdout.write(JSON.stringify({
  pm,
  cli: selfAuditInputs(seen.keys(), {root: ${JSON.stringify(cli)}}),
  core: selfAuditInputs(seen.keys(), {root: ${JSON.stringify(core)}, skip: ${CORE_FOLDER_SKIP}}),
  value: encodeStoredCatalog(gathered),
}));`;
}

/**
 * Gather in the probe project at `project`, with a per-user folder of its own,
 * so no integration of the machine that packs can load. Each gather runs in a
 * process of its own, so nothing one package manager's gather rendered is
 * reused for another.
 * @param {string} project
 * @param {string} cli
 * @param {string} core
 * @param {string | null} pm
 * @returns {{pm: string, cli: Record<string, string>, core: Record<string, string>, value: any}}
 */
function gather(project, cli, core, pm) {
  // Real paths, as the gather reads them: a temp folder may sit behind a
  // link (macOS's is).
  const home = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-catalog-home-')),
  );
  try {
    const run = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', gatherRunner(cli, core, pm)],
      {
        cwd: project,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        env: {
          PATH: process.env.PATH,
          HOME: home,
          USERPROFILE: home,
          XDG_CACHE_HOME: path.join(home, 'cache'),
          XDG_CONFIG_HOME: path.join(home, 'config'),
          XDG_DATA_HOME: path.join(home, 'data'),
          TMPDIR: home,
        },
      },
    );
    if (run.status !== 0) throw new Error(run.stderr);
    return JSON.parse(run.stdout);
  } finally {
    fs.rmSync(home, {recursive: true, force: true});
  }
}

/**
 * The store's text from each package manager's gather: the inputs every
 * gather read; the first package manager's catalog whole; for each other one
 * only the values that differ from it; and, in both, each string whose JSON
 * text one of the CLI's JSON inputs (the other stores among them) holds as a
 * reference to that text, where the reference is the shorter.
 * @param {Record<string, {cli: Record<string, string>, core: Record<string, string>, value: any}>} byPm
 * @param {string} cli the probe's copy of the CLI
 * @returns {string} the store's text: its header line, then its body line
 */
function storedText(byPm, cli) {
  const [base, ...others] = DOC_PACKAGE_MANAGERS;
  /** @type {Record<string, string>} */
  const cliInputs = {};
  /** @type {Record<string, string>} */
  const coreInputs = {};
  for (const pm of DOC_PACKAGE_MANAGERS) {
    Object.assign(cliInputs, byPm[pm].cli);
    Object.assign(coreInputs, byPm[pm].core);
  }
  // The gather looks for the store it is writing, absent until written: the
  // store is not an input of itself.
  const own = path
    .relative(CLI_ROOT, SEARCH_CATALOG_FILE)
    .split(path.sep)
    .join('/');
  delete cliInputs[own];
  // Only a file checked by its whole content can be pointed into: a packer
  // rewrites package.json, which is checked by some of its fields.
  /** @param {string} rel */
  const bytesOf = rel => fs.readFileSync(path.join(cli, ...rel.split('/')));
  const files = Object.keys(cliInputs).filter(
    rel =>
      rel.endsWith('.json') &&
      fs
        .statSync(path.join(cli, ...rel.split('/')), {throwIfNoEntry: false})
        ?.isFile() &&
      cliInputs[rel] === storedKey(bytesOf(rel)),
  );
  const strings = jsonStrings(files.map(bytesOf));
  /** @param {unknown} value */
  const referenced = value => withReferences(value, strings);
  const value = byPm[base].value;
  /** @type {Record<string, [number, (string | number)[], unknown][]>} */
  const differences = {};
  for (const pm of others) {
    const other = byPm[pm].value;
    if (
      other.all.length !== value.all.length ||
      !isDeepStrictEqual(other.components, value.components)
    ) {
      throw new Error(`the search catalog for ${pm} holds other candidates`);
    }
    differences[pm] = other.all.flatMap(
      (/** @type {unknown} */ c, /** @type {number} */ i) =>
        changesBetween(value.all[i], c).map(
          ([where, change]) =>
            /** @type {[number, (string | number)[], unknown]} */ ([
              i,
              where,
              referenced(change),
            ]),
        ),
    );
  }
  if (
    Object.keys(cliInputs).length === 0 ||
    Object.keys(coreInputs).length === 0
  ) {
    throw new Error('the search catalog read nothing of the CLI or Core');
  }
  const header = {cli: cliInputs, core: coreInputs, base, files};
  const body = {
    value: {...value, all: value.all.map(referenced)},
    differences,
  };
  const text = `${JSON.stringify(header)}\n${JSON.stringify(body)}\n`;
  // Stored only as plain data that reads back as each gather did.
  const store = parseStore(Buffer.from(text));
  const read =
    store && parseBody(store.bodyText, store.header.files.map(bytesOf));
  for (const pm of DOC_PACKAGE_MANAGERS) {
    if (
      !read ||
      !isDeepStrictEqual(catalogIn(read, base, pm), byPm[pm].value)
    ) {
      throw new Error(`the search catalog for ${pm} does not read back`);
    }
  }
  return text;
}

/**
 * Each value in `b` that differs from `a`, with its path (keys and
 * positions, outermost first): only the values that differ, where the two
 * have the same shape around them.
 * @param {any} a
 * @param {any} b
 * @param {(string | number)[]} [where]
 * @returns {[(string | number)[], unknown][]}
 */
function changesBetween(a, b, where = []) {
  if (isDeepStrictEqual(a, b)) return [];
  const sameShape =
    a !== null &&
    b !== null &&
    typeof a === 'object' &&
    typeof b === 'object' &&
    Array.isArray(a) === Array.isArray(b) &&
    isDeepStrictEqual(Object.keys(a), Object.keys(b));
  if (!sameShape) return [[where, b]];
  return Object.keys(b).flatMap(key =>
    changesBetween(a[key], b[key], [
      ...where,
      Array.isArray(b) ? Number(key) : key,
    ]),
  );
}

/**
 * Where each JSON string's text first sits in `files`: file, byte offset and
 * byte length, by the text's bytes (read as latin1, one character a byte).
 * @param {Buffer[]} files
 * @returns {Map<string, [number, number, number]>}
 */
function jsonStrings(files) {
  /** @type {Map<string, [number, number, number]>} */
  const at = new Map();
  files.forEach((bytes, file) => {
    const text = bytes.toString('latin1');
    for (const match of text.matchAll(/"(?:[^"\\]|\\.)*"/g)) {
      if (!at.has(match[0])) {
        at.set(match[0], [file, match.index, match[0].length]);
      }
    }
  });
  return at;
}

/**
 * `value` with each string whose JSON text `strings` holds replaced by a
 * reference to it, where the reference's JSON is shorter than the string's.
 * @param {unknown} value
 * @param {Map<string, [number, number, number]>} strings
 * @returns {unknown}
 */
function withReferences(value, strings) {
  if (typeof value === 'string') {
    const text = JSON.stringify(value);
    const at = strings.get(Buffer.from(text, 'utf-8').toString('latin1'));
    const reference = at && {[AT]: at};
    return reference && JSON.stringify(reference).length < text.length
      ? reference
      : value;
  }
  if (Array.isArray(value)) return value.map(v => withReferences(v, strings));
  if (value === null || typeof value !== 'object') return value;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = withReferences(v, strings);
  }
  return out;
}

/**
 * The file's text (foundation/discovery/stored-search-catalog.mjs).
 * @returns {string}
 */
export function searchCatalogText() {
  // A leftover store would answer the gather below.
  fs.rmSync(SEARCH_CATALOG_FILE, {force: true});
  const stage = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-search-catalog-')),
  );
  try {
    const modules = path.join(stage, 'node_modules', '@astryxdesign');
    const core = path.join(modules, 'core');
    const cli = path.join(modules, 'cli');
    copyPublishedCore(core);
    copyPublishedFiles(CLI_ROOT, cli);
    // The CLI's own dependencies, as an install places them beside it.
    fs.symlinkSync(
      path.join(CLI_ROOT, 'node_modules'),
      path.join(cli, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const pkg = path.join(stage, 'package.json');
    fs.writeFileSync(
      pkg,
      JSON.stringify({
        name: 'astryx-catalog-probe',
        private: true,
        dependencies: {'@astryxdesign/cli': '*', '@astryxdesign/core': '*'},
      }),
    );
    /** @type {Record<string, ReturnType<typeof gather>>} */
    const byPm = {};
    for (const pm of DOC_PACKAGE_MANAGERS)
      byPm[pm] = gather(stage, cli, core, pm);
    const text = storedText(byPm, cli);
    // The project's side is not stored: prove a lockfile changes the catalog
    // only through the package manager docs spell commands for.
    for (const lockfile of LOCKFILES) {
      const lock = path.join(stage, lockfile);
      fs.writeFileSync(lock, '');
      try {
        const beside = gather(stage, cli, core, null);
        if (!isDeepStrictEqual(beside.value, byPm[beside.pm].value)) {
          throw new Error(`the search catalog differs beside ${lockfile}`);
        }
      } finally {
        fs.rmSync(lock);
      }
    }
    return text;
  } finally {
    fs.rmSync(stage, {recursive: true, force: true});
  }
}

const isMain =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain && process.argv.includes('--clean')) {
  fs.rmSync(SEARCH_CATALOG_FILE, {force: true});
} else if (isMain) {
  fs.writeFileSync(SEARCH_CATALOG_FILE, searchCatalogText());
  console.log(`Wrote ${path.relative(process.cwd(), SEARCH_CATALOG_FILE)}.`);
}
