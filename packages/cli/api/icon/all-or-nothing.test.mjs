// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every icon authoring write is all or nothing (AST-084 FR13): for each
 * command, a failure injected at each of its file writes in turn leaves
 * every file in the package byte-identical, and the command fails with
 * `ERR_WRITE_FAILED`, never an unknown error.
 */

import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

// Counts the command's file writes, and fails the one numbered `failAt`.
const fault = vi.hoisted(() => ({
  root: /** @type {string | null} */ (null),
  count: 0,
  failAt: 0,
}));

vi.mock('node:fs', async importOriginal => {
  const actual = /** @type {typeof import('node:fs')} */ (
    await importOriginal()
  );
  /**
   * @param {unknown} target a path, or a file descriptor
   */
  const hit = target => {
    if (fault.root == null) return;
    if (
      typeof target === 'string' &&
      !path.resolve(target).startsWith(fault.root)
    ) {
      return;
    }
    fault.count += 1;
    if (fault.count === fault.failAt) {
      fault.root = null;
      throw Object.assign(new Error('EIO: i/o error (injected)'), {
        code: 'EIO',
      });
    }
  };
  /** @type {any} */
  const mocked = {
    ...actual,
    /** @type {typeof actual.writeFileSync} */
    writeFileSync: (file, ...rest) => {
      hit(file);
      return actual.writeFileSync(file, ...rest);
    },
    /** @type {typeof actual.renameSync} */
    renameSync: (from, to) => {
      hit(to);
      return actual.renameSync(from, to);
    },
    /** @type {typeof actual.copyFileSync} */
    copyFileSync: (from, to, mode) => {
      hit(to);
      return actual.copyFileSync(from, to, mode);
    },
  };
  return {...mocked, default: mocked};
});

const fs = await import('node:fs');
const {iconNewSet} = await import('./new-set/new-set.mjs');
const {iconNewDefinition} = await import('./new-definition/new-definition.mjs');
const {iconAdd} = await import('./add/add.mjs');
const {iconMap} = await import('./map/map.mjs');

/** @type {string} */
let tmp;
beforeEach(() => {
  tmp = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-atomic-')),
  );
  fault.root = null;
});
afterEach(() => {
  fault.root = null;
  fs.rmSync(tmp, {recursive: true, force: true});
});

/**
 * An icon-set package `@acme/icons` with an installed library of two icons
 * (and a solid variant module), and a local artwork file.
 * @returns {string}
 */
