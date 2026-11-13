// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for kept-tree: a stored summary is used only while every folder
 * it listed and every file it read is unchanged, and a summary of a tree that
 * just changed is not stored.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const SLOW = 30_000;

/** The time a stamp needs to settle before a summary is stored, plus margin. */
const SETTLE_WAIT_MS = 2200;

let TEMP_ROOT = '';
/** @type {typeof import('./kept-tree.mjs').keptTreeSummary} */
let keptTreeSummary;
const savedCache = process.env.XDG_CACHE_HOME;

beforeAll(async () => {
  TEMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-kept-tree-test-'));
  // The store folder is read once per process, so it is set before the
  // module loads.
  process.env.XDG_CACHE_HOME = path.join(TEMP_ROOT, 'cache');
  ({keptTreeSummary} = await import('./kept-tree.mjs'));
});

afterAll(() => {
  if (savedCache === undefined) delete process.env.XDG_CACHE_HOME;
  else process.env.XDG_CACHE_HOME = savedCache;
  fs.rmSync(TEMP_ROOT, {recursive: true, force: true});
});

/** @param {number} ms */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
