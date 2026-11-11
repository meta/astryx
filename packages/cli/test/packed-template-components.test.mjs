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
import {
  cliTarball,
  placeCli,
  recyclePlacedCopies,
  tarballFiles,
} from '../test-utils/global-local-fixtures.mjs';

const STORE = 'assets/templates/components.generated.json';
const VERSION = JSON.parse(
  fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8'),
).version;

/** @type {string} */
let work;
/** @type {string} */
let packed;
/**
 * A project of no CLI of its own, where each CLI answers itself: inside a
 * project with its own CLI (such as apps/sandbox), a run hands off to that
 * copy.
 * @type {string}
 */
let outside;

beforeAll(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'packed-components-'));
  // The run's packed CLI, as `pnpm publish` makes it, placed with its
  // dependencies as an install would.
  packed = placeCli(path.join(work, 'cli'), VERSION).dir;
  outside = fs.mkdtempSync(path.join(os.tmpdir(), 'packed-components-run-'));
  // A consumer project with Core installed and no CLI of its own, so both
  // copies see the same Core and neither hands off.
  fs.writeFileSync(
    path.join(outside, 'package.json'),
    JSON.stringify({name: 'consumer', private: true}),
  );
  fs.mkdirSync(path.join(outside, 'node_modules', '@astryxdesign'), {
    recursive: true,
  });
  fs.symlinkSync(
    path.resolve(CLI_ROOT, '..', 'core'),
    path.join(outside, 'node_modules', '@astryxdesign', 'core'),
    'dir',
  );
}, 120_000);

afterAll(() => {
  recyclePlacedCopies();
  if (work) fs.rmSync(work, {recursive: true, force: true});
  if (outside) fs.rmSync(outside, {recursive: true, force: true});
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
// Only template-source parses count; other readers parse other files.
parser.parse = function (...args) { if (new Error().stack.includes('template-adapter.mjs')) n++; return parse.apply(this, args); };
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
      cwd: outside,
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
  // The copy run answered, not one it handed off to.
  expect(JSON.parse(run.stdout).meta.answeredBy.copy).not.toBe('project');
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
    expect(tarballFiles(cliTarball())).toContain(STORE);
    expect(fs.existsSync(path.join(CLI_ROOT, STORE))).toBe(false);
  });

  it('removes the list from the checkout after packing', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8'),
    );
    expect(pkg.scripts.postpack).toBe(
      'node scripts/generate-template-components.mjs --clean',
    );
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