function makePackage() {
  const dir = fs.mkdtempSync(path.join(tmp, 'pkg-'));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify(
      {
        name: '@acme/icons',
        version: '1.0.0',
        license: 'MIT',
        type: 'module',
        exports: {'.': './index.js'},
        files: ['index.js'],
        dependencies: {'@acme/glyph-library': '^2.0.0'},
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(path.join(dir, 'index.js'), 'export {};\n');
  const lib = path.join(dir, 'node_modules', '@acme', 'glyph-library');
  fs.mkdirSync(lib, {recursive: true});
  fs.writeFileSync(
    path.join(lib, 'package.json'),
    JSON.stringify({
      name: '@acme/glyph-library',
      version: '2.0.0',
      license: 'ISC',
      type: 'module',
      exports: {'.': './index.js', './solid': './solid.js'},
    }),
  );
  fs.writeFileSync(path.join(lib, 'LICENSE'), 'MIT License\n');
  fs.writeFileSync(
    path.join(lib, 'index.js'),
    'export const Bin = props => null;\nexport const Close = props => null;\n',
  );
  fs.writeFileSync(
    path.join(lib, 'solid.js'),
    'export const Bin = props => null;\nexport const Close = props => null;\n',
  );
  fs.mkdirSync(path.join(dir, 'art'));
  fs.writeFileSync(
    path.join(dir, 'art', 'spark.js'),
    'export const Spark = props => null;\n',
  );
  return dir;
}

/**
 * Every file and folder under `dir` (the installed library aside), with its
 * bytes.
 * @param {string} dir
 * @returns {Record<string, string>}
 */
function snapshot(dir) {
  /** @type {Record<string, string>} */
  const found = {};
  /** @param {string} at */
  const walk = at => {
    for (const entry of fs.readdirSync(at, {withFileTypes: true})) {
      const full = path.join(at, entry.name);
      const rel = path.relative(dir, full);
      if (entry.name === 'node_modules') continue;
      if (entry.isDirectory()) {
        found[`${rel}/`] = '';
        walk(full);
      } else {
        found[rel] = fs.readFileSync(full).toString('base64');
      }
    }
  };
  walk(dir);
  return found;
}

const FROM = '@acme/glyph-library';

/**
 * Each command, with what the package holds before it runs.
 * @type {Array<[string, (dir: string) => Promise<unknown>, (dir: string) => Promise<unknown>]>}
 */
const COMMANDS = [
  [
    'new-set --from',
    async () => {},
    dir => iconNewSet('glyphs', {cwd: dir, from: FROM}),
  ],
  [
    'new-set refresh with --display-name and --description',
    dir => iconNewSet('glyphs', {cwd: dir, from: FROM}),
    dir =>
      iconNewSet('glyphs', {
        cwd: dir,
        from: FROM,
        displayName: 'Acme Glyphs',
        description: 'Acme glyphs.',
        variants: 'outline,solid',
      }),
  ],
  [
    'a refresh that first records the source (notices and license)',
    dir => iconNewSet('glyphs', {cwd: dir}),
    dir => iconNewSet('glyphs', {cwd: dir, from: FROM}),
  ],
  [
    'add --new-definition',
    dir => iconNewSet('glyphs', {cwd: dir}),
    dir =>
      iconAdd('Bin', {
        cwd: dir,
        from: FROM,
        newDefinition: 'binIt',
        description: 'Put something in the bin.',
        words: ['bin'],
      }),
  ],
  [
    'add --from ./file',
    dir => iconNewSet('glyphs', {cwd: dir}),
    dir =>
      iconAdd('Spark', {cwd: dir, from: './art/spark.js', definition: 'close'}),
  ],
  [
    'add --variant --all',
    dir =>
      iconNewSet('glyphs', {cwd: dir, from: FROM, variants: 'outline,solid'}),
    dir =>
      iconAdd(undefined, {
        cwd: dir,
        from: `${FROM}/solid`,
        variant: 'solid',
        all: true,
      }),
  ],
  [
    'map',
    dir => iconNewSet('glyphs', {cwd: dir, from: FROM}),
    dir => iconMap('delete', 'bin', {cwd: dir}),
  ],
  [
    'map --pairs',
    dir => iconNewSet('glyphs', {cwd: dir, from: FROM}),
    dir =>
      iconMap(undefined, undefined, {
        cwd: dir,
        pairs: 'delete=bin,check=close',
      }),
  ],
  [
    'new-definition --icon',
    dir => iconNewSet('glyphs', {cwd: dir, from: FROM}),
    dir =>
      iconNewDefinition('binIt', {
        cwd: dir,
        description: 'Put something in the bin.',
        words: ['bin'],
        icon: 'bin',
      }),
  ],
];

describe('every icon authoring write is all or nothing', () => {
  it.each(COMMANDS)(
    '%s: a failure at any write leaves every file as it was',
    async (_, prepare, run) => {
      // A clean run counts the command's writes.
      const counted = makePackage();
      await prepare(counted);
      fault.count = 0;
      fault.failAt = 0;
      fault.root = counted;
      await run(counted);
      fault.root = null;
      const writes = fault.count;
      expect(writes).toBeGreaterThan(0);

      for (let at = 1; at <= writes; at++) {
        const dir = makePackage();
        await prepare(dir);
        const before = snapshot(dir);
        fault.count = 0;
        fault.failAt = at;
        fault.root = dir;
        await expect(
          run(dir),
          `write ${at} of ${writes}`,
        ).rejects.toMatchObject({code: 'ERR_WRITE_FAILED'});
        fault.root = null;
        expect(snapshot(dir), `write ${at} of ${writes}`).toEqual(before);
      }
    },
    60_000,
  );
});
