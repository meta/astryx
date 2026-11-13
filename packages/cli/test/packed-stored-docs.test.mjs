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
import {
  cliTarball,
  placeCli,
  recyclePlacedCopies,
  tarballFiles,
} from '../test-utils/global-local-fixtures.mjs';

const STORE = 'assets/docs.generated.json';
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
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'packed-docs-'));
  // The run's packed CLI, as `pnpm publish` makes it, placed with its
  // dependencies as an install would.
  packed = placeCli(path.join(work, 'cli'), VERSION).dir;
  outside = fs.mkdtempSync(path.join(os.tmpdir(), 'packed-docs-run-'));
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
      cwd: outside,
      encoding: 'utf8',
      env: {...process.env, IMPORT_LOG: log, NO_UPDATE_NOTIFIER: '1'},
    },
  );
  expect(run.status, run.stderr).toBe(0);
  // The copy run answered, not one it handed off to.
  expect(JSON.parse(run.stdout).meta.answeredBy.copy).not.toBe('project');
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
    expect(tarballFiles(cliTarball())).toContain(STORE);
  });

  it('removes the store from the checkout after packing', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8'),
    );
    expect(pkg.scripts.postpack).toContain(
      'node scripts/generate-stored-docs.mjs --clean',
    );
  });

  it('imports no stored doc, with the same answer', () => {
    const fromTarball = docsListingImports(packed);
    // The checkout without a store, as it is after `postpack`: one a local
    // pack or publish left behind is moved aside for this run.
    const store = path.join(CLI_ROOT, STORE);
    const aside = `${store}.aside-${process.pid}`;
    const moved = fs.existsSync(store);
    if (moved) fs.renameSync(store, aside);
    let fromCheckout;
    try {
      fromCheckout = docsListingImports(CLI_ROOT);
    } finally {
      if (moved) fs.renameSync(aside, store);
    }
    expect(fromCheckout.imported.length).toBeGreaterThan(50);
    expect(fromTarball.imported.length).toBeLessThan(5);
    expect(fromTarball.stdout.split(packed).join(CLI_ROOT)).toBe(
      fromCheckout.stdout,
    );
  });

  it.each([
    [
      'cut short',
      (/** @type {Buffer} */ bytes) =>
        bytes.subarray(0, bytes.indexOf(0x0a) + 1 + 100),
    ],
    [
      'with an entry of the wrong shape',
      (/** @type {Buffer} */ bytes) => {
        const end = bytes.indexOf(0x0a);
        const ranges = JSON.parse(bytes.toString('utf8', 0, end));
        for (const key of Object.keys(ranges)) {
          if (key.startsWith('descriptor:')) ranges[key] = 7;
        }
        return Buffer.concat([
          Buffer.from(JSON.stringify(ranges)),
          bytes.subarray(end),
        ]);
      },
    ],
    [
      'whose entries hold a value of the wrong kind',
      (/** @type {Buffer} */ bytes) => {
        const end = bytes.indexOf(0x0a);
        const ranges = JSON.parse(bytes.toString('utf8', 0, end));
        const data = bytes.subarray(end + 1);
        // A number appended after the values, which every descriptor
        // entry now names.
        for (const key of Object.keys(ranges)) {
          if (key.startsWith('descriptor:')) ranges[key] = [data.length, 1];
        }
        return Buffer.concat([
          Buffer.from(JSON.stringify(ranges) + '\n'),
          data,
          Buffer.from('5'),
        ]);
      },
    ],
  ])('answers theme list as before with a store %s', (_, damage) => {
    const store = path.join(packed, STORE);
    /** @param {string} cliRoot */
    const themeList = cliRoot =>
      spawnSync(
        process.execPath,
        [
          path.join(cliRoot, 'clients', 'cli', 'bin', 'astryx.mjs'),
          'theme',
          'list',
          '--json',
        ],
        {
          cwd: outside,
          encoding: 'utf8',
          env: {...process.env, NO_UPDATE_NOTIFIER: '1'},
        },
      );
    const sound = themeList(packed);
    expect(sound.status, sound.stderr).toBe(0);
    const bytes = fs.readFileSync(store);
    // Every placed copy shares the store's file: unlink this copy's before
    // writing its own, as placeCli does for package.json.
    fs.rmSync(store);
    fs.writeFileSync(store, damage(bytes));
    try {
      const damaged = themeList(packed);
      expect(damaged.status, damaged.stderr).toBe(0);
      expect(damaged.stdout).toBe(sound.stdout);
    } finally {
      fs.rmSync(store);
      fs.writeFileSync(store, bytes);
    }
  });
});
