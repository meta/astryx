// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A value kept by its key and the CLI build alone (persistedValue), as
 * a stored doc's parse is. It is kept only in a run that keeps catalogs and
 * read back as the text that was checked, key order included. It is missed
 * when its entry was changed, under another CLI build, and for a value that
 * does not read back exactly. A computation that throws keeps nothing, so it
 * throws the same way on every run. The store is used only by an installed
 * CLI with a build id, so the CLI's root is an installed-looking folder.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {readKept, writeKept} from '../../test-utils/kept-entry.mjs';
import {hasModuleHooks} from '../../test-utils/module-hooks.mjs';
import * as fs from 'node:fs';
import * as path from 'node:path';

const {TEMP_ROOT} = await vi.hoisted(async () => {
  const nodeFs = await import('node:fs');
  const nodeOs = await import('node:os');
  const nodePath = await import('node:path');
  return {
    TEMP_ROOT: nodeFs.mkdtempSync(
      nodePath.join(nodeOs.tmpdir(), 'astryx-gather-value-test-'),
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
const BUILD_ID = path.join(
  FAKE_CLI_ROOT,
  'clients',
  'cli',
  'build-id.generated.json',
);

const identity = {
  encode: (/** @type {any} */ value) => value,
  decode: (/** @type {any} */ value) => value,
};

beforeAll(async () => {
  fs.mkdirSync(path.dirname(BUILD_ID), {recursive: true});
  fs.writeFileSync(BUILD_ID, JSON.stringify({id: 'gather-value-test'}));
  process.env.XDG_CACHE_HOME = path.join(TEMP_ROOT, 'cache');
  // The kept gathers' store: used only once it exists, closed to others.
  fs.mkdirSync(STORE, {recursive: true, mode: 0o700});
  fs.chmodSync(path.join(TEMP_ROOT, 'cache', 'astryx'), 0o700);
  cache = await import('./gather-cache.mjs');
});

afterAll(() => {
  if (savedCache === undefined) delete process.env.XDG_CACHE_HOME;
  else process.env.XDG_CACHE_HOME = savedCache;
  fs.rmSync(TEMP_ROOT, {recursive: true, force: true});
});

/**
 * The entry files of the values kept under `name`.
 * @param {string} name
 * @returns {string[]}
 */
function keptFiles(name) {
  return fs
    .readdirSync(STORE)
    .filter(file => file.startsWith('gather-') && file.endsWith('.json'))
    .map(file => path.join(STORE, file))
    .filter(file => {
      const entry = readKept(file);
      return entry.pure === true && JSON.parse(entry.key).includes(name);
    });
}

/**
 * The value kept under `['value-test', name]`, worked out by `compute` in one
 * run that keeps catalogs.
 * @param {string} name
 * @param {() => unknown} compute
 * @returns {Promise<unknown>}
 */
const keptRun = (name, compute) =>
  cache.recordRun(async () =>
    cache.persistedValue(['value-test', name], compute, identity),
  );

// A run keeps catalogs only through module.registerHooks, which Node has from
// 22.15 and 23.5. On an older Node every value is worked out and nothing is
// kept, so the cases that read a kept value back cannot run there.
describe('a value kept by its key', () => {
  it.skipIf(!hasModuleHooks)(
    'is kept in a run that keeps catalogs, and a later run reads it back without working it out',
    async () => {
      const value = {b: 2, a: [1, 'two', {c: null, d: true}]};
      let made = 0;
      const compute = () => {
        made++;
        return structuredClone(value);
      };
      const first = await keptRun('kept', compute);
      const again = await keptRun('kept', compute);
      expect(made).toBe(1);
      expect(again).toEqual(value);
      // The kept text keeps the value's own key order.
      expect(JSON.stringify(again)).toBe(JSON.stringify(first));
      expect(keptFiles('kept')).toHaveLength(1);
    },
  );

  it('is worked out, and nothing is kept, outside a run that keeps catalogs', () => {
    let made = 0;
    const compute = () => {
      made++;
      return {a: 1};
    };
    cache.persistedValue(['value-test', 'outside'], compute, identity);
    cache.persistedValue(['value-test', 'outside'], compute, identity);
    expect(made).toBe(2);
    expect(keptFiles('outside')).toEqual([]);
  });

  it('keeps nothing for a computation that throws, which throws the same way on the next run', async () => {
    let made = 0;
    const fail = () => {
      made++;
      throw new Error('the doc is invalid');
    };
    await expect(keptRun('throws', fail)).rejects.toThrow('the doc is invalid');
    await expect(keptRun('throws', fail)).rejects.toThrow('the doc is invalid');
    expect(made).toBe(2);
    expect(keptFiles('throws')).toEqual([]);
  });

  it('keeps nothing for a value that does not read back exactly', async () => {
    const odd = {
      'an undefined property': {a: undefined},
      'a date': {when: new Date(0)},
      NaN: {n: Number.NaN},
      'minus zero': {z: -0},
    };
    for (const [name, value] of Object.entries(odd)) {
      let made = 0;
      const compute = () => {
        made++;
        return value;
      };
      await keptRun(name, compute);
      await keptRun(name, compute);
      expect(made, name).toBe(2);
      expect(keptFiles(name), name).toEqual([]);
    }
  });

  it.skipIf(!hasModuleHooks)(
    'is a miss, and is stored over, when its kept value was changed',
    async () => {
      const value = {name: 'Button', props: [{name: 'label'}]};
      let made = 0;
      const compute = () => {
        made++;
        return structuredClone(value);
      };
      await keptRun('changed', compute);
      const [file] = keptFiles('changed');
      const entry = readKept(file);
      entry.value = {name: 'Button', props: []};
      writeKept(file, entry);
      expect(await keptRun('changed', compute)).toEqual(value);
      expect(made).toBe(2);
      expect(readKept(file).value).toEqual(value);
      expect(await keptRun('changed', compute)).toEqual(value);
      expect(made).toBe(2);
    },
  );

  it.skipIf(!hasModuleHooks)('is a miss under another CLI build', async () => {
    let made = 0;
    const compute = () => {
      made++;
      return {build: 'any'};
    };
    await keptRun('build', compute);
    fs.writeFileSync(BUILD_ID, JSON.stringify({id: 'gather-value-test-2'}));
    try {
      await keptRun('build', compute);
      expect(made).toBe(2);
    } finally {
      fs.writeFileSync(BUILD_ID, JSON.stringify({id: 'gather-value-test'}));
    }
    await keptRun('build', compute);
    expect(made).toBe(2);
  });
});
