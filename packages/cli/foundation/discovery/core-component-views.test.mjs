// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The Core component views that the component matcher's keyword and
 * description pass reads: the first read keeps them in the per-user cache
 * folder, a warm read takes them back without reading a Core doc, an edited,
 * added or removed doc shows in the very next read, and a folder that cannot
 * be written still gives the same answer. The views are kept only by an
 * installed CLI with a build id, so the CLI's root is set to an
 * installed-looking folder with one.
 *
 * @input a Core folder with a component doc in its own folder, one in a
 *   group folder, and one that does not load
 * @output assertions on coreComponentViews and on its kept entry
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
      nodePath.join(nodeOs.tmpdir(), 'astryx-core-views-'),
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

// Counts the docs that a read loads.
vi.mock('../doc-compiler/read.mjs', async importOriginal => {
  const real = /** @type {any} */ (await importOriginal());
  return {...real, readDocView: vi.fn(real.readDocView)};
});

/** @type {typeof import('./core-component-views.mjs').coreComponentViews} */
let coreComponentViews;
/** @type {import('vitest').Mock} */
let readDocView;
const savedCache = process.env.XDG_CACHE_HOME;
const CACHE = path.join(TEMP_ROOT, 'cache');
const STORE = path.join(CACHE, 'astryx', 'catalogs');
/** A Core folder, outside the repository, whose files keep their stamps. */
const CORE = path.join(TEMP_ROOT, 'core');
const NAMES = ['Glint', 'Nested', 'Broken', 'Missing'];

/**
 * Write the doc of `name` at `rel` (from `src`) with its keywords.
 * @param {string} rel
 * @param {string} name
 * @param {string[]} keywords
 */
function writeDoc(rel, name, keywords) {
  const dir = path.join(CORE, 'src', rel);
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(
    path.join(dir, `${name}.doc.mjs`),
    `export const docs = ${JSON.stringify({name, description: `The ${name}.`, keywords})};\n`,
  );
}

beforeAll(async () => {
  fs.mkdirSync(path.join(FAKE_CLI_ROOT, 'clients', 'cli'), {recursive: true});
  fs.writeFileSync(
    path.join(FAKE_CLI_ROOT, 'clients', 'cli', 'build-id.generated.json'),
    JSON.stringify({id: 'core-views-test'}),
  );
  process.env.XDG_CACHE_HOME = CACHE;
  // A run's first kept gather makes the folder; the views are kept only in it.
  (await import('../fs/gather-cache.mjs')).makeGatherCacheDir();
  writeDoc('Glint', 'Glint', ['shine']);
  writeDoc(path.join('group', 'Nested'), 'Nested', ['inner']);
  fs.mkdirSync(path.join(CORE, 'src', 'Broken'), {recursive: true});
  fs.writeFileSync(
    path.join(CORE, 'src', 'Broken', 'Broken.doc.mjs'),
    "throw new Error('no doc');\n",
  );
  ({coreComponentViews} = await import('./core-component-views.mjs'));
  readDocView = /** @type {any} */ (
    (await import('../doc-compiler/read.mjs')).readDocView
  );
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
 * The kept views entry: its file and inode. A read-back touches the file in
 * place; storing writes a new file over it by a rename, so an unchanged inode
 * means the last read took the views back.
 * @returns {{file: string, ino: number}}
 */
const keptViews = () => {
  const files = fs
    .readdirSync(STORE)
    .filter(name => name.startsWith('gather-') && name.endsWith('.json'))
    .map(name => path.join(STORE, name))
    .filter(file => {
      const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
      return (
        entry.summary &&
        JSON.stringify(entry.key).includes('core-component-views')
      );
    });
  expect(files).toHaveLength(1);
  return {file: files[0], ino: fs.statSync(files[0]).ino};
};

/**
 * Each name with its view's keywords, or null for no view.
 * @returns {Promise<Array<[string, unknown]>>}
 */
const read = async () =>
  [...(await coreComponentViews(CORE, NAMES))].map(
    ([name, view]) =>
      /** @type {[string, unknown]} */ ([name, view?.keywords ?? null]),
  );

describe('Core component views', () => {
  it(
    'are kept, and a warm read takes them back without reading a doc',
    async () => {
      await sleep(SETTLE_WAIT_MS);
      const expected = [
        ['Glint', ['shine']],
        ['Nested', ['inner']],
        ['Broken', null],
        ['Missing', null],
      ];
      expect(await read()).toEqual(expected);
      const kept = keptViews();
      const loads = readDocView.mock.calls.length;
      expect(loads).toBeGreaterThan(0);
      expect(await read()).toEqual(expected);
      expect(readDocView.mock.calls.length).toBe(loads);
      expect(keptViews().ino).toBe(kept.ino);
    },
    SLOW,
  );

  it(
    "show an edited doc's keywords, an added doc and a removed one in the very next read",
    async () => {
      writeDoc('Glint', 'Glint', ['shine', 'sparkle']);
      expect(await read()).toContainEqual(['Glint', ['shine', 'sparkle']]);
      writeDoc('Missing', 'Missing', ['found']);
      expect(await read()).toContainEqual(['Missing', ['found']]);
      fs.rmSync(path.join(CORE, 'src', 'group', 'Nested'), {recursive: true});
      expect(await read()).toContainEqual(['Nested', null]);
    },
    SLOW,
  );

  it(
    'give the same answer when the cache folder cannot be written',
    async () => {
      fs.rmSync(STORE, {recursive: true, force: true});
      fs.mkdirSync(STORE, {recursive: true, mode: 0o500});
      writeDoc('Glint', 'Glint', ['glow']);
      expect(await read()).toEqual([
        ['Glint', ['glow']],
        ['Nested', null],
        ['Broken', null],
        ['Missing', ['found']],
      ]);
      expect(fs.readdirSync(STORE)).toEqual([]);
    },
    SLOW,
  );
});
