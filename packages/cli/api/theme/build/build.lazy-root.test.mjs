// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Verifies that the theme build loads a Core's root entry only on first
 * use, once, and that a root it cannot load gives null. A root that only
 * `import()` can load is named in an error instead.
 */

import {afterAll, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {lazyRootModule} from './build.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-lazy-root-'));

afterAll(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/**
 * Write an ES module into the test folder.
 * @param {string} name
 * @param {string} source
 * @returns {string} its path
 */
function writeModule(name, source) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, source);
  return file;
}

describe('lazyRootModule', () => {
  it('loads the root once, on first use', () => {
    const file = writeModule(
      'root.mjs',
      'globalThis.__astryxLazyRootLoads = (globalThis.__astryxLazyRootLoads ?? 0) + 1;\nexport const Button = () => null;\n',
    );
    const load = lazyRootModule(() => file);
    expect(globalThis.__astryxLazyRootLoads).toBeUndefined();
    expect(typeof load().Button).toBe('function');
    load();
    expect(globalThis.__astryxLazyRootLoads).toBe(1);
  });

  it('gives null for a root that does not load or resolve', () => {
    expect(lazyRootModule(() => path.join(dir, 'missing.mjs'))()).toBeNull();
    expect(lazyRootModule(() => null)()).toBeNull();
    expect(
      lazyRootModule(() => {
        throw new Error('no root entry');
      })(),
    ).toBeNull();
  });

  it('names a root that awaits at its top level', () => {
    const file = writeModule(
      'waits.mjs',
      'await Promise.resolve();\nexport const Button = () => null;\n',
    );
    expect(() => lazyRootModule(() => file)()).toThrow(
      /cannot be loaded with require\(\) \(ERR_REQUIRE_ASYNC_MODULE\)/,
    );
  });

  it('names a root that require() refuses when Node runs without require(esm)', () => {
    const file = writeModule(
      'plain.mjs',
      'export const Button = () => null;\n',
    );
    const build = pathToFileURL(
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'build.mjs'),
    ).href;
    const script =
      `import {lazyRootModule} from ${JSON.stringify(build)};\n` +
      `try { lazyRootModule(() => ${JSON.stringify(file)})(); console.log('loaded'); }\n` +
      'catch (error) { console.log(error.message); }\n';
    const run = spawnSync(
      process.execPath,
      ['--no-experimental-require-module', '--input-type=module', '-e', script],
      {encoding: 'utf8'},
    );
    expect(run.stdout, `status ${run.status}: ${run.stderr}`).toMatch(
      /cannot be loaded with require\(\) \(ERR_REQUIRE_ESM\)/,
    );
  });
});
