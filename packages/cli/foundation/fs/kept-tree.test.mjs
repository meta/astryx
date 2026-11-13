// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for kept-tree: a stored summary is used only while every folder
 * it listed and every file it read is unchanged, a warm hit lists no folder,
 * and a summary of a tree that just changed is not stored. Summaries live in
 * the kept gathers' store, which only an installed CLI with a build id uses,
 * so the CLI's root is set to an installed-looking folder with one.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';

const SLOW = 30_000;

/** The time a stamp needs to settle before a summary is stored, plus margin. */
const SETTLE_WAIT_MS = 2200;

const {TEMP_ROOT} = await vi.hoisted(async () => {
  const nodeFs = await import('node:fs');
  const nodeOs = await import('node:os');
  const nodePath = await import('node:path');
  return {
    TEMP_ROOT: nodeFs.mkdtempSync(
      nodePath.join(nodeOs.tmpdir(), 'astryx-kept-tree-test-'),
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

vi.mock('./paths.mjs', async importOriginal => ({
  .../** @type {object} */ (await importOriginal()),
  CLI_ROOT: path.join(TEMP_ROOT, 'node_modules', '@astryxdesign', 'cli'),
}));

/** @type {typeof import('./kept-tree.mjs').keptTreeSummary} */
let keptTreeSummary;
const savedCache = process.env.XDG_CACHE_HOME;
const STORE = path.join(TEMP_ROOT, 'cache', 'astryx', 'catalogs');

beforeAll(async () => {
  fs.mkdirSync(path.join(FAKE_CLI_ROOT, 'clients', 'cli'), {recursive: true});
  fs.writeFileSync(
    path.join(FAKE_CLI_ROOT, 'clients', 'cli', 'build-id.generated.json'),
    JSON.stringify({id: 'kept-tree-test'}),
  );
  process.env.XDG_CACHE_HOME = path.join(TEMP_ROOT, 'cache');
  // The kept gathers' store: used only once it exists, closed to others.
  fs.mkdirSync(STORE, {recursive: true, mode: 0o700});
  fs.chmodSync(path.join(TEMP_ROOT, 'cache', 'astryx'), 0o700);
  ({keptTreeSummary} = await import('./kept-tree.mjs'));
});

afterAll(() => {
  if (savedCache === undefined) delete process.env.XDG_CACHE_HOME;
  else process.env.XDG_CACHE_HOME = savedCache;
  fs.rmSync(TEMP_ROOT, {recursive: true, force: true});
});

/** @returns {string[]} the summaries in the store */
const storedSummaries = () =>
  fs
    .readdirSync(STORE)
    .filter(name => name.startsWith('gather-') && name.endsWith('.json'))
    .filter(
      name =>
        JSON.parse(fs.readFileSync(path.join(STORE, name), 'utf8')).summary,
    );

/** @param {number} ms */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Run `fn` and count the folders under `root` it lists. The count comes from
 * the module's own `readdirSync`, so it counts every folder a tree walk reads.
 * @template T
 * @param {string} root
 * @param {() => T} fn
 * @returns {{value: T, listed: number}}
 */
function countListings(root, fn) {
  const original = fs.default.readdirSync;
  let listed = 0;
  fs.default.readdirSync = /** @type {typeof original} */ (
    (/** @type {any} */ dir, /** @type {any} */ options) => {
      const at = String(dir);
      if (at === root || at.startsWith(root + path.sep)) listed++;
      return original(dir, options);
    }
  );
  syncBuiltinESMExports();
  try {
    return {value: fn(), listed};
  } finally {
    fs.default.readdirSync = original;
    syncBuiltinESMExports();
  }
}

describe('keptTreeSummary', () => {
  it(
    'reuses a summary until a folder or a read file changes',
    async () => {
      const root = path.join(TEMP_ROOT, 'tree');
      fs.mkdirSync(path.join(root, 'a', 'b'), {recursive: true});
      fs.writeFileSync(path.join(root, 'a', 'one.doc.mjs'), 'Alpha');
      fs.writeFileSync(path.join(root, 'a', 'b', 'two.txt'), 'Beta');
      let made = 0;
      const summary = () =>
        keptTreeSummary({kind: 'test', roots: [root], code: []}, trees => {
          made++;
          const names = [];
          for (const {rel, entries} of trees[0].folders) {
            for (const {name, isDir} of entries) {
              if (isDir) continue;
              names.push(name);
              if (name.endsWith('.doc.mjs')) {
                names.push(trees[0].readText(path.join(rel, name)));
              }
            }
          }
          return names.sort();
        });

      // A tree that just changed is summarized each time.
      expect(summary()).toEqual(['Alpha', 'one.doc.mjs', 'two.txt']);
      expect(summary()).toEqual(['Alpha', 'one.doc.mjs', 'two.txt']);
      expect(made).toBe(2);

      await sleep(SETTLE_WAIT_MS);
      summary();
      expect(made).toBe(3);
      expect(summary()).toEqual(['Alpha', 'one.doc.mjs', 'two.txt']);
      expect(made).toBe(3);

      // A file the summary did not read can change without a new summary.
      fs.writeFileSync(path.join(root, 'a', 'b', 'two.txt'), 'Gamma');
      summary();
      expect(made).toBe(3);

      // A new file in a nested folder is seen.
      fs.writeFileSync(path.join(root, 'a', 'b', 'three.txt'), '');
      expect(summary()).toEqual([
        'Alpha',
        'one.doc.mjs',
        'three.txt',
        'two.txt',
      ]);
      expect(made).toBe(4);

      await sleep(SETTLE_WAIT_MS);
      summary();
      expect(made).toBe(5);
      summary();
      expect(made).toBe(5);

      // So is an edit to a file the summary read.
      fs.writeFileSync(path.join(root, 'a', 'one.doc.mjs'), 'Delta');
      expect(summary()).toContain('Delta');
      expect(made).toBe(6);

      await sleep(SETTLE_WAIT_MS);
      summary();
      expect(made).toBe(7);
      summary();
      expect(made).toBe(7);

      // And a removed file, nested or read.
      fs.rmSync(path.join(root, 'a', 'b', 'three.txt'));
      expect(summary()).toEqual(['Delta', 'one.doc.mjs', 'two.txt']);
      expect(made).toBe(8);
      fs.rmSync(path.join(root, 'a', 'one.doc.mjs'));
      expect(summary()).toEqual(['two.txt']);
      expect(made).toBe(9);
    },
    SLOW,
  );

  it(
    'answers a warm hit from the stored summary without a walk, and walks again when a name is added, renamed or removed',
    async () => {
      const root = path.join(TEMP_ROOT, 'warm');
      fs.mkdirSync(path.join(root, 'inner'), {recursive: true});
      fs.writeFileSync(path.join(root, 'Alpha.doc.mjs'), '');
      fs.writeFileSync(path.join(root, 'inner', 'Beta.doc.mjs'), '');
      let made = 0;
      const names = () =>
        countListings(root, () =>
          keptTreeSummary(
            {kind: 'test-warm', roots: [root], code: []},
            trees => {
              made++;
              return trees[0].folders
                .flatMap(({entries}) => entries)
                .filter(entry => !entry.isDir)
                .map(entry => entry.name)
                .sort();
            },
          ),
        );
      /** @param {string[]} expected */
      const expectWalk = expected => {
        const before = made;
        const {value, listed} = names();
        expect(value).toEqual(expected);
        expect(listed).toBe(2);
        expect(made).toBe(before + 1);
      };
      /** @param {string[]} expected */
      const expectWarmHit = expected => {
        const before = made;
        const {value, listed} = names();
        expect(value).toEqual(expected);
        expect(listed).toBe(0);
        expect(made).toBe(before);
      };

      await sleep(SETTLE_WAIT_MS);
      const storedBefore = storedSummaries().length;
      expectWalk(['Alpha.doc.mjs', 'Beta.doc.mjs']);
      expect(storedSummaries().length).toBe(storedBefore + 1);
      expectWarmHit(['Alpha.doc.mjs', 'Beta.doc.mjs']);
      expectWarmHit(['Alpha.doc.mjs', 'Beta.doc.mjs']);

      fs.writeFileSync(path.join(root, 'inner', 'Gamma.doc.mjs'), '');
      expectWalk(['Alpha.doc.mjs', 'Beta.doc.mjs', 'Gamma.doc.mjs']);
      await sleep(SETTLE_WAIT_MS);
      expectWalk(['Alpha.doc.mjs', 'Beta.doc.mjs', 'Gamma.doc.mjs']);
      expectWarmHit(['Alpha.doc.mjs', 'Beta.doc.mjs', 'Gamma.doc.mjs']);

      fs.renameSync(
        path.join(root, 'inner', 'Beta.doc.mjs'),
        path.join(root, 'inner', 'Delta.doc.mjs'),
      );
      expectWalk(['Alpha.doc.mjs', 'Delta.doc.mjs', 'Gamma.doc.mjs']);
      await sleep(SETTLE_WAIT_MS);
      expectWalk(['Alpha.doc.mjs', 'Delta.doc.mjs', 'Gamma.doc.mjs']);
      expectWarmHit(['Alpha.doc.mjs', 'Delta.doc.mjs', 'Gamma.doc.mjs']);

      fs.unlinkSync(path.join(root, 'Alpha.doc.mjs'));
      expectWalk(['Delta.doc.mjs', 'Gamma.doc.mjs']);
      await sleep(SETTLE_WAIT_MS);
      expectWalk(['Delta.doc.mjs', 'Gamma.doc.mjs']);
      expectWarmHit(['Delta.doc.mjs', 'Gamma.doc.mjs']);
    },
    SLOW,
  );

  it('summarizes a missing root as an empty tree', () => {
    const root = path.join(TEMP_ROOT, 'missing');
    const folders = keptTreeSummary(
      {kind: 'test-missing', roots: [root], code: []},
      trees => trees[0].folders,
    );
    expect(folders).toEqual([{rel: '', entries: []}]);
  });
});
