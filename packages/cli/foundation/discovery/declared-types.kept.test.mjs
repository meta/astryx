// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The declared types of a read are kept in the user's cache folder: a
 * second read of unchanged declaration files parses none of them, and an
 * edit to one reads it again. The store is used only by an installed CLI with
 * a build id, so the CLI's root is set to an installed-looking folder with
 * one.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** The time a stamp needs to settle before a summary is stored, plus margin. */
const SETTLE_WAIT_MS = 2200;

const {TEMP_ROOT, parses} = await vi.hoisted(async () => {
  const nodeFs = await import('node:fs');
  const nodeOs = await import('node:os');
  const nodePath = await import('node:path');
  return {
    TEMP_ROOT: nodeFs.mkdtempSync(
      nodePath.join(nodeOs.tmpdir(), 'astryx-declared-types-kept-'),
    ),
    parses: {count: 0},
  };
});

vi.mock('../fs/paths.mjs', async importOriginal => ({
  .../** @type {object} */ (await importOriginal()),
  CLI_ROOT: path.join(TEMP_ROOT, 'node_modules', '@astryxdesign', 'cli'),
}));

vi.mock('../runtime/lazy-dependencies.mjs', async importOriginal => {
  const real = /** @type {any} */ (await importOriginal());
  return {
    ...real,
    babelParser: () => {
      const parser = real.babelParser();
      return {
        ...parser,
        /** @param {any[]} args */
        parse: (...args) => {
          parses.count++;
          return parser.parse(...args);
        },
      };
    },
  };
});

const FAKE_CLI_ROOT = path.join(
  TEMP_ROOT,
  'node_modules',
  '@astryxdesign',
  'cli',
);
const PACKAGE = path.join(TEMP_ROOT, 'pkg');
const STORE = path.join(TEMP_ROOT, 'cache', 'astryx', 'catalogs');
const savedCache = process.env.XDG_CACHE_HOME;

/** @type {typeof import('./declared-types.mjs').declaredTypes} */
let declaredTypes;

beforeAll(async () => {
  fs.mkdirSync(path.join(FAKE_CLI_ROOT, 'clients', 'cli'), {recursive: true});
  fs.writeFileSync(
    path.join(FAKE_CLI_ROOT, 'clients', 'cli', 'build-id.generated.json'),
    JSON.stringify({id: 'declared-types-test'}),
  );
  process.env.XDG_CACHE_HOME = path.join(TEMP_ROOT, 'cache');
  fs.mkdirSync(STORE, {recursive: true, mode: 0o700});
  fs.chmodSync(path.join(TEMP_ROOT, 'cache', 'astryx'), 0o700);
  fs.mkdirSync(path.join(PACKAGE, 'dist'), {recursive: true});
  fs.writeFileSync(
    path.join(PACKAGE, 'package.json'),
    JSON.stringify({
      name: '@acme/ui',
      exports: {'./Thing': {types: './dist/index.d.ts'}},
    }),
  );
  fs.writeFileSync(
    path.join(PACKAGE, 'dist', 'index.d.ts'),
    "export * from './types.js';\n",
  );
  fs.writeFileSync(
    path.join(PACKAGE, 'dist', 'types.d.ts'),
    'export interface ThingOptions { label: string; }\n',
  );
  ({declaredTypes} = await import('./declared-types.mjs'));
});

afterAll(() => {
  if (savedCache === undefined) delete process.env.XDG_CACHE_HOME;
  else process.env.XDG_CACHE_HOME = savedCache;
  fs.rmSync(TEMP_ROOT, {recursive: true, force: true});
});

const read = () =>
  declaredTypes({
    packageDir: PACKAGE,
    packageName: '@acme/ui',
    importSpecifier: '@acme/ui/Thing',
    typeTexts: ['ThingOptions'],
  });

describe('declared types kept between reads', () => {
  it('parses nothing on a second read, and reads an edited file again', async () => {
    await new Promise(resolve => setTimeout(resolve, SETTLE_WAIT_MS));
    const first = read();
    expect(first[0].members).toEqual([
      {name: 'label', type: 'string', optional: false},
    ]);
    expect(parses.count).toBe(2);
    parses.count = 0;
    expect(read()).toEqual(first);
    expect(parses.count).toBe(0);
    fs.writeFileSync(
      path.join(PACKAGE, 'dist', 'types.d.ts'),
      'export interface ThingOptions { label: string; hint?: string; }\n',
    );
    const edited = read();
    expect(parses.count).toBeGreaterThan(0);
    expect(edited[0].members?.map(m => m.name)).toEqual(['label', 'hint']);
  }, 30_000);
});
