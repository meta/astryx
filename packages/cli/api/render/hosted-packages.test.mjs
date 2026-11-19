// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A hosted run outside a project renders a page that imports a package
 * the serving root's `package.json` lists, as a host's package set provides
 * it, and still refuses a package the set holds but does not list.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {CLI_ROOT} from '../../foundation/fs/paths.mjs';
import {
  placeCli,
  recyclePlacedCopies,
} from '../../test-utils/global-local-fixtures.mjs';

const VERSION = JSON.parse(
  fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8'),
).version;

const PAGE =
  "import {STAR} from 'acme-icons';\nexport default function Page() {\n  return <p>{STAR}</p>;\n}\n";

/** @type {string} */
let work;
/** A host's package set: the CLI, Core of the same release, and a package for pages. */
/** @type {string} */
let set;
/** @type {string} */
let cli;

beforeAll(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'hosted-packages-'));
  set = path.join(work, 'set');
  const scope = path.join(set, 'node_modules', '@astryxdesign');
  fs.mkdirSync(scope, {recursive: true});
  cli = placeCli(path.join(scope, 'cli'), VERSION).dir;
  fs.symlinkSync(
    path.resolve(CLI_ROOT, '..', 'core'),
    path.join(scope, 'core'),
    'dir',
  );
  const icons = path.join(set, 'node_modules', 'acme-icons');
  fs.mkdirSync(icons, {recursive: true});
  fs.writeFileSync(
    path.join(icons, 'package.json'),
    JSON.stringify({
      name: 'acme-icons',
      version: '1.0.0',
      type: 'module',
      exports: './index.js',
    }),
  );
  fs.writeFileSync(
    path.join(icons, 'index.js'),
    "export const STAR = 'star';\n",
  );
}, 120_000);

afterAll(() => {
  recyclePlacedCopies();
  if (work) fs.rmSync(work, {recursive: true, force: true});
});

/**
 * Write the set's package.json with these dependencies.
 * @param {Record<string, string>} dependencies
 */
function listInSet(dependencies) {
  fs.writeFileSync(
    path.join(set, 'package.json'),
    JSON.stringify({name: 'set', private: true, dependencies}),
  );
}

/**
 * Render {@link PAGE} through the set's host entry, in a new folder outside
 * any project, with a private home and cache and no registry.
 */
function hostedRender() {
  const dir = fs.mkdtempSync(path.join(work, 'page-'));
  fs.writeFileSync(path.join(dir, 'page.jsx'), PAGE);
  const home = fs.mkdtempSync(path.join(work, 'home-'));
  const script = `
const {runHostedCli} = await import(${JSON.stringify(path.join(cli, 'host', 'index.mjs'))});
const {status} = await runHostedCli({
  argv: ['experimental', 'export', 'page.jsx', '--json'],
  cwd: ${JSON.stringify(dir)},
  roots: [${JSON.stringify(set)}],
});
process.exitCode = status;
`;
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      cwd: dir,
      encoding: 'utf-8',
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            ([key]) => !/^(?:npm_|CI$|NO_UPDATE_NOTIFIER$)/iu.test(key),
          ),
        ),
        HOME: home,
        USERPROFILE: home,
        XDG_CACHE_HOME: path.join(home, '.cache'),
        LOCALAPPDATA: path.join(home, '.cache'),
        XDG_CONFIG_HOME: path.join(home, '.config'),
        APPDATA: path.join(home, 'AppData', 'Roaming'),
        NO_COLOR: '1',
        npm_config_registry: 'http://127.0.0.1:9',
      },
      timeout: 120_000,
    },
  );
  return {
    dir,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe('a hosted run outside a project', () => {
  it("renders a page that imports a package the set's package.json lists", () => {
    listInSet({
      '@astryxdesign/cli': VERSION,
      '@astryxdesign/core': VERSION,
      'acme-icons': '1.0.0',
    });

    const run = hostedRender();

    expect(run.status, run.stdout + run.stderr).toBe(0);
    expect(fs.readFileSync(path.join(run.dir, 'page.html'), 'utf8')).toContain(
      'star',
    );
  }, 120_000);

  it('refuses a package the set holds but does not list', () => {
    listInSet({
      '@astryxdesign/cli': VERSION,
      '@astryxdesign/core': VERSION,
    });

    const run = hostedRender();

    expect(run.status).not.toBe(0);
    expect(run.stdout + run.stderr).toContain('acme-icons');
    expect(fs.existsSync(path.join(run.dir, 'page.html'))).toBe(false);
  }, 120_000);
});
