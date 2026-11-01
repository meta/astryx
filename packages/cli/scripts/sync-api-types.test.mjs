// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Two `sync:api-types` runs at once must not share a temp directory.
 *
 * Two builds on one machine (two checkouts, or two jobs) each run the sync. A
 * shared output directory lets one run's cleanup delete the declarations the
 * other has just emitted, which then fails with "tsc produced nothing". This
 * runs a copy of the script twice in a scratch package whose `typescript` is a
 * stand-in `tsc` that emits a stub declaration per tree, with nothing on PATH
 * (the script runs `tsc` through Node, so it needs no `pnpm` there), and forces
 * the losing order: the second run starts after the first has emitted and
 * before the first reads its output.
 */

import {spawn} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, describe, expect, it} from 'vitest';

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'sync-api-types.mjs',
);
const TREES = ['api', 'authoring', 'foundation'];
const CONFIG_OUT_DIR = JSON.parse(
  fs.readFileSync(
    path.join(path.dirname(SCRIPT), '..', 'tsconfig.api-dts.json'),
    'utf8',
  ),
).compilerOptions.outDir;

/**
 * The stand-in for TypeScript's `tsc` script: `tsc --project <config>
 * [--outDir <dir>]` emits `<outDir>/packages/cli/<tree>/index.d.mts` for each
 * tree, where the output directory is `--outDir` or the config's own. The role
 * in `SYNC_TEST_ROLE` orders the two runs through files in `SYNC_TEST_DIR`.
 */
const FAKE_TSC = `const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const flag = name => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const config = JSON.parse(fs.readFileSync(flag('--project'), 'utf8'));
const outDir = flag('--outDir') ?? config.compilerOptions.outDir;
const sync = process.env.SYNC_TEST_DIR;
const waitFor = name => {
  const deadline = Date.now() + 20000;
  while (!fs.existsSync(path.join(sync, name))) {
    if (Date.now() > deadline) throw new Error('timed out waiting for ' + name);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
};
const emit = () => {
  for (const tree of ${JSON.stringify(TREES)}) {
    const dir = path.join(outDir, 'packages', 'cli', tree);
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'index.d.mts'), 'export {};\\n');
  }
};
if (process.env.SYNC_TEST_ROLE === 'first') {
  emit();
  fs.writeFileSync(path.join(sync, 'first-emitted'), '');
  waitFor('second-compiling');
} else {
  fs.writeFileSync(path.join(sync, 'second-compiling'), '');
  waitFor('first-done');
  emit();
}
`;

/** @type {string[]} */
const scratch = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

/**
 * A scratch CLI package with a copy of the script and a stand-in `typescript`
 * package, and a PATH directory with nothing in it: the script needs no
 * `pnpm` there.
 */
function makeScratchPackage() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-api-types-test-'));
  scratch.push(root);
  const cli = path.join(root, 'packages', 'cli');
  fs.mkdirSync(path.join(cli, 'scripts'), {recursive: true});
  fs.copyFileSync(SCRIPT, path.join(cli, 'scripts', 'sync-api-types.mjs'));
  for (const tree of TREES) {
    fs.mkdirSync(path.join(cli, tree), {recursive: true});
    fs.writeFileSync(path.join(cli, tree, 'index.mjs'), 'export {};\n');
  }
  // The real config's output directory: where a run that does not choose its
  // own emits, the same path for every run.
  fs.writeFileSync(
    path.join(cli, 'tsconfig.api-dts.json'),
    JSON.stringify({compilerOptions: {outDir: CONFIG_OUT_DIR}}),
  );
  const typescript = path.join(cli, 'node_modules', 'typescript');
  fs.mkdirSync(path.join(typescript, 'bin'), {recursive: true});
  fs.writeFileSync(
    path.join(typescript, 'package.json'),
    JSON.stringify({name: 'typescript', bin: {tsc: './bin/tsc'}}),
  );
  fs.writeFileSync(path.join(typescript, 'bin', 'tsc'), FAKE_TSC);
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  const sync = path.join(root, 'sync');
  fs.mkdirSync(sync);
  return {cli, bin, sync};
}

/**
 * @param {{cli: string, bin: string, sync: string}} pkg
 * @param {'first' | 'second'} role
 * @returns {Promise<{code: number | null, output: string}>}
 */
function runSync(pkg, role) {
  return new Promise(resolve => {
    const child = spawn(
      process.execPath,
      [path.join(pkg.cli, 'scripts', 'sync-api-types.mjs')],
      {
        cwd: pkg.cli,
        env: {
          ...process.env,
          PATH: pkg.bin,
          SYNC_TEST_DIR: pkg.sync,
          SYNC_TEST_ROLE: role,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';
    child.stdout.on('data', chunk => (output += chunk));
    child.stderr.on('data', chunk => (output += chunk));
    child.on('close', code => resolve({code, output}));
  });
}

/** @param {string} file */
async function waitForFile(file) {
  const deadline = Date.now() + 20000;
  while (!fs.existsSync(file)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${file}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

describe('sync-api-types', () => {
  it('a run syncs the emitted declarations beside their sources', async () => {
    const pkg = makeScratchPackage();
    fs.writeFileSync(path.join(pkg.sync, 'second-compiling'), '');
    const result = await runSync(pkg, 'first');

    expect(result.code, result.output).toBe(0);
    for (const tree of TREES) {
      expect(
        fs.readFileSync(path.join(pkg.cli, tree, 'index.d.mts'), 'utf8'),
      ).toContain('@generated by scripts/sync-api-types.mjs');
    }
  });

  it('two runs at once each keep their own emitted declarations', async () => {
    const pkg = makeScratchPackage();
    const first = runSync(pkg, 'first');
    await waitForFile(path.join(pkg.sync, 'first-emitted'));
    const second = runSync(pkg, 'second');
    const firstResult = await first;
    fs.writeFileSync(path.join(pkg.sync, 'first-done'), '');
    const secondResult = await second;

    expect(firstResult.code, firstResult.output).toBe(0);
    expect(secondResult.code, secondResult.output).toBe(0);
    for (const tree of TREES) {
      expect(
        fs.readFileSync(path.join(pkg.cli, tree, 'index.d.mts'), 'utf8'),
      ).toContain('@generated by scripts/sync-api-types.mjs');
    }
  }, 60000);
});
