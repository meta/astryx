// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The Core hooks' keywords the not-found hint reads: the first read
 * keeps them in the per-user cache folder, a warm read takes them back
 * without reading a hook doc, an edited, added or removed hook doc shows in
 * the very next read, and a folder that cannot be written gives the same
 * answer. They are kept only by an installed CLI with a build id, so the
 * CLI's root is set to an installed-looking folder with one.
 *
 * @input a stand-in Core with hook docs in src/hooks/ and in a component
 *   folder
 * @output assertions on coreHookKeywords and on its kept entry
 * @position foundation/suggest/ beside the module it tests
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
      nodePath.join(nodeOs.tmpdir(), 'astryx-hook-keywords-'),
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

// Counts the reads of the hook docs.
vi.mock('../discovery/hook-discovery.mjs', async importOriginal => {
  const real = /** @type {any} */ (await importOriginal());
  return {...real, discoverHookKeywords: vi.fn(real.discoverHookKeywords)};
});

/** @type {typeof import('./other-command.mjs').coreHookKeywords} */
let coreHookKeywords;
/** @type {import('vitest').Mock} */
let discoverHookKeywords;
const savedCache = process.env.XDG_CACHE_HOME;
const CACHE = path.join(TEMP_ROOT, 'cache');
const STORE = path.join(CACHE, 'astryx', 'catalogs');
/** A Core folder, outside the repository, whose files keep their stamps. */
const CORE = path.join(TEMP_ROOT, 'core');

/**
 * Write the doc of hook `name` at `rel` (from `src`) with its keywords.
 * @param {string} rel
 * @param {string} name
 * @param {string[]} keywords
 */
function writeHook(rel, name, keywords) {
  const dir = path.join(CORE, 'src', rel);
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(
    path.join(dir, `${name}.doc.mjs`),
    `export default {\n  name: '${name}',\n  keywords: [${keywords.map(k => `'${k}'`).join(', ')}],\n};\n`,
  );
}

beforeAll(async () => {
  fs.mkdirSync(path.join(FAKE_CLI_ROOT, 'clients', 'cli'), {recursive: true});
  fs.writeFileSync(
    path.join(FAKE_CLI_ROOT, 'clients', 'cli', 'build-id.generated.json'),
    JSON.stringify({id: 'hook-keywords-test'}),
  );
  process.env.XDG_CACHE_HOME = CACHE;
  // A run's first kept gather makes the folder; the keywords are kept only
  // in it.
  (await import('../fs/gather-cache.mjs')).makeGatherCacheDir();
  writeHook('hooks', 'useGlimmer', ['twirl strip']);
  writeHook('Plonk', 'usePlonk', ['tap ripple']);
  ({coreHookKeywords} = await import('./other-command.mjs'));
  discoverHookKeywords = /** @type {any} */ (
    (await import('../discovery/hook-discovery.mjs')).discoverHookKeywords
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
 * The kept keywords' entry: its file and inode. A read-back touches the file
 * in place; storing writes a new file over it by a rename, so an unchanged
 * inode means the last read took the keywords back.
 * @returns {{file: string, ino: number}}
 */
const keptKeywords = () => {
  const files = fs
    .readdirSync(STORE)
    .filter(name => name.startsWith('gather-') && name.endsWith('.json'))
    .map(name => path.join(STORE, name))
    .filter(file => {
      const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
      return (
        entry.summary &&
        JSON.stringify(entry.key).includes('core-hook-keywords')
      );
    });
  expect(files).toHaveLength(1);
  return {file: files[0], ino: fs.statSync(files[0]).ino};
};

describe('Core hook keywords', () => {
  it(
    'are kept, and a warm read takes them back without reading a hook doc',
    async () => {
      await sleep(SETTLE_WAIT_MS);
      const expected = [
        {name: 'useGlimmer', keywords: ['twirl strip']},
        {name: 'usePlonk', keywords: ['tap ripple']},
      ];
      expect(await coreHookKeywords(CORE)).toEqual(expected);
      const kept = keptKeywords();
      const reads = discoverHookKeywords.mock.calls.length;
      expect(reads).toBeGreaterThan(0);
      expect(await coreHookKeywords(CORE)).toEqual(expected);
      expect(discoverHookKeywords.mock.calls.length).toBe(reads);
      expect(keptKeywords().ino).toBe(kept.ino);
    },
    SLOW,
  );

  it(
    'show an edited, an added and a removed hook doc in the very next read',
    async () => {
      writeHook('hooks', 'useGlimmer', ['twirl strip', 'spin bar']);
      expect(await coreHookKeywords(CORE)).toContainEqual({
        name: 'useGlimmer',
        keywords: ['twirl strip', 'spin bar'],
      });
      writeHook(path.join('Group', 'Wibble'), 'useWibble', ['wibble box']);
      expect(await coreHookKeywords(CORE)).toContainEqual({
        name: 'useWibble',
        keywords: ['wibble box'],
      });
      fs.rmSync(path.join(CORE, 'src', 'Plonk'), {recursive: true});
      expect(
        (await coreHookKeywords(CORE)).map(hook => hook.name),
      ).not.toContain('usePlonk');
    },
    SLOW,
  );

  it(
    'give the same answer when the cache folder cannot be written',
    async () => {
      fs.rmSync(STORE, {recursive: true, force: true});
      fs.mkdirSync(STORE, {recursive: true, mode: 0o500});
      writeHook('hooks', 'useGlimmer', ['glow strip']);
      expect(await coreHookKeywords(CORE)).toEqual([
        {name: 'useGlimmer', keywords: ['glow strip']},
        {name: 'useWibble', keywords: ['wibble box']},
      ]);
      expect(fs.readdirSync(STORE)).toEqual([]);
    },
    SLOW,
  );
});
