// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The packed-CLI project the kept-catalog tests share: a published CLI
 *   installed from the run's tarball, a consumer project with one integration,
 *   and the helpers that run the CLI and read its kept catalogs.
 * @input A test file that calls usePackedCli() before its cases.
 * @output The packed CLI, the project, and the run and catalog helpers.
 * @position Test support for packages/cli/test/packed-gather-cache.*.test.mjs,
 *   split so the Node legs can spread its cases.
 */

import {spawn, spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import nodeModule from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, expect} from 'vitest';
import {REPO_ROOT} from './repo-root.mjs';
import {packPublishedCli} from './pack-published-cli.mjs';
import {runFolder} from './global-local-fixtures.mjs';
export const BUILD_ID = 'clients/cli/build-id.generated.json';

/** @type {string} */
export let work;
/** @type {string} */
export let packed;
/** @type {string} */
export let project;
/** @type {string} */
export let widgets;

/**
 * Write a template doc and its source into the widgets integration.
 * @param {string} id
 * @param {string} description
 */
export function writeTemplate(id, description) {
  const dir = path.join(widgets, 'templates');
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(
    path.join(dir, `${id}.doc.mjs`),
    `export default {type: 'page', name: '${id}', description: '${description}', category: 'Widget - ${id}'};\n`,
  );
  fs.writeFileSync(
    path.join(dir, `${id}.tsx`),
    `import {Card} from '@astryxdesign/core';\nexport default function Page() { return <Card />; }\n`,
  );
}

/**
 * Make a consumer project with one integration, outside the repository (so
 * other tests' files never change what it reads), with the repository's Core
 * linked in.
 * @returns {{dir: string, widgets: string}}
 */
