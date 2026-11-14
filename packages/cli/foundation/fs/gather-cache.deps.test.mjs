// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A kept entry that builds on another is used only while that entry
 * still holds, and a run checks each entry once. The record of the entries a
 * run found unchanged ends with the run, so a process that runs again checks
 * them again. Entries live in the kept gathers' store, which only an
 * installed CLI with a build id uses, so the CLI's root is set to an
 * installed-looking folder with one.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import nodeModule from 'node:module';
import * as path from 'node:path';

const {TEMP_ROOT} = await vi.hoisted(async () => {
  const nodeFs = await import('node:fs');
  const nodeOs = await import('node:os');
  const nodePath = await import('node:path');
  return {
    TEMP_ROOT: nodeFs.mkdtempSync(
      nodePath.join(nodeOs.tmpdir(), 'astryx-gather-deps-test-'),
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

/** @type {typeof import('./gather-cache.mjs')} */
let cache;
const savedCache = process.env.XDG_CACHE_HOME;
const STORE = path.join(TEMP_ROOT, 'cache', 'astryx', 'catalogs');
// Under the CLI's root, so its files count as the CLI's own, which a value
// derived from a kept gather keys on.
const DATA = path.join(FAKE_CLI_ROOT, 'data');

const identity = {
  encode: (/** @type {any} */ value) => value,
  decode: (/** @type {any} */ value) => value,
};

const hasModuleHooks =
  typeof (/** @type {any} */ (nodeModule).registerHooks) === 'function';

beforeAll(async () => {
  fs.mkdirSync(path.join(FAKE_CLI_ROOT, 'clients', 'cli'), {recursive: true});
  fs.writeFileSync(
    path.join(FAKE_CLI_ROOT, 'clients', 'cli', 'build-id.generated.json'),
    JSON.stringify({id: 'gather-deps-test'}),
  );
  process.env.XDG_CACHE_HOME = path.join(TEMP_ROOT, 'cache');
  // The kept gathers' store: used only once it exists, closed to others.
  fs.mkdirSync(STORE, {recursive: true, mode: 0o700});
  fs.chmodSync(path.join(TEMP_ROOT, 'cache', 'astryx'), 0o700);
  fs.mkdirSync(DATA, {recursive: true});
  cache = await import('./gather-cache.mjs');
});

afterAll(() => {
  if (savedCache === undefined) delete process.env.XDG_CACHE_HOME;
  else process.env.XDG_CACHE_HOME = savedCache;
  fs.rmSync(TEMP_ROOT, {recursive: true, force: true});
});

/**
 * @param {string} name
 * @param {string} text
 */
const write = (name, text) => fs.writeFileSync(path.join(DATA, name), text);

/** @param {string} name */
const read = name => fs.readFileSync(path.join(DATA, name), 'utf8');

/**
 * Every kept entry in the store, by the two parts of its gather's key
 * (`group/name`), with its file.
 */
function entries() {
  /** @type {Map<string, {file: string, deps: [string, string][], stamps: [string, string][]}>} */
  const out = new Map();
  for (const name of fs.readdirSync(STORE)) {
    if (!name.startsWith('gather-')) continue;
    const file = path.join(STORE, name);
    const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
    // The gather's key ends the entry's key, before what a host passed.
    const key = JSON.parse(stored.key);
    out.set(`${key.at(-3)}/${key.at(-2)}`, {...stored, file});
  }
  return out;
}

/**
 * One recorded run that asks for the base gather (which reads `base.txt`)
 * and then the outer one (which reads it through the base, and `own.txt`).
 * @returns {Promise<{base: string, outer: string, gathered: string[]}>}
 */
async function runOnce() {
  /** @type {string[]} */
  const gathered = [];
  return cache.recordRun(async () => {
    const base = await cache.persistedGather(
      ['deps-test', 'base'],
      async () => {
        gathered.push('base');
        return read('base.txt');
      },
      identity,
    );
    const outer = await cache.persistedGather(
      ['deps-test', 'outer'],
      async () => {
        gathered.push('outer');
        return `${read('base.txt')}+${read('own.txt')}`;
      },
      identity,
    );
    return {base, outer, gathered};
  });
}

describe.skipIf(!hasModuleHooks || process.platform === 'win32')(
  'kept entries that build on kept entries',
  () => {
    it('stores only its own states, and is gathered again when the entry it builds on changes, in the same process', async () => {
      write('base.txt', 'one');
      write('own.txt', 'own');
      expect(await runOnce()).toEqual({
        base: 'one',
        outer: 'one+own',
        gathered: ['base', 'outer'],
      });
      const kept = entries();
      const outer = kept.get('deps-test/outer');
      expect(outer?.deps).toHaveLength(1);
      // The base file's state is the base entry's; the outer entry stores
      // only the file it alone read.
      const own = (outer?.stamps ?? []).map(([file]) => path.basename(file));
      expect(own).toContain('own.txt');
      expect(own).not.toContain('base.txt');

      // Read back, both.
      expect(await runOnce()).toEqual({
        base: 'one',
        outer: 'one+own',
        gathered: [],
      });

      // The base changes: this process's next run checks both again.
      write('base.txt', 'three');
      expect(await runOnce()).toEqual({
        base: 'three',
        outer: 'three+own',
        gathered: ['base', 'outer'],
      });

      // Only the outer entry's own file changes: only it is gathered again.
      write('own.txt', 'owned');
      expect(await runOnce()).toEqual({
        base: 'three',
        outer: 'three+owned',
        gathered: ['outer'],
      });
    });

    it('is gathered again, then read back, when the entry it builds on is gone', async () => {
      write('base.txt', 'gone-test');
      write('own.txt', 'own');
      await runOnce();
      await runOnce();
      const [baseName] =
        /** @type {[string, string][]} */ (
          entries().get('deps-test/outer')?.deps
        ) ?? [];
      fs.rmSync(path.join(STORE, baseName[0]));
      // Asked for alone, so the base entry is not gathered first.
      const outerAlone = () =>
        cache.recordRun(async () => {
          /** @type {string[]} */
          const gathered = [];
          const value = await cache.persistedGather(
            ['deps-test', 'outer'],
            async () => {
              gathered.push('outer');
              return `${read('base.txt')}+${read('own.txt')}`;
            },
            identity,
          );
          return {value, gathered};
        });
      expect(await outerAlone()).toEqual({
        value: 'gone-test+own',
        gathered: ['outer'],
      });
      expect(await outerAlone()).toEqual({
        value: 'gone-test+own',
        gathered: [],
      });
    });

    it('merges the states two entries it builds on share, so a value derived from the kept gathers is read back', async () => {
      for (const [name, text] of [
        ['a.txt', 'a'],
        ['b.txt', 'bb'],
        ['c.txt', 'ccc'],
        ['d.txt', 'dddd'],
      ]) {
        write(name, text);
      }
      /** @param {string[]} names */
      const readAll = names => names.map(read).join(',');
      /**
       * One recorded run that asks for each named gather in turn, then for a
       * value derived from the last.
       * @param {string[]} names
       */
      const runShared = names =>
        cache.recordRun(async () => {
          /** @type {string[]} */
          const ran = [];
          /** @type {Record<string, string[]>} */
          const files = {
            one: ['a.txt', 'c.txt'],
            two: ['a.txt', 'b.txt'],
            outer: ['a.txt', 'b.txt', 'c.txt', 'd.txt'],
          };
          let last = '';
          for (const name of names) {
            last = await cache.persistedGather(
              ['shared-test', name],
              async () => {
                ran.push(name);
                return readAll(files[name]);
              },
              identity,
            );
          }
          const derived = cache.persistedDerived(
            ['shared-test', 'derived'],
            () => {
              ran.push('derived');
              return last.length;
            },
            identity,
          );
          return {last, derived, ran};
        });
      // Each base kept by a run of its own, so each holds a file the other
      // lacks and both hold `a.txt`.
      await runShared(['one']);
      await runShared(['two']);
      expect(await runShared(['one', 'two', 'outer'])).toEqual({
        last: 'a,bb,ccc,dddd',
        derived: 13,
        ran: ['outer', 'derived'],
      });
      expect(entries().get('shared-test/outer')?.deps).toHaveLength(2);
      // Asked for alone, the outer entry is read back through both bases,
      // and so is the value derived from it.
      expect(await runShared(['outer'])).toEqual({
        last: 'a,bb,ccc,dddd',
        derived: 13,
        ran: [],
      });
    });

    it('marks the entries it builds on as used after it, so eviction removes them after it', async () => {
      write('mark-base.txt', 'used');
      write('mark-own.txt', 'own');
      /** @param {boolean} withBase */
      const runMark = withBase =>
        cache.recordRun(async () => {
          if (withBase) {
            await cache.persistedGather(
              ['mark-test', 'base'],
              async () => read('mark-base.txt'),
              identity,
            );
          }
          return cache.persistedGather(
            ['mark-test', 'outer'],
            async () => `${read('mark-base.txt')}+${read('mark-own.txt')}`,
            identity,
          );
        });
      await runMark(true);
      const kept = entries();
      const base = /** @type {{file: string}} */ (kept.get('mark-test/base'))
        .file;
      const outer = /** @type {{file: string, deps: [string, string][]}} */ (
        kept.get('mark-test/outer')
      );
      expect(outer.deps.map(([name]) => name)).toEqual([path.basename(base)]);
      const mtime = (/** @type {string} */ file) => fs.statSync(file).mtimeMs;
      // Stored: the base is marked as used after the entry built on it.
      expect(mtime(base)).toBeGreaterThan(mtime(outer.file));
      // Dated back, then the outer entry alone is read back: the base is
      // marked as used after it again.
      const past = new Date(Date.now() - 3600_000);
      for (const file of [base, outer.file]) fs.utimesSync(file, past, past);
      await runMark(false);
      expect(mtime(outer.file)).toBeGreaterThan(past.getTime());
      expect(mtime(base)).toBeGreaterThan(mtime(outer.file));
    });
  },
);
