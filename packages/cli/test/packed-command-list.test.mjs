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
import {commandListText} from '../scripts/generate-command-list.mjs';

const STORE = 'clients/cli/commands.generated.json';
const SANDBOX = path.resolve(CLI_ROOT, '..', '..', 'apps', 'sandbox');

/** @type {string} */
let work;
/** @type {string} */
let packed;

beforeAll(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'packed-commands-'));
  // The tarball as `pnpm publish` makes it, with the prepack step that
  // writes the list run on its own (the rest of prepack emits types).
  const wrote = !fs.existsSync(path.join(CLI_ROOT, STORE));
  fs.writeFileSync(path.join(CLI_ROOT, STORE), await commandListText());
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
 * Run a CLI's root help, listing the command modules it loads.
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
  if (url.includes('/clients/cli/commands/')) fs.appendFileSync(process.env.LOAD_LOG, url + '\\\\n');
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
      cwd: SANDBOX,
      encoding: 'utf8',
      env: {...process.env, LOAD_LOG: log, NO_UPDATE_NOTIFIER: '1'},
    },
  );
  expect(run.status, run.stderr).toBe(0);
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
    expect(fs.existsSync(path.join(packed, STORE))).toBe(true);
  });

  it('prints the same root help without loading a command', () => {
    for (const arg of ['--help', '-h', 'help']) {
      const fromTarball = rootHelp(packed, arg);
      const fromCheckout = rootHelp(CLI_ROOT, arg);
      expect(fromCheckout.commands.length, arg).toBeGreaterThan(10);
      expect(fromTarball.commands, arg).toEqual([]);
      expect(fromTarball.stdout, arg).toBe(fromCheckout.stdout);
    }
  });
});