export function makeProject() {
  fs.mkdirSync(path.join(work, 'projects'), {recursive: true});
  const dir = fs.mkdtempSync(path.join(work, 'projects', 'project-'));
  fs.mkdirSync(path.join(dir, 'node_modules', '@astryxdesign'), {
    recursive: true,
  });
  fs.symlinkSync(
    path.join(REPO_ROOT, 'packages', 'core'),
    path.join(dir, 'node_modules', '@astryxdesign', 'core'),
    'dir',
  );
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name: 'consumer'}),
  );
  fs.writeFileSync(
    path.join(dir, 'astryx.config.mjs'),
    `export default { integrations: ['@acme/widgets'] };\n`,
  );
  const pkg = path.join(dir, 'node_modules', '@acme', 'widgets');
  fs.mkdirSync(pkg, {recursive: true});
  fs.writeFileSync(
    path.join(pkg, 'package.json'),
    JSON.stringify({name: '@acme/widgets', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(pkg, 'astryx.integration.mjs'),
    `export default { templates: './templates' };\n`,
  );
  return {dir, widgets: pkg};
}

/** This file's own user config folder (settings and state), in its work folder. */
export const userConfig = () => path.join(work, 'config');

/**
 * Run the packed CLI with `tmp` as the system temp folder.
 * @param {string[]} args
 * @param {{tmp: string, cwd?: string, env?: Record<string, string>, json?: boolean, cli?: string}} options
 */
export function run(
  args,
  {tmp, cwd = project, env = {}, json = true, cli = packed},
) {
  fs.mkdirSync(tmp, {recursive: true});
  const base = {...process.env};
  delete base.CI;
  const result = spawnSync(
    process.execPath,
    [
      path.join(cli, 'clients', 'cli', 'bin', 'astryx.mjs'),
      ...args,
      ...(json ? ['--json'] : []),
    ],
    {
      cwd,
      encoding: 'utf8',
      env: {
        ...base,
        TMPDIR: tmp,
        TMP: tmp,
        TEMP: tmp,
        NO_UPDATE_NOTIFIER: '1',
        // Node's compile cache (bin/astryx.mjs) keeps its own folder in the
        // same temp folder; these runs look only at the catalog's.
        NODE_DISABLE_COMPILE_CACHE: '1',
        // The kept catalogs live in the user's cache folder.
        XDG_CACHE_HOME: tmp,
        // A gather reads the user's settings and state files: they are this
        // file's own, never the run's shared folder, where every other
        // test's CLI run records its notices (a kept catalog would miss).
        XDG_CONFIG_HOME: userConfig(),
        ...env,
      },
    },
  );
  return {status: result.status, stdout: result.stdout, stderr: result.stderr};
}

/**
 * run(), without blocking: the kept and the fresh runs of a query go side by
 * side.
 * @param {string[]} args
 * @param {{tmp: string, cwd?: string, env?: Record<string, string>, json?: boolean}} options
 * @returns {Promise<{status: number | null, stdout: string, stderr: string}>}
 */
export function runAsync(args, {tmp, cwd = project, env = {}, json = true}) {
  fs.mkdirSync(tmp, {recursive: true});
  const base = {...process.env};
  delete base.CI;
  return new Promise(resolve => {
    const child = spawn(
      process.execPath,
      [
        path.join(packed, 'clients', 'cli', 'bin', 'astryx.mjs'),
        ...args,
        ...(json ? ['--json'] : []),
      ],
      {
        cwd,
        env: {
          ...base,
          TMPDIR: tmp,
          TMP: tmp,
          TEMP: tmp,
          NO_UPDATE_NOTIFIER: '1',
          NODE_DISABLE_COMPILE_CACHE: '1',
          XDG_CACHE_HOME: tmp,
          XDG_CONFIG_HOME: userConfig(),
          ...env,
        },
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', d => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', d => (stderr += d));
    child.on('close', status => resolve({status, stdout, stderr}));
  });
}

/** The kept catalogs' folder in a user cache folder (XDG_CACHE_HOME). */
export const CACHE_NAME = path.join('astryx', 'catalogs');

/**
 * A temp folder whose cache folder exists, as after a machine's first search
 * or build, so runs keep and use catalogs.
 * @param {string} name
 * @returns {string}
 */
export function keptTmp(name) {
  const tmp = path.join(work, 'tmp', name);
  fs.mkdirSync(path.join(tmp, CACHE_NAME), {recursive: true, mode: 0o700});
  fs.chmodSync(path.join(tmp, CACHE_NAME), 0o700);
  // The release cache beside it, as any earlier run leaves it: a run's
  // background release check makes it, and the gather looks it up.
  fs.mkdirSync(path.join(tmp, 'astryx', 'releases'), {recursive: true});
  return tmp;
}

/** A temp folder no run has used: a fresh gather. */
let fresh = 0;
export const freshTmp = () => path.join(work, 'tmp', `fresh-${fresh++}`);

/**
 * @param {string} file
 * @returns {boolean} whether a cache file holds a derived value
 */
export function derivedEntry(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).derived === true;
  } catch {
    return false;
  }
}

/**
 * Whether a kept file holds an integration's contribution-check results (a
 * list), not a catalog.
 * @param {string} file
 * @returns {boolean}
 */
export function issuesEntry(file) {
  try {
    const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
    return entry.derived !== true && Array.isArray(entry.value);
  } catch {
    return false;
  }
}

/**
 * doctor's kept docs checks in a temp folder's cache folder, by check id.
 * @param {string} tmp
 * @returns {Map<string, number>} check id to inode
 */
export function doctorEntries(tmp) {
  const dir = path.join(tmp, CACHE_NAME);
  /** @type {Map<string, number>} */
  const out = new Map();
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    try {
      const {value} = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (value && typeof value.id === 'string' && 'label' in value) {
        out.set(value.id, fs.statSync(file).ino);
      }
    } catch {
      // Not a kept check.
    }
  }
  return out;
}

/**
 * The integrations' kept contribution-check results in a temp folder's cache
 * folder.
 * @param {string} tmp
 * @returns {Map<string, number>} name to inode
 */
export function issuesEntries(tmp) {
  const dir = path.join(tmp, CACHE_NAME);
  /** @type {Map<string, number>} */
  const out = new Map();
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    if (issuesEntry(file)) out.set(name, fs.statSync(file).ino);
  }
  return out;
}

/**
 * The derived values kept in a temp folder's cache folder.
 * @param {string} tmp
 * @returns {string[]}
 */
export function derivedEntries(tmp) {
  const dir = path.join(tmp, CACHE_NAME);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(name => derivedEntry(path.join(dir, name)));
}

