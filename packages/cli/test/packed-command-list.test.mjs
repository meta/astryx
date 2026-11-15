// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The published package prints its root help from the command list `prepack`
 * stores: the package script writes it, the packed tarball ships it, and the
 * CLI run from that tarball prints the same help without loading a command.
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

const STORE = 'clients/cli/commands.generated.json';
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
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'packed-commands-'));
  // The run's packed CLI, as `pnpm publish` makes it, placed with its
  // dependencies as an install would.
  packed = placeCli(path.join(work, 'cli'), VERSION).dir;
  outside = fs.mkdtempSync(path.join(os.tmpdir(), 'packed-commands-run-'));
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
 * Run a CLI's root help, listing the command modules it loads (a command's
 * doc file is not a command module: the manifest's is read by every run).
 * @param {string} cliRoot
 * @param {string} arg
 * @returns {{stdout: string, commands: string[]}}
 */
function rootHelp(cliRoot, arg) {
  const log = path.join(work, `loads-${path.basename(cliRoot)}-${arg}.txt`);
  fs.writeFileSync(log, '');
  const hook = `data:text/javascript,${encodeURIComponent(`
import {register} from 'node:module';
register('data:text/javascript,' + encodeURIComponent(\`
import fs from 'node:fs';
export async function load(url, context, next) {
  if (url.includes('/clients/cli/commands/') && !url.endsWith('.doc.mjs')) fs.appendFileSync(process.env.LOAD_LOG, url + '\\\\n');
  return next(url, context);
}\`));
`)}`;
  const run = spawnSync(
    process.execPath,
    [
      '--import',
      hook,
      path.join(cliRoot, 'clients', 'cli', 'bin', 'astryx.mjs'),
      arg,
    ],
    {
      cwd: outside,
      encoding: 'utf8',
      env: {...process.env, LOAD_LOG: log, NO_UPDATE_NOTIFIER: '1'},
    },
  );
  expect(run.status, run.stderr).toBe(0);
  // The copy run answered, not one it handed off to.
  expect(run.stderr).not.toContain('handed over');
  return {
    stdout: run.stdout,
    commands: fs.readFileSync(log, 'utf8').split('\n').filter(Boolean),
  };
}

describe('the packed package', () => {
  it('writes the list in prepack', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8'),
    );
    expect(pkg.scripts.prepack).toContain('scripts/generate-command-list.mjs');
  });

  it('ships the list', () => {
    expect(tarballFiles(cliTarball())).toContain(STORE);
  });

  it('removes the list from the checkout after packing', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8'),
    );
    expect(pkg.scripts.postpack).toContain(
      'node scripts/generate-command-list.mjs --clean',
    );
  });

  it('prints the same root help without loading a command', () => {
    // The checkout without a list, as it is after `postpack`: one a local
    // pack or publish left behind is moved aside for these runs.
    const store = path.join(CLI_ROOT, STORE);
    const aside = `${store}.aside-${process.pid}`;
    const moved = fs.existsSync(store);
    if (moved) fs.renameSync(store, aside);
    try {
      for (const arg of ['--help', '-h', 'help']) {
        const fromTarball = rootHelp(packed, arg);
        const fromCheckout = rootHelp(CLI_ROOT, arg);
        expect(fromCheckout.commands.length, arg).toBeGreaterThan(10);
        expect(fromTarball.commands, arg).toEqual([]);
        expect(fromTarball.stdout, arg).toBe(fromCheckout.stdout);
      }
    } finally {
      if (moved) fs.renameSync(aside, store);
    }
  });
});
