// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file bundle-analysis.test.mjs
 * @input buildMap and measure over a temporary dist tree
 * @output The analysis counts what a bundler ships: a component that imports
 *   one module through a barrel costs that module only, the same as importing
 *   it directly, and a set counts the code its components share once
 * @position Unit test of ./bundle-analysis.mjs
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {buildMap, measure} from './bundle-analysis.mjs';

let dist;
let comps;

/** A marker only the barrel's other module holds. */
const UNUSED = 'unused-module-'.repeat(200);

beforeAll(() => {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-bundle-analysis-test-'));
  const write = (relative, content) => {
    const file = path.join(dist, relative);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, content);
  };
  write(
    'lib/a.js',
    "export const used = () => 'the module the components use';\n",
  );
  write('lib/b.js', `export const unused = () => ${JSON.stringify(UNUSED)};\n`);
  write(
    'lib/index.js',
    "export {used} from './a.js';\nexport {unused} from './b.js';\n",
  );
  write(
    'Barrel/index.js',
    "import {used} from '../lib/index.js';\nexport const Barrel = () => used();\n",
  );
  write(
    'Direct/index.js',
    "import {used} from '../lib/a.js';\nexport const Direct = () => used();\n",
  );
  // A directory exporting two components, and one named after none.
  write(
    'Pair/index.js',
    `export const Pair = () => 'pair';\nexport const PairSibling = () => ${JSON.stringify(UNUSED)};\n`,
  );
  write(
    'helpers/index.js',
    `export const one = () => 'one';\nexport const two = () => ${JSON.stringify(UNUSED)};\n`,
  );
  comps = buildMap(dist);
});

afterAll(() => {
  fs.rmSync(dist, {recursive: true, force: true});
});

describe('bundle analysis', () => {
  it('charges a component only the barrel module it imports', () => {
    const {js} = measure(['Barrel'], comps);
    expect(js.raw).toBeGreaterThan(0);
    expect(js.raw).toBeLessThan(UNUSED.length);
    expect(js.files).toBe(2);
  });

  it('charges a barrel import the same as the direct import', () => {
    expect(measure(['Barrel'], comps).js.raw).toBe(
      measure(['Direct'], comps).js.raw,
    );
    expect(comps.Barrel.totalRaw).toBe(comps.Direct.totalRaw);
  });

  it('charges a directory row its same-named export only, as the size report does', () => {
    const {js} = measure(['Pair'], comps);
    expect(js.raw).toBeGreaterThan(0);
    expect(js.raw).toBeLessThan(UNUSED.length);
    // A directory named after none of its exports counts whole.
    expect(measure(['helpers'], comps).js.raw).toBeGreaterThan(UNUSED.length);
  });

  it('counts the code a set shares once', () => {
    const both = measure(['Barrel', 'Direct'], comps).js.raw;
    expect(both).toBeLessThan(comps.Barrel.totalRaw + comps.Direct.totalRaw);
  });
});

describe('bundle analysis as a script', () => {
  const SCRIPT = pathToFileURL(
    path.join(import.meta.dirname, 'bundle-analysis.mjs'),
  ).href;
  /** Import the script in a process whose script path is `argv1`. */
  const importWith = argv1 =>
    spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `process.argv[1] = ${JSON.stringify(argv1)}; await import(${JSON.stringify(SCRIPT)});`,
      ],
      {encoding: 'utf8'},
    );

  it('reads a script path that names nothing on disk as another script', () => {
    const missing = path.join(
      os.tmpdir(),
      'astryx-bundle-analysis-missing.mjs',
    );
    const res = importWith(missing);
    expect({status: res.status, stderr: res.stderr}).toEqual({
      status: 0,
      stderr: '',
    });
  });

  it('throws on a script path it cannot resolve for another reason, rather than read it as another script', () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'astryx-bundle-analysis-argv-'),
    );
    try {
      const loop = path.join(dir, 'loop.mjs');
      fs.symlinkSync('loop.mjs', loop);
      const res = importWith(loop);
      expect(res.status).not.toBe(0);
      expect(res.stderr).toMatch(/ELOOP/);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});
