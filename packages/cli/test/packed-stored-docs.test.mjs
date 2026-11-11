// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The published package reads its shipped docs from the exports `prepack`
 * stores: the package script writes them, the packed tarball ships them, and
 * the CLI run from that tarball imports none of the stored docs.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {CLI_ROOT} from '../foundation/fs/paths.mjs';

const STORE = 'assets/docs.generated.json';
const REPO = path.resolve(CLI_ROOT, '..', '..');
const SANDBOX = path.join(REPO, 'apps', 'sandbox');

/** @type {string} */
let work;
/** @type {string} */
let packed;

beforeAll(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'packed-docs-'));
  // The tarball as `pnpm publish` makes it, with the prepack step that
  // writes the store run on its own (the rest of prepack emits types).
  const wrote = !fs.existsSync(path.join(CLI_ROOT, STORE));
  const gen = spawnSync(
    process.execPath,
    ['scripts/generate-stored-docs.mjs'],
    {
      cwd: CLI_ROOT,
      encoding: 'utf8',
    },
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
 * Run a CLI's `docs <topic>`, listing the shipped doc files it imports.
 * @param {string} cliRoot
 * @returns {{stdout: string, imported: string[]}}
 */
function docsListingImports(cliRoot) {
  const log = path.join(work, `imports-${path.basename(cliRoot)}.txt`);
  fs.writeFileSync(log, '');
  const hook = `data:text/javascript,${encodeURIComponent(`
import {register} from 'node:module';
register('data:text/javascript,' + encodeURIComponent(\`
import fs from 'node:fs';
export async function load(url, context, next) {
  if (url.includes('/assets/') && url.includes('.doc.mjs')) fs.appendFileSync(process.env.IMPORT_LOG, url + '\\\\n');
  return next(url, context);
}\`));
`)}`;
  const run = spawnSync(
    process.execPath,
    [
      '--import',
      hook,
      path.join(cliRoot, 'clients', 'cli', 'bin', 'astryx.mjs'),
      'docs',
      'author-a-theme',
      '--json',
    ],
    {
      cwd: SANDBOX,
      encoding: 'utf8',
      env: {...process.env, IMPORT_LOG: log, NO_UPDATE_NOTIFIER: '1'},
    },
  );
  expect(run.status, run.stderr).toBe(0);
  return {
    stdout: run.stdout,
    imported: fs.readFileSync(log, 'utf8').split('\n').filter(Boolean),
  };
}

describe('the packed package', () => {
  it('writes the store in prepack', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8'),
    );
    expect(pkg.scripts.prepack).toContain('scripts/generate-stored-docs.mjs');
  });

  it('ships the store', () => {
    expect(fs.existsSync(path.join(packed, STORE))).toBe(true);
  });

  it('imports no stored doc, with the same answer', () => {
    const fromTarball = docsListingImports(packed);
    const fromCheckout = docsListingImports(CLI_ROOT);
    expect(fromCheckout.imported.length).toBeGreaterThan(50);
    expect(fromTarball.imported.length).toBeLessThan(5);
    expect(fromTarball.stdout.split(packed).join(CLI_ROOT)).toBe(
      fromCheckout.stdout,
    );
  });
});
