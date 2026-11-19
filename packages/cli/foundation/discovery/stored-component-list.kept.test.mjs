// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The check that the stored component list matches the installed Core:
 * the first run keeps its verdict in the per-user cache folder, a warm run
 * takes it back without reading Core's files again, an edited file changes
 * the verdict on the very next run, and a folder that cannot be written gives
 * the same answer. Verdicts are kept only by an installed CLI with a build
 * id, so the CLI's root is set to an installed-looking folder with one.
 *
 * @input a stand-in Core and a stored list recorded from it
 * @output assertions on storedComponentList and on its kept entry
 * @position foundation/discovery/ beside the module it tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';

const SLOW = 60_000;

/** The time a stamp needs to settle before a summary is stored, plus margin. */
const SETTLE_WAIT_MS = 2200;

const {TEMP_ROOT} = await vi.hoisted(async () => {
  const nodeFs = await import('node:fs');
  const nodeOs = await import('node:os');
  const nodePath = await import('node:path');
  return {
    TEMP_ROOT: nodeFs.mkdtempSync(
      nodePath.join(nodeOs.tmpdir(), 'astryx-stored-list-check-'),
    ),
  };
});

/** An installed-looking CLI root, so the store keeps entries. */
const FAKE_CLI_ROOT = path.join(
  TEMP_ROOT,
  'node_modules',
  '@astryxdesign',
  'cli',
);

vi.mock('../fs/paths.mjs', async importOriginal => ({
  .../** @type {object} */ (await importOriginal()),
  CLI_ROOT: path.join(TEMP_ROOT, 'node_modules', '@astryxdesign', 'cli'),
}));

// Counts the checks that read Core's files.
vi.mock('./stored-self-audit.mjs', async importOriginal => {
  const real = /** @type {any} */ (await importOriginal());
  return {...real, inputsUnchanged: vi.fn(real.inputsUnchanged)};
});

/** @type {typeof import('./stored-component-list.mjs').storedComponentList} */
let storedComponentList;
/** @type {import('vitest').Mock} */
let inputsUnchanged;
const savedCache = process.env.XDG_CACHE_HOME;
const CACHE = path.join(TEMP_ROOT, 'cache');
const STORE = path.join(CACHE, 'astryx', 'catalogs');
/** A Core folder, outside the repository, whose files keep their stamps. */
const CORE = path.join(TEMP_ROOT, 'core');
const DOC = path.join(CORE, 'src', 'Glint', 'Glint.doc.mjs');
const GROUPS = {Core: ['Glint']};
const IMPORTS = {Glint: '@astryxdesign/core'};

beforeAll(async () => {
  fs.mkdirSync(path.join(FAKE_CLI_ROOT, 'clients', 'cli'), {recursive: true});
  fs.writeFileSync(
    path.join(FAKE_CLI_ROOT, 'clients', 'cli', 'build-id.generated.json'),
    JSON.stringify({id: 'stored-list-check-test'}),
  );
  process.env.XDG_CACHE_HOME = CACHE;
  // A run's first kept gather makes the folder; verdicts are kept only in it.
  (await import('../fs/gather-cache.mjs')).makeGatherCacheDir();
  fs.mkdirSync(path.dirname(DOC), {recursive: true});
  fs.writeFileSync(DOC, "export const docs = {name: 'Glint'};\n");
  const audit = await import('./stored-self-audit.mjs');
  const {COMPONENT_LIST_FILE, CORE_FOLDER_SKIP} =
    await import('./stored-component-list.mjs');
  const inputs = audit.selfAuditInputs(
    [path.join(CORE, 'src'), path.dirname(DOC), DOC],
    {root: CORE, skip: CORE_FOLDER_SKIP},
  );
  fs.mkdirSync(path.dirname(COMPONENT_LIST_FILE), {recursive: true});
  fs.writeFileSync(
    COMPONENT_LIST_FILE,
    JSON.stringify({core: {inputs, groups: GROUPS, imports: IMPORTS}}) + '\n',
  );
  ({storedComponentList} = await import('./stored-component-list.mjs'));
  inputsUnchanged = /** @type {any} */ (audit.inputsUnchanged);
});

afterAll(() => {
  if (savedCache === undefined) delete process.env.XDG_CACHE_HOME;
  else process.env.XDG_CACHE_HOME = savedCache;
  fs.chmodSync(STORE, 0o700);
  fs.rmSync(TEMP_ROOT, {recursive: true, force: true});
});

/** @param {number} ms */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * The kept verdict's entry: its file and inode. A read-back touches the file
 * in place; storing writes a new file over it by a rename, so an unchanged
 * inode means the last run took the verdict back.
 * @returns {{file: string, ino: number}}
 */
const keptCheck = () => {
  const files = fs
    .readdirSync(STORE)
    .filter(name => name.startsWith('gather-') && name.endsWith('.json'))
    .map(name => path.join(STORE, name))
    .filter(file => {
      const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
      return (
        entry.summary &&
        JSON.stringify(entry.key).includes('stored-component-list-check')
      );
    });
  expect(files).toHaveLength(1);
  return {file: files[0], ino: fs.statSync(files[0]).ino};
};

const STORED = {groups: GROUPS, imports: IMPORTS};

describe('the stored component list check', () => {
  it(
    'is kept, and a warm run takes it back without reading Core again',
    async () => {
      await sleep(SETTLE_WAIT_MS);
      expect(storedComponentList(CORE)).toEqual(STORED);
      const kept = keptCheck();
      const checks = inputsUnchanged.mock.calls.length;
      expect(checks).toBeGreaterThan(0);
      expect(storedComponentList(CORE)).toEqual(STORED);
      expect(inputsUnchanged.mock.calls.length).toBe(checks);
      expect(keptCheck().ino).toBe(kept.ino);
    },
    SLOW,
  );

  it(
    'shows an edited Core file on the very next run, and its undoing too',
    async () => {
      const text = fs.readFileSync(DOC, 'utf8');
      fs.writeFileSync(DOC, "export const docs = {name: 'Glint', x: 1};\n");
      expect(storedComponentList(CORE)).toBeNull();
      fs.writeFileSync(DOC, text);
      expect(storedComponentList(CORE)).toEqual(STORED);
    },
    SLOW,
  );

  it(
    'gives the same answer when the cache folder cannot be written',
    async () => {
      fs.rmSync(STORE, {recursive: true, force: true});
      fs.mkdirSync(STORE, {recursive: true, mode: 0o500});
      expect(storedComponentList(CORE)).toEqual(STORED);
      fs.writeFileSync(DOC, "export const docs = {name: 'Glint', y: 2};\n");
      expect(storedComponentList(CORE)).toBeNull();
      expect(fs.readdirSync(STORE)).toEqual([]);
    },
    SLOW,
  );
});
