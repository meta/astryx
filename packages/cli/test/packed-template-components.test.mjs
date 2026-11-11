// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The published package reads its shipped templates' components from the list
 * `prepack` stores: the package script writes it, the packed tarball ships it,
 * and the CLI run from that tarball reads it instead of parsing.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {CLI_ROOT} from '../foundation/fs/paths.mjs';

const STORE = 'assets/templates/components.generated.json';
const REPO = path.resolve(CLI_ROOT, '..', '..');
const SANDBOX = path.join(REPO, 'apps', 'sandbox');

/** @type {string} */
let work;
/** @type {string} */
let packed;

beforeAll(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'packed-components-'));
  // The tarball as `pnpm publish` makes it, with the prepack step that
  // writes the list run on its own (the rest of prepack emits types).
  const wrote = !fs.existsSync(path.join(CLI_ROOT, STORE));
  const gen = spawnSync(
    process.execPath,
    ['scripts/generate-template-components.mjs'],
    {cwd: CLI_ROOT, encoding: 'utf8'},
  );
  expect(gen.status, gen.stderr).toBe(0);
  const pack = spawnSync('pnpm', ['pack', '--pack-destination', work], {
    cwd: CLI_ROOT,
    encoding: 'utf8',
    env: {...process.env, npm_config_ignore_scripts: 'true'},
    shell: process.platform === 'win32',
  });
  if (wrote) fs.rmSync(path.join(CLI_ROOT, STORE), {force: true});
  expect(pack.status, pack.stderr).toBe(0);
  const tarball = fs.readdirSync(work).find(f => f.endsWith('.tgz'));
  expect(tarball).toBeDefined();
  const untar = spawnSync('tar', ['-xzf', /** @type {string} */ (tarball)], {
    cwd: work,
    encoding: 'utf8',
  });
  expect(untar.status, untar.stderr).toBe(0);
  packed = path.join(work, 'package');
  // The tarball's dependencies, as an install would place them.
  fs.symlinkSync(
    path.join(CLI_ROOT, 'node_modules'),
    path.join(packed, 'node_modules'),
    'dir',
  );
}, 120_000);

afterAll(() => {
  if (work) fs.rmSync(work, {recursive: true, force: true});
});

/**
 * Run a CLI's `search`, counting template-source parses.
 * @param {string} cliRoot
 * @returns {{stdout: string, parses: number}}
 */
function searchCountingParses(cliRoot) {
  const counter = path.join(work, `parses-${path.basename(cliRoot)}.txt`);
  const preload = path.join(work, 'count-parses.cjs');
  fs.writeFileSync(
    preload,
    `const fs = require('node:fs');
const parser = require(require.resolve('@babel/parser', {paths: [process.env.COUNT_FROM]}));
const parse = parser.parse;
let n = 0;
parser.parse = function (...args) { n++; return parse.apply(this, args); };
process.on('exit', () => fs.writeFileSync(process.env.COUNT_TO, String(n)));
`,
  );
  const run = spawnSync(
    process.execPath,
    [
      '--require',
      preload,
      path.join(cliRoot, 'clients', 'cli', 'bin', 'astryx.mjs'),
      'search',
      'data table with filters',
      '--json',
    ],
    {
      cwd: SANDBOX,
      encoding: 'utf8',
      env: {
        ...process.env,
        COUNT_FROM: cliRoot,
        COUNT_TO: counter,
        NO_UPDATE_NOTIFIER: '1',
      },
    },
  );
  expect(run.status, run.stderr).toBe(0);
  return {stdout: run.stdout, parses: Number(fs.readFileSync(counter, 'utf8'))};
}

describe('the packed package', () => {
  it('writes the list in prepack', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8'),
    );
    expect(pkg.scripts.prepack).toContain(
      'scripts/generate-template-components.mjs',
    );
  });

  it('ships the list', () => {
    expect(fs.existsSync(path.join(packed, STORE))).toBe(true);
  });

  it('reads it instead of parsing, with the same answer', () => {
    const fromTarball = searchCountingParses(packed);
    const fromCheckout = searchCountingParses(CLI_ROOT);
    expect(fromCheckout.parses).toBeGreaterThan(0);
    expect(fromTarball.parses).toBe(0);
    expect(fromTarball.stdout.split(packed).join(CLI_ROOT)).toBe(
      fromCheckout.stdout,
    );
  });
});