/**
 * Whether a kept file holds template discovery's records, not a catalog.
 * @param {string} file
 * @returns {boolean}
 */
export function templatesEntry(file) {
  try {
    const {value} = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (
      value != null &&
      !Array.isArray(value) &&
      Array.isArray(value.templates) &&
      Array.isArray(value.errors) &&
      Object.keys(value).length === 2
    );
  } catch {
    return false;
  }
}

/**
 * The kept template discovery records in a temp folder's cache folder.
 * @param {string} tmp
 * @returns {Map<string, number>} name to inode
 */
export function templatesEntries(tmp) {
  const dir = path.join(tmp, CACHE_NAME);
  /** @type {Map<string, number>} */
  const out = new Map();
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    if (templatesEntry(file)) out.set(name, fs.statSync(file).ino);
  }
  return out;
}

/**
 * The kept catalogs in a temp folder's cache: each file's inode and time
 * (a value derived from a catalog, search's entry table, is not a catalog).
 * @param {string} tmp
 * @returns {Map<string, {ino: number, mtimeMs: number}>}
 */
export function entries(tmp) {
  const dir = path.join(tmp, CACHE_NAME);
  /** @type {Map<string, {ino: number, mtimeMs: number}>} */
  const out = new Map();
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    if (derivedEntry(file) || issuesEntry(file) || templatesEntry(file))
      continue;
    const {ino, mtimeMs} = fs.statSync(file);
    out.set(name, {ino, mtimeMs});
  }
  return out;
}

export const QUERIES = [
  ['search', 'running totals'],
  // Build reads the same kept catalog: a hit after the search's miss.
  ['build', 'a ledger page with totals'],
];

/**
 * Every query's answer, from the kept folder `tmp` and from a fresh one.
 * @param {string} tmp
 * @param {{cwd?: string, env?: Record<string, string>}} [options]
 * @returns {Promise<('hit' | 'miss')[]>}
 */
export async function expectSameAsFresh(tmp, options = {}) {
  /** @type {('hit' | 'miss')[]} */
  const outcomes = [];
  for (const args of QUERIES) {
    const before = entries(tmp);
    const [kept, gathered] = await Promise.all([
      runAsync(args, {tmp, ...options}),
      runAsync(args, {tmp: freshTmp(), ...options}),
    ]);
    const after = entries(tmp);
    // A hit leaves every entry's file in place; a miss writes one anew.
    outcomes.push(
      before.size > 0 &&
        [...after].every(([name, {ino}]) => before.get(name)?.ino === ino)
        ? 'hit'
        : 'miss',
    );
    expect(kept.status, args.join(' ')).toBe(0);
    expect(kept, `${args.join(' ')} (${outcomes.at(-1)})`).toEqual(gathered);
  }
  return outcomes;
}

// The CLI keeps a catalog through module.registerHooks, which Node has from
// 22.15 and 23.5. On an older Node the CLI supports (its oldest is 22.13), it
// keeps none and gathers fresh each run. The cases that need a kept catalog or
// kept check results skip there, and packed-gather-cache.records.test.mjs
// proves the fresh gather.
export const hasModuleHooks =
  typeof (/** @type {any} */ (nodeModule).registerHooks) === 'function';

/** Packs and installs the CLI and makes the project before this file's cases. */
export function usePackedCli() {
  beforeAll(() => {
    // The global teardown removes the packed trees outside per-file hook limits.
    work = fs.mkdtempSync(
      path.join(runFolder() ?? os.tmpdir(), 'packed-gather-cache-'),
    );
    packed = packPublishedCli(work);
    // What `prepack` writes for a published package.
    fs.writeFileSync(
      path.join(packed, BUILD_ID),
      JSON.stringify({id: 'first'}) + '\n',
    );
    ({dir: project, widgets} = makeProject());
    writeTemplate('ledger', 'Entries as rows with running totals.');
    writeTemplate('roster', 'People as rows with role and team.');
    // A machine's first run writes the user's settings file, which a gather
    // reads: that first change is made here, before any catalog is kept.
    run(QUERIES[0], {tmp: path.join(work, 'tmp', 'first-run')});
  }, 120_000);

  afterAll(() => {
    if (work && !runFolder()) fs.rmSync(work, {recursive: true, force: true});
  });
}
