#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Writes assets/component-list.generated.json at `prepack`: Core's
 * component list and each listed component's import, worked out on a copy of
 * exactly the files Core publishes, with the state of every file and folder
 * that work read. The published CLI uses them for an installed Core while
 * every one of those files and folders is unchanged
 * (foundation/discovery/stored-component-list.mjs). The file is not
 * committed; a checkout without it works the list out on every run, with the
 * same result. `--clean` (at `postpack`) removes it.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {CLI_ROOT} from '../foundation/fs/paths.mjs';
import {
  COMPONENT_LIST_FILE,
  CORE_FOLDER_SKIP,
} from '../foundation/discovery/stored-component-list.mjs';
import {copyPublishedFiles} from './published-files.mjs';

/** Core's package folder in the repository. */
const CORE_DIR = path.resolve(CLI_ROOT, '..', 'core');

/**
 * Copy exactly the files Core publishes into `dest`, as an install holds them.
 * @param {string} dest
 */
export function copyPublishedCore(dest) {
  copyPublishedFiles(CORE_DIR, dest);
}

/**
 * What works the list out for the copy at `core` and prints it, with the
 * state of each file and folder under `core` it read.
 * @param {string} core
 * @returns {string}
 */
function listRunner(core) {
  const at = (/** @type {string} */ rel) =>
    JSON.stringify(pathToFileURL(path.join(CLI_ROOT, rel)).href);
  return `const {recordReads} = await import(${at('foundation/fs/read-record.mjs')});
const {withListingCache} = await import(${at('foundation/fs/listing-cache.mjs')});
const {selfAuditInputs} = await import(${at('foundation/discovery/stored-self-audit.mjs')});
const {discoverComponents, resolveImportPath} = await import(${at('foundation/discovery/component-discovery.mjs')});
const core = ${JSON.stringify(core)};
const seen = new Map();
const value = await recordReads(seen, async () => withListingCache(() => {
  const groups = discoverComponents(core);
  const imports = {};
  for (const name of Object.values(groups).flat()) imports[name] = resolveImportPath(core, name);
  return {groups, imports};
}));
const inputs = selfAuditInputs(seen.keys(), {root: core, skip: ${CORE_FOLDER_SKIP}});
process.stdout.write(JSON.stringify({inputs, ...value}));`;
}

/**
 * The file's text: the stored list under the key `core`.
 * @returns {string}
 */
export function componentListText() {
  // A leftover store would answer the run below: the list is worked out from
  // the current code alone.
  fs.rmSync(COMPONENT_LIST_FILE, {force: true});
  const stage = fs.mkdtempSync(
    path.join(os.tmpdir(), 'astryx-component-list-'),
  );
  try {
    const core = path.join(stage, 'node_modules', '@astryxdesign', 'core');
    copyPublishedCore(core);
    const run = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', listRunner(core)],
      {cwd: stage, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024},
    );
    if (run.status !== 0) throw new Error(run.stderr);
    const entry = JSON.parse(run.stdout);
    // Stored only as plain data that reads back the same.
    if (!isDeepStrictEqual(JSON.parse(JSON.stringify(entry)), entry)) {
      throw new Error('the component list is not plain data');
    }
    if (Object.keys(entry.inputs).length === 0) {
      throw new Error('the component list read nothing');
    }
    return JSON.stringify({core: entry}) + '\n';
  } finally {
    fs.rmSync(stage, {recursive: true, force: true});
  }
}

const isMain =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain && process.argv.includes('--clean')) {
  fs.rmSync(COMPONENT_LIST_FILE, {force: true});
} else if (isMain) {
  fs.writeFileSync(COMPONENT_LIST_FILE, componentListText());
  console.log(`Wrote ${path.relative(process.cwd(), COMPONENT_LIST_FILE)}.`);
}
