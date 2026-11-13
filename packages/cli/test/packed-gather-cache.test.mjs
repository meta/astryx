// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A published CLI keeps the catalog `search` and `build` gather between runs
 * (foundation/fs/gather-cache.mjs) and uses it only while nothing it read has
 * changed. Every answer from a kept catalog must equal a fresh gather's:
 * after an edit, an added or removed file, a copy that keeps the time, an
 * upgrade, another project or another environment, and after random changes.
 */

import {COMPONENT_REPLACES_CLI} from '../foundation/integrations/cli-requirement.mjs';
import {spawn, spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {REPO_ROOT} from '../test-utils/repo-root.mjs';
import {packPublishedCli} from '../test-utils/pack-published-cli.mjs';
import {runFolder} from '../test-utils/global-local-fixtures.mjs';

const BUILD_ID = 'clients/cli/build-id.generated.json';

/** @type {string} */
let work;
/** @type {string} */
let packed;
/** @type {string} */
let project;
/** @type {string} */
let widgets;

/**
 * Write a template doc and its source into the widgets integration.
 * @param {string} id
 * @param {string} description
 */
function writeTemplate(id, description) {
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
function makeProject() {
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

/** This file's own user config folder (settings and state), in its work folder. */
const userConfig = () => path.join(work, 'config');

/**
 * Run the packed CLI with `tmp` as the system temp folder.
 * @param {string[]} args
 * @param {{tmp: string, cwd?: string, env?: Record<string, string>, json?: boolean}} options
 */
function run(args, {tmp, cwd = project, env = {}, json = true}) {
  fs.mkdirSync(tmp, {recursive: true});
  const base = {...process.env};
  delete base.CI;
  const result = spawnSync(
    process.execPath,
    [
      path.join(packed, 'clients', 'cli', 'bin', 'astryx.mjs'),
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
function runAsync(args, {tmp, cwd = project, env = {}, json = true}) {
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
const CACHE_NAME = path.join('astryx', 'catalogs');

/**
 * A temp folder whose cache folder exists, as after a machine's first search
 * or build, so runs keep and use catalogs.
 * @param {string} name
 * @returns {string}
 */
function keptTmp(name) {
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
const freshTmp = () => path.join(work, 'tmp', `fresh-${fresh++}`);

/**
 * @param {string} file
 * @returns {boolean} whether a cache file holds a derived value
 */
function derivedEntry(file) {
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
function issuesEntry(file) {
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
function doctorEntries(tmp) {
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
function issuesEntries(tmp) {
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
function derivedEntries(tmp) {
  const dir = path.join(tmp, CACHE_NAME);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(name => derivedEntry(path.join(dir, name)));
}

/**
 * The kept catalogs in a temp folder's cache: each file's inode and time
 * (a value derived from a catalog, search's entry table, is not a catalog).
 * @param {string} tmp
 * @returns {Map<string, {ino: number, mtimeMs: number}>}
 */
function entries(tmp) {
  const dir = path.join(tmp, CACHE_NAME);
  /** @type {Map<string, {ino: number, mtimeMs: number}>} */
  const out = new Map();
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    if (derivedEntry(file) || issuesEntry(file)) continue;
    const {ino, mtimeMs} = fs.statSync(file);
    out.set(name, {ino, mtimeMs});
  }
  return out;
}

const QUERIES = [
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
async function expectSameAsFresh(tmp, options = {}) {
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

describe.skipIf(process.platform !== 'linux')('a kept catalog', () => {
  it('answers as a fresh gather, and is used while nothing changed', async () => {
    const tmp = keptTmp('warm');
    const cold = run(QUERIES[0], {tmp});
    const stored = entries(tmp);
    expect(stored.size).toBe(1);
    const warm = run(QUERIES[0], {tmp});
    const after = entries(tmp);
    expect(warm).toEqual(cold);
    const [[name, before]] = [...stored];
    // A hit reads the entry and touches it; a miss writes a new one.
    expect(after.get(name)?.ino).toBe(before.ino);
    expect(run(QUERIES[0], {tmp: freshTmp()})).toEqual(cold);
    await expectSameAsFresh(tmp);
  }, 120_000);

  it('is not used after an edit, an added or removed file, or a copy that keeps the time', async () => {
    const tmp = keptTmp('stale');
    expect(await expectSameAsFresh(tmp)).toEqual(['miss', 'hit']);
    writeTemplate('ledger', 'Entries as rows with running balances.');
    expect(await expectSameAsFresh(tmp)).toEqual(['miss', 'hit']);
    writeTemplate('kanban', 'Cards in columns with running totals.');
    expect(await expectSameAsFresh(tmp)).toEqual(['miss', 'hit']);
    fs.rmSync(path.join(widgets, 'templates', 'kanban.doc.mjs'));
    expect(await expectSameAsFresh(tmp)).toEqual(['miss', 'hit']);
    // Same size and times, other text: a copy that keeps the time.
    const doc = path.join(widgets, 'templates', 'roster.doc.mjs');
    const {atime, mtime, size} = fs.statSync(doc);
    const text = fs.readFileSync(doc, 'utf8').replace('team', 'crew');
    expect(Buffer.byteLength(text)).toBe(size);
    const copy = `${doc}.copy`;
    fs.writeFileSync(copy, text);
    fs.utimesSync(copy, atime, mtime);
    fs.renameSync(copy, doc);
    expect(await expectSameAsFresh(tmp)).toEqual(['miss', 'hit']);
    writeTemplate('roster', 'People as rows with role and team.');
  }, 300_000);

  it('is not used by another project, another CLI, or another environment', async () => {
    const tmp = keptTmp('other');
    await expectSameAsFresh(tmp);
    const other = makeProject();
    try {
      await expectSameAsFresh(tmp, {cwd: other.dir});
      expect(entries(tmp).size).toBe(2);
    } finally {
      fs.rmSync(other.dir, {recursive: true, force: true});
    }
    fs.writeFileSync(
      path.join(packed, BUILD_ID),
      JSON.stringify({id: 'second'}) + '\n',
    );
    expect((await expectSameAsFresh(tmp))[0]).toBe('miss');
    expect((await expectSameAsFresh(tmp, {env: {CI: '1'}}))[0]).toBe('miss');
  }, 300_000);

  it('is not used after an integration is installed or removed', async () => {
    const tmp = keptTmp('install');
    expect(await expectSameAsFresh(tmp)).toEqual(['miss', 'hit']);
    const extra = path.join(project, 'node_modules', '@acme', 'extra');
    fs.mkdirSync(path.join(extra, 'templates'), {recursive: true});
    fs.writeFileSync(
      path.join(extra, 'package.json'),
      JSON.stringify({name: '@acme/extra', version: '1.0.0'}),
    );
    fs.writeFileSync(
      path.join(extra, 'astryx.integration.mjs'),
      `export default { templates: './templates' };\n`,
    );
    fs.writeFileSync(
      path.join(extra, 'templates', 'totals.doc.mjs'),
      `export default {type: 'page', name: 'totals', description: 'Running totals by team.', category: 'Extra - Totals'};\n`,
    );
    fs.writeFileSync(
      path.join(extra, 'templates', 'totals.tsx'),
      `export default function Page() { return null; }\n`,
    );
    const config = path.join(project, 'astryx.config.mjs');
    fs.writeFileSync(
      config,
      `export default { integrations: ['@acme/widgets', '@acme/extra'] };\n`,
    );
    expect(await expectSameAsFresh(tmp)).toEqual(['miss', 'hit']);
    fs.writeFileSync(
      config,
      `export default { integrations: ['@acme/widgets'] };\n`,
    );
    fs.rmSync(extra, {recursive: true, force: true});
    expect(await expectSameAsFresh(tmp)).toEqual(['miss', 'hit']);
  }, 300_000);

  it('is not used after a change in a folder above the project', async () => {
    const tmp = keptTmp('ancestors');
    const parent = path.dirname(project);
    const config = path.join(project, 'astryx.config.mjs');
    // The project lists an integration it does not install itself.
    fs.writeFileSync(
      config,
      `export default { integrations: ['@acme/widgets', '@acme/far'] };\n`,
    );
    /** @type {string[]} */
    const made = [];
    try {
      await expectSameAsFresh(tmp);
      // A package.json, then a config file, in the folder above.
      for (const [name, text] of [
        ['package.json', JSON.stringify({name: 'parent'})],
        ['astryx.config.mjs', 'export default {};\n'],
      ]) {
        const file = path.join(parent, name);
        fs.writeFileSync(file, text);
        made.push(file);
        await expectSameAsFresh(tmp);
      }
      // A node_modules folder above, then the listed integration in it.
      const far = path.join(parent, 'node_modules', '@acme', 'far');
      made.push(path.join(parent, 'node_modules'));
      fs.mkdirSync(path.join(parent, 'node_modules'));
      await expectSameAsFresh(tmp);
      fs.mkdirSync(path.join(far, 'templates'), {recursive: true});
      fs.writeFileSync(
        path.join(far, 'package.json'),
        JSON.stringify({name: '@acme/far', version: '1.0.0'}),
      );
      fs.writeFileSync(
        path.join(far, 'astryx.integration.mjs'),
        `export default { templates: './templates' };\n`,
      );
      fs.writeFileSync(
        path.join(far, 'templates', 'tally.doc.mjs'),
        `export default {type: 'page', name: 'tally', description: 'Running totals per team, tallied.', category: 'Far - Tally'};\n`,
      );
      fs.writeFileSync(
        path.join(far, 'templates', 'tally.tsx'),
        `export default function Page() { return null; }\n`,
      );
      const before = run(QUERIES[0], {tmp: freshTmp()});
      expect((await expectSameAsFresh(tmp))[0]).toBe('miss');
      expect(run(QUERIES[0], {tmp}).stdout).toBe(before.stdout);
    } finally {
      for (const file of made.reverse()) {
        fs.rmSync(file, {recursive: true, force: true});
      }
      fs.writeFileSync(
        config,
        `export default { integrations: ['@acme/widgets'] };\n`,
      );
    }
  }, 300_000);

  it('answers as a fresh gather after random changes', async () => {
    const tmp = keptTmp('random');
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const ids = ['ledger', 'roster', 'kanban', 'gallery'];
    const words = ['totals', 'team', 'balances', 'crew', 'columns', 'photos'];
    await expectSameAsFresh(tmp);
    for (let step = 0; step < 8; step++) {
      const id = ids[Math.floor(random() * ids.length)];
      const doc = path.join(widgets, 'templates', `${id}.doc.mjs`);
      const op = Math.floor(random() * 4);
      if (op === 0 || !fs.existsSync(doc)) {
        writeTemplate(
          id,
          `Rows with ${words[Math.floor(random() * words.length)]}.`,
        );
      } else if (op === 1) {
        fs.rmSync(doc);
      } else if (op === 2) {
        const now = new Date(Date.now() + 1000 * step);
        fs.utimesSync(doc, now, now);
      } else {
        fs.writeFileSync(
          path.join(widgets, 'astryx.integration.mjs'),
          `export default { templates: './templates' };\n${'//\n'.repeat(step)}`,
        );
      }
      const outcomes = await expectSameAsFresh(tmp);
      expect(outcomes.slice(1)).toEqual(['hit']);
    }
  }, 600_000);

  it('is not kept by the first run, which only makes its folder', () => {
    const tmp = path.join(work, 'tmp', 'first');
    const first = run(QUERIES[0], {tmp});
    expect(fs.readdirSync(path.join(tmp, 'astryx'))).toContain('catalogs');
    expect(fs.statSync(path.join(tmp, CACHE_NAME)).mode & 0o777).toBe(0o700);
    expect(fs.readdirSync(path.join(tmp, CACHE_NAME))).toEqual([]);
    expect(first).toEqual(run(QUERIES[0], {tmp: freshTmp()}));
    run(QUERIES[0], {tmp});
    expect(entries(tmp).size).toBe(1);
  }, 120_000);

  it("is used once a TypeScript integration's first load filled the transpile cache", () => {
    const tmp = keptTmp('typescript');
    const other = makeProject();
    try {
      // The integration's manifest in TypeScript, importing a helper: jiti
      // compiles both on the first load and writes them to its cache in the
      // per-user cache folder, beside the catalogs.
      fs.rmSync(path.join(other.widgets, 'astryx.integration.mjs'));
      fs.writeFileSync(
        path.join(other.widgets, 'helper.ts'),
        `export const root: string = './templates';\n`,
      );
      fs.writeFileSync(
        path.join(other.widgets, 'astryx.integration.ts'),
        `import {root} from './helper';\nconst integration: {templates: string} = {templates: root};\nexport default integration;\n`,
      );
      const outcomes = [];
      const fresh = run(QUERIES[0], {tmp: freshTmp(), cwd: other.dir});
      for (let i = 0; i < 3; i++) {
        const before = entries(tmp);
        expect(run(QUERIES[0], {tmp, cwd: other.dir})).toEqual(fresh);
        const after = entries(tmp);
        const [name] = [...after.keys()];
        outcomes.push(
          before.get(name)?.ino === after.get(name)?.ino ? 'hit' : 'miss',
        );
      }
      expect(fs.readdirSync(path.join(tmp, 'astryx', 'jiti')).length).toBe(2);
      expect(outcomes).toEqual(['miss', 'hit', 'hit']);
    } finally {
      fs.rmSync(other.dir, {recursive: true, force: true});
    }
  }, 120_000);

  it("installs no module hook unless it keeps a catalog, and keeps none under Plug'n'Play", () => {
    // A resolver as strict as Yarn PnP's: it refuses the options Node's module
    // hooks hand it, so any hook installed by the run breaks a require.
    const strict = path.join(work, 'strict-resolver.cjs');
    fs.writeFileSync(
      strict,
      `const Module = require('node:module');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (options && options.conditions) throw new Error('resolver options are not supported');
  return resolve.call(this, request, parent, isMain, options);
};
if (process.env.AS_PNP) process.versions.pnp = '3';
`,
    );
    const strictEnv = {NODE_OPTIONS: `--require ${strict}`};
    // A CJS require the gather makes, through the strict resolver.
    const fresh = run(QUERIES[0], {tmp: freshTmp()});
    // Folder refused (open to others): no hook, the same answer.
    const refused = path.join(work, 'tmp', 'refused');
    fs.mkdirSync(path.join(refused, CACHE_NAME), {recursive: true});
    fs.chmodSync(path.join(refused, CACHE_NAME), 0o755);
    expect(run(QUERIES[0], {tmp: refused, env: strictEnv})).toEqual(fresh);
    expect(entries(refused).size).toBe(0);

    expect(derivedEntries(refused)).toEqual([]);
    // Plug'n'Play with a usable folder: no hook, no catalog, the same answer.
    const pnp = keptTmp('pnp');
    const asPnp = {...strictEnv, AS_PNP: '1'};
    expect(run(QUERIES[0], {tmp: pnp, env: asPnp})).toEqual(fresh);
    expect(run(QUERIES[0], {tmp: pnp, env: asPnp})).toEqual(fresh);
    expect(entries(pnp).size).toBe(0);
    expect(derivedEntries(pnp)).toEqual([]);
    // Nor does it read one a plain run kept: an entry whose value is altered,
    // so a read would show, gives the fresh answer under Plug'n'Play.
    const kept = keptTmp('pnp-read');
    run(QUERIES[0], {tmp: kept});
    const [name] = [...entries(kept).keys()];
    const file = path.join(kept, CACHE_NAME, name);
    const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
    entry.value.all = [];
    fs.writeFileSync(file, JSON.stringify(entry));
    expect(run(QUERIES[0], {tmp: kept}).stdout).not.toBe(fresh.stdout);
    expect(run(QUERIES[0], {tmp: kept, env: asPnp})).toEqual(fresh);
  }, 120_000);

  it("is not used when another entry is copied over this one's name", () => {
    const tmp = keptTmp('copied');
    const other = makeProject();
    try {
      fs.mkdirSync(path.join(other.widgets, 'templates'), {recursive: true});
      fs.writeFileSync(
        path.join(other.widgets, 'templates', 'tally.doc.mjs'),
        `export default {type: 'page', name: 'tally', description: 'Running totals, tallied by team.', category: 'Widget - Tally'};\n`,
      );
      fs.writeFileSync(
        path.join(other.widgets, 'templates', 'tally.tsx'),
        `export default function Page() { return null; }\n`,
      );
      run(QUERIES[0], {tmp, cwd: project});
      const [mine] = [...entries(tmp).keys()];
      run(QUERIES[0], {tmp, cwd: other.dir});
      const [theirs] = [...entries(tmp).keys()].filter(name => name !== mine);
      const dir = path.join(tmp, CACHE_NAME);
      fs.copyFileSync(path.join(dir, theirs), path.join(dir, mine));
      // Only the other project has the tally template.
      const ask = ['search', 'tally'];
      const fresh = run(ask, {tmp: freshTmp(), cwd: project});
      expect(run(ask, {tmp: freshTmp(), cwd: other.dir}).stdout).not.toBe(
        fresh.stdout,
      );
      expect(run(ask, {tmp, cwd: project})).toEqual(fresh);
    } finally {
      fs.rmSync(other.dir, {recursive: true, force: true});
    }
  }, 120_000);

  it("is listed by doctor, with the runs under Plug'n'Play that keep none", () => {
    const tmp = keptTmp('doctor');
    /** @param {Record<string, string>} [env] */
    const row = env => {
      const {stdout} = run(['doctor'], {tmp, env});
      return JSON.parse(stdout).data.checks.find(
        (/** @type {{id: string}} */ check) => check.id === 'gather-cache',
      );
    };
    const plain = row().message;
    expect(plain).toContain(path.join(tmp, CACHE_NAME));
    expect(plain).not.toContain("Plug'n'Play");
    const pnp = path.join(work, 'as-pnp.cjs');
    fs.writeFileSync(pnp, "process.versions.pnp = '3';\n");
    const underPnp = row({NODE_OPTIONS: `--require ${pnp}`}).message;
    // The folder and its size, and that this run keeps none.
    expect(underPnp).toContain(path.join(tmp, CACHE_NAME));
    expect(underPnp).toContain(
      "but not in a run under Yarn Plug'n'Play's loader, such as `yarn astryx`",
    );
  }, 120_000);

  it('is never kept by a checkout, even one a pack left a build id in', () => {
    // A checkout: the packed files outside any node_modules folder, build id
    // included, as a local `pnpm pack` without its cleanup would leave them.
    const checkout = path.join(work, 'checkout', 'packages', 'cli');
    fs.cpSync(packed, checkout, {
      recursive: true,
      filter: source => path.basename(source) !== 'node_modules',
    });
    fs.symlinkSync(
      path.join(REPO_ROOT, 'packages', 'cli', 'node_modules'),
      path.join(checkout, 'node_modules'),
      'dir',
    );
    const tmp = keptTmp('checkout');
    const bin = path.join(checkout, 'clients', 'cli', 'bin', 'astryx.mjs');
    const ask = () =>
      spawnSync(process.execPath, [bin, ...QUERIES[0]], {
        cwd: project,
        encoding: 'utf8',
        env: {
          ...process.env,
          TMPDIR: tmp,
          XDG_CACHE_HOME: tmp,
          XDG_CONFIG_HOME: userConfig(),
          NO_UPDATE_NOTIFIER: '1',
          NODE_DISABLE_COMPILE_CACHE: '1',
        },
      });
    const first = ask();
    // An edit to the CLI's code between runs, which the build id would miss.
    const source = path.join(checkout, 'api', 'search', 'search.mjs');
    fs.appendFileSync(source, '\n// edited\n');
    const second = ask();
    expect(first.status, first.stderr).toBe(0);
    expect(second.stdout).toBe(first.stdout);
    expect(entries(tmp).size).toBe(0);

    expect(derivedEntries(tmp)).toEqual([]);
  }, 120_000);

  it('keeps no catalog gathered while Core could not be had', () => {
    // Outside any project, with no Core installed and no registry to install
    // one from: the search answers without Core and records the failed
    // install's backoff. Such a gather is not kept, so once the backoff ends
    // the next run tries the install again.
    const tmp = keptTmp('core-skipped');
    const outside = path.join(work, 'outside-core-skipped');
    fs.mkdirSync(outside, {recursive: true});
    const offline = {
      npm_config_registry: 'http://127.0.0.1:9/',
      npm_config_fetch_retries: '0',
    };
    const first = run(['search', 'button'], {tmp, cwd: outside, env: offline});
    expect(first.status, first.stderr).toBe(0);
    expect(JSON.parse(first.stdout).data).toBeTruthy();
    run(['search', 'button'], {tmp, cwd: outside, env: offline});
    expect(entries(tmp).size).toBe(0);

    expect(derivedEntries(tmp)).toEqual([]);
  }, 180_000);

  it('keeps a digest of each environment value it read, never the value', () => {
    const tmp = keptTmp('secrets');
    const secret = 'probe-secret-value-4f1c';
    const env = {PROBE_API_TOKEN: secret};
    const answer = run(QUERIES[0], {tmp, env});
    expect(run(QUERIES[0], {tmp, env})).toEqual(answer);
    const dir = path.join(tmp, CACHE_NAME);
    const files = fs.readdirSync(dir);
    expect(files.length).toBeGreaterThan(0);
    let states = 0;
    for (const name of files) {
      const text = fs.readFileSync(path.join(dir, name), 'utf8');
      expect(text, name).not.toContain(secret);
      for (const [, state] of JSON.parse(text).env ?? []) {
        states += 1;
        expect(state === null || /^[0-9a-f]{32}$/.test(state), name).toBe(true);
      }
    }
    expect(states).toBeGreaterThan(0);
  }, 120_000);

  it("keeps search's entry table beside the catalog, and reads it back the same", () => {
    const tmp = keptTmp('table');
    const fresh = run(QUERIES[0], {tmp: freshTmp()});
    expect(run(QUERIES[0], {tmp})).toEqual(fresh);
    expect(derivedEntries(tmp)).toHaveLength(1);
    const [table] = derivedEntries(tmp);
    const {ino} = fs.statSync(path.join(tmp, CACHE_NAME, table));
    // Read back, not rebuilt: the same file, and the same answer.
    expect(run(QUERIES[0], {tmp})).toEqual(fresh);
    expect(run(QUERIES[1], {tmp})).toEqual(run(QUERIES[1], {tmp: freshTmp()}));
    expect(fs.statSync(path.join(tmp, CACHE_NAME, table)).ino).toBe(ino);
  }, 120_000);

  it("is not used after an edit to the installed CLI's table-building code or cards", async () => {
    // As patch-package or a hand edit leaves it: same build id, other code.
    const tmp = keptTmp('code-edit');
    const asks = ['color picker', 'menu button', 'date picker', 'tab list'].map(
      q => ['search', q],
    );
    for (const ask of asks) run(ask, {tmp});
    const before = asks.map(ask => run(ask, {tmp}).stdout);
    const file = path.join(packed, 'api', 'search', '_entries.mjs');
    const source = fs.readFileSync(file, 'utf8');
    const edited = source.replace(
      'const nw = nameWords(name).map(fold);',
      'const nw = nameWords(name).map(fold).slice(0, 1);',
    );
    expect(edited).not.toBe(source);
    try {
      fs.writeFileSync(file, edited);
      let changed = 0;
      for (const [i, ask] of asks.entries()) {
        const [kept, fresh] = await Promise.all([
          runAsync(ask, {tmp}),
          runAsync(ask, {tmp: freshTmp()}),
        ]);
        expect(kept, ask.join(' ')).toEqual(fresh);
        if (fresh.stdout !== before[i]) changed++;
      }
      // The edit changes answers, so a stale table would have shown.
      expect(changed).toBeGreaterThan(0);
    } finally {
      fs.writeFileSync(file, source);
    }
    // The cards the table is built from: every card emptied.
    const ask = ['search', 'color picker'];
    run(ask, {tmp});
    const was = run(ask, {tmp}).stdout;
    const cardsFile = path.join(packed, 'api', 'search', '_cards.json');
    const cardsText = fs.readFileSync(cardsFile, 'utf8');
    const cards = Object.fromEntries(
      Object.keys(JSON.parse(cardsText)).map(name => [
        name,
        {what: '', synonyms: [], props: []},
      ]),
    );
    try {
      fs.writeFileSync(cardsFile, JSON.stringify(cards));
      const [kept, fresh] = await Promise.all([
        runAsync(ask, {tmp}),
        runAsync(ask, {tmp: freshTmp()}),
      ]);
      expect(fresh.stdout).not.toBe(was);
      expect(kept).toEqual(fresh);
    } finally {
      fs.writeFileSync(cardsFile, cardsText);
    }
  }, 180_000);
  it("keeps build's block catalog beside the search catalog, and reads it back the same", () => {
    const tmp = keptTmp('blocks');
    // A request that picks blocks.
    const ask = ['build', 'a dashboard with a chart and a table'];
    const fresh = run(ask, {tmp: freshTmp()});
    expect(run(ask, {tmp})).toEqual(fresh);
    const dir = path.join(tmp, CACHE_NAME);
    const blocks = derivedEntries(tmp).filter(
      name =>
        'blocks' in
        JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')).value,
    );
    expect(blocks).toHaveLength(1);
    const {ino} = fs.statSync(path.join(dir, blocks[0]));
    // Read back, not worked out again: the same file, and the same answer.
    expect(run(ask, {tmp})).toEqual(fresh);
    expect(fs.statSync(path.join(dir, blocks[0])).ino).toBe(ino);
  }, 120_000);

  it("is not used after an edit to the installed CLI's block weights or stopwords", async () => {
    const tmp = keptTmp('weights-edit');
    const asks = [
      ['build', 'a dashboard with a chart and a table'],
      ['build', 'a settings page with a form'],
      ['build', 'a kanban board with cards'],
    ];
    for (const ask of asks) run(ask, {tmp});
    const before = asks.map(ask => run(ask, {tmp}).stdout);
    const file = path.join(
      packed,
      'api',
      'build',
      'blocks',
      'blocks.weights.json',
    );
    const source = fs.readFileSync(file, 'utf8');
    const weights = JSON.parse(source);
    // Every term weighs the same, which moves every block's vector while
    // the requests keep weighted words.
    weights.idf = weights.idf.map(() => 1024);
    try {
      fs.writeFileSync(file, JSON.stringify(weights));
      let changed = 0;
      for (const [i, ask] of asks.entries()) {
        const [kept, fresh] = await Promise.all([
          runAsync(ask, {tmp}),
          runAsync(ask, {tmp: freshTmp()}),
        ]);
        expect(kept, ask.join(' ')).toEqual(fresh);
        if (fresh.stdout !== before[i]) changed++;
      }
      expect(changed).toBeGreaterThan(0);
    } finally {
      fs.writeFileSync(file, source);
    }
    // The stopwords the picker drops, from search's word rules: seeded again
    // on the restored weights, so only the stopword edit can miss.
    for (const ask of asks) run(ask, {tmp});
    const seeded = asks.map(ask => run(ask, {tmp}).stdout);
    const query = path.join(packed, 'api', 'search', '_query.mjs');
    const querySource = fs.readFileSync(query, 'utf8');
    const editedQuery = querySource.replace(
      'export const STOPWORDS = new Set([',
      // Words of block docs the requests do not use.
      "export const STOPWORDS = new Set([\n  'list',\n  'grid',\n  'header',\n  'summary',\n  'metric',\n  'metrics',\n  'stats',\n  'navigation',\n  'sidebar',\n  'row',\n  'rows',\n  'column',\n  'columns',\n  'section',\n  'filter',\n  'filters',\n  'toolbar',\n  'actions',",
    );
    expect(editedQuery).not.toBe(querySource);
    try {
      fs.writeFileSync(query, editedQuery);
      let changed = 0;
      for (const [i, ask] of asks.entries()) {
        const [kept, fresh] = await Promise.all([
          runAsync(ask, {tmp}),
          runAsync(ask, {tmp: freshTmp()}),
        ]);
        expect(kept, ask.join(' ')).toEqual(fresh);
        if (fresh.stdout !== seeded[i]) changed++;
      }
      expect(changed).toBeGreaterThan(0);
    } finally {
      fs.writeFileSync(query, querySource);
    }
  }, 240_000);

  it("keeps each integration's check results, and checks again after an edit", async () => {
    const tmp = keptTmp('issues');
    const other = makeProject();
    try {
      const templates = path.join(other.widgets, 'templates');
      fs.mkdirSync(templates, {recursive: true});
      const doc = path.join(templates, 'tally.doc.mjs');
      fs.writeFileSync(
        doc,
        `export default {type: 'page', name: 'tally', description: 'Running totals, tallied by team.', category: 'Widget - Tally'};\n`,
      );
      fs.writeFileSync(
        path.join(templates, 'tally.tsx'),
        `export default function Page() { return null; }\n`,
      );
      const ask = ['template', '--list'];
      const fresh = run(ask, {tmp: freshTmp(), cwd: other.dir, json: false});
      expect(run(ask, {tmp, cwd: other.dir, json: false})).toEqual(fresh);
      const kept = issuesEntries(tmp);
      // The integration's own checks, and the project's whole issue list.
      expect(kept.size).toBe(2);
      // Read back, not checked again: the same file, and the same answer.
      expect(run(ask, {tmp, cwd: other.dir, json: false})).toEqual(fresh);
      expect(issuesEntries(tmp)).toEqual(kept);
      // A template doc edited in place so that the checks find a problem.
      fs.writeFileSync(
        doc,
        `export default {type: 'page', name: 'tally', description: 42, category: 'Widget - Tally'};\n`,
      );
      const [again, edited] = await Promise.all([
        runAsync(ask, {tmp, cwd: other.dir, json: false}),
        runAsync(ask, {tmp: freshTmp(), cwd: other.dir, json: false}),
      ]);
      // The checks find the problem: a warning names the integration.
      expect(edited.stderr).toContain('@acme/widgets');
      expect(fresh.stderr).not.toContain('@acme/widgets');
      expect(again).toEqual(edited);
    } finally {
      fs.rmSync(other.dir, {recursive: true, force: true});
    }
  }, 120_000);

  it('records nothing for component, template, theme or discover in a project with no integration', () => {
    const tmp = keptTmp('no-integration');
    // A project with Core and nothing else: no config, no manifest, no
    // dependency that ships one.
    const bare = fs.mkdtempSync(path.join(work, 'projects', 'bare-'));
    try {
      fs.mkdirSync(path.join(bare, 'node_modules', '@astryxdesign'), {
        recursive: true,
      });
      fs.symlinkSync(
        path.join(REPO_ROOT, 'packages', 'core'),
        path.join(bare, 'node_modules', '@astryxdesign', 'core'),
        'dir',
      );
      fs.writeFileSync(
        path.join(bare, 'package.json'),
        JSON.stringify({
          name: 'bare',
          dependencies: {'@astryxdesign/core': '*'},
        }),
      );
      // A resolver that refuses the options module hooks pass: a run that
      // installed the recorder's hooks would fail its requires.
      const strict = path.join(work, 'strict-bare.cjs');
      fs.writeFileSync(
        strict,
        `const Module = require('node:module');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (options && options.conditions) throw new Error('resolver options are not supported');
  return resolve.call(this, request, parent, isMain, options);
};
`,
      );
      const env = {NODE_OPTIONS: `--require ${strict}`};
      for (const ask of [
        ['template', '--list'],
        ['component', 'Button'],
        ['theme', 'list'],
        ['discover'],
      ]) {
        // Stdout and status: a once-a-day notice may go to stderr.
        const answer = (
          /** @type {{status: number | null, stdout: string}} */ r,
        ) => [r.status, r.stdout];
        const fresh = answer(
          run(ask, {tmp: freshTmp(), cwd: bare, json: false}),
        );
        expect(answer(run(ask, {tmp, cwd: bare, json: false, env}))).toEqual(
          fresh,
        );
        expect(answer(run(ask, {tmp, cwd: bare, json: false, env}))).toEqual(
          fresh,
        );
      }
      expect(entries(tmp).size).toBe(0);
      expect(issuesEntries(tmp).size).toBe(0);
    } finally {
      fs.rmSync(bare, {recursive: true, force: true});
    }
  }, 120_000);

  it('keeps the check results of an integration installed beside the CLI, run outside a project', () => {
    const tmp = keptTmp('computer');
    // A computer-level integration: installed in the CLI's own install root.
    const beside = path.join(
      work,
      'install',
      'node_modules',
      '@acme',
      'beside',
    );
    const outside = fs.mkdtempSync(path.join(work, 'outside-'));
    try {
      fs.mkdirSync(path.join(beside, 'templates'), {recursive: true});
      fs.writeFileSync(
        path.join(beside, 'package.json'),
        JSON.stringify({name: '@acme/beside', version: '1.0.0'}),
      );
      fs.writeFileSync(
        path.join(beside, 'astryx.integration.mjs'),
        `export default { templates: './templates' };\n`,
      );
      fs.writeFileSync(
        path.join(beside, 'templates', 'tally.doc.mjs'),
        `export default {type: 'page', name: 'tally', description: 'Running totals, tallied by team.', category: 'Widget - Tally'};\n`,
      );
      fs.writeFileSync(
        path.join(beside, 'templates', 'tally.tsx'),
        `export default function Page() { return null; }\n`,
      );
      const ask = ['template', '--list'];
      const answer = (
        /** @type {{status: number | null, stdout: string}} */ r,
      ) => [r.status, r.stdout];
      const fresh = answer(
        run(ask, {tmp: freshTmp(), cwd: outside, json: false}),
      );
      expect(answer(run(ask, {tmp, cwd: outside, json: false}))).toEqual(fresh);
      const kept = issuesEntries(tmp);
      // The integration's own checks, and the project's whole issue list.
      expect(kept.size).toBe(2);
      expect(answer(run(ask, {tmp, cwd: outside, json: false}))).toEqual(fresh);
      expect(issuesEntries(tmp)).toEqual(kept);
    } finally {
      fs.rmSync(beside, {recursive: true, force: true});
      fs.rmSync(outside, {recursive: true, force: true});
    }
  }, 120_000);

  it("keeps doctor's docs checks, and a broken link shows on the very next run", () => {
    const tmp = keptTmp('doctor-docs');
    const other = makeProject();
    try {
      fs.writeFileSync(
        path.join(other.widgets, 'astryx.integration.mjs'),
        `export default { docs: './docs' };\n`,
      );
      fs.mkdirSync(path.join(other.widgets, 'docs'));
      // The link lives in a module the doc imports, so an edit to that module
      // alone must show too.
      const target = path.join(other.widgets, 'docs', 'target.mjs');
      const link = (/** @type {string} */ to) =>
        fs.writeFileSync(target, `export const target = '${to}';\n`);
      link('quick-start');
      fs.writeFileSync(
        path.join(other.widgets, 'docs', 'deploying.doc.mjs'),
        `import {target} from './target.mjs';\nexport const docs = {type: 'generic', name: 'deploying', title: 'Deploying', description: 'How to deploy.', sections: [{title: 'Overview', content: [{type: 'prose', text: 'Ship it, then see {@link generic:' + target + '}.'}]}]};\n`,
      );
      const tree = (/** @type {{stdout: string}} */ r) =>
        JSON.parse(r.stdout).data.checks.find(
          (/** @type {{id: string}} */ c) => c.id === 'docs-tree',
        );
      const doctor = (/** @type {string} */ at) =>
        tree(run(['doctor'], {tmp: at, cwd: other.dir}));
      const fresh = doctor(freshTmp());
      expect(doctor(tmp)).toEqual(fresh);
      const kept = doctorEntries(tmp);
      expect([...kept.keys()].sort()).toEqual([
        'cli-docs',
        'docs-progressive-disclosure',
        'docs-tree',
      ]);
      // Read back, not checked again: the same three files.
      expect(doctor(tmp)).toEqual(fresh);
      expect(doctorEntries(tmp)).toEqual(kept);
      // Broken by an edit to the imported module alone: the very next doctor
      // reports it, as a fresh one does, and checks the docs tree again.
      link('no-such-topic');
      const broken = doctor(tmp);
      expect(JSON.stringify(broken)).toContain('no-such-topic');
      expect(broken).toEqual(doctor(freshTmp()));
      const after = doctorEntries(tmp);
      expect(after.get('docs-tree')).not.toBe(kept.get('docs-tree'));
      // Fixed: the next doctor no longer reports it.
      link('quick-start');
      expect(doctor(tmp)).toEqual(fresh);
    } finally {
      fs.rmSync(other.dir, {recursive: true, force: true});
    }
  }, 180_000);

  it('leaves a missing cache folder missing when doctor runs', () => {
    const tmp = freshTmp();
    run(['doctor'], {tmp});
    run(['doctor'], {tmp});
    expect(fs.existsSync(path.join(tmp, CACHE_NAME))).toBe(false);
  }, 60_000);

  it('keeps the whole issue list, and finds a replacement problem after an edit', async () => {
    const tmp = keptTmp('replacement');
    const other = makeProject();
    try {
      const templates = path.join(other.widgets, 'templates');
      fs.mkdirSync(templates, {recursive: true});
      const doc = path.join(templates, 'tally.doc.mjs');
      const page = `{type: 'page', name: 'tally', description: 'Running totals, tallied by team.', category: 'Widget - Tally'`;
      fs.writeFileSync(doc, `export default ${page}};\n`);
      fs.writeFileSync(
        path.join(templates, 'tally.tsx'),
        `export default function Page() { return null; }\n`,
      );
      const ask = ['component', 'Button'];
      const fresh = run(ask, {tmp: freshTmp(), cwd: other.dir, json: false});
      expect(run(ask, {tmp, cwd: other.dir, json: false})).toEqual(fresh);
      const kept = issuesEntries(tmp);
      expect(kept.size).toBe(2);
      expect(run(ask, {tmp, cwd: other.dir, json: false})).toEqual(fresh);
      expect(issuesEntries(tmp)).toEqual(kept);
      // The template now claims to replace a Core page that does not exist:
      // only the replacement pass, which reads every template, finds it.
      fs.writeFileSync(
        doc,
        `export default ${page}, replaces: 'no-such-page'};\n`,
      );
      const [again, edited] = await Promise.all([
        runAsync(ask, {tmp, cwd: other.dir, json: false}),
        runAsync(ask, {tmp: freshTmp(), cwd: other.dir, json: false}),
      ]);
      expect(edited.stderr).toContain('@acme/widgets');
      expect(fresh.stderr).not.toContain('@acme/widgets');
      expect(again).toEqual(edited);
    } finally {
      fs.rmSync(other.dir, {recursive: true, force: true});
    }
  }, 120_000);

  it('gives doctor its own answer after an everyday command kept the issue list', () => {
    const tmp = keptTmp('doctor-core');
    // A project with no installed Core, and an opted-in integration whose
    // component replaces a Core one: everyday commands read the Core the CLI
    // carries, doctor only the project's (none), so their lists differ.
    const dir = fs.mkdtempSync(path.join(work, 'projects', 'no-core-'));
    // The Core the CLI carries: the repository's, beside the installed CLI,
    // for this case only.
    const carried = path.join(
      work,
      'install',
      'node_modules',
      '@astryxdesign',
      'core',
    );
    fs.symlinkSync(path.join(REPO_ROOT, 'packages', 'core'), carried, 'dir');
    try {
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({
          name: 'no-core',
          dependencies: {'@astryxdesign/cli': '*', '@acme/nav': '1.0.0'},
        }),
      );
      const nav = path.join(dir, 'node_modules', '@acme', 'nav');
      fs.mkdirSync(path.join(nav, 'components'), {recursive: true});
      fs.writeFileSync(
        path.join(nav, 'package.json'),
        JSON.stringify({
          name: '@acme/nav',
          version: '1.0.0',
          exports: {'./components/*': './components/*.tsx'},
          peerDependencies: {
            '@astryxdesign/cli': `>=${COMPONENT_REPLACES_CLI}`,
          },
        }),
      );
      fs.writeFileSync(
        path.join(nav, 'astryx.integration.mjs'),
        "export default {components: './components'};\n",
      );
      fs.writeFileSync(
        path.join(nav, 'components', 'AcmeSideNav.doc.mjs'),
        `export default ${JSON.stringify({
          type: 'component',
          name: 'AcmeSideNav',
          displayName: 'AcmeSideNav',
          import: '@acme/nav/components/AcmeSideNav',
          replaces: 'SideNav',
          keywords: ['acme'],
          usage: {description: 'AcmeSideNav for Acme apps.'},
          props: [],
        })};\n`,
      );
      fs.writeFileSync(
        path.join(nav, 'components', 'AcmeSideNav.tsx'),
        'export function AcmeSideNav() { return null; }\n',
      );
      const check = (/** @type {{stdout: string}} */ r) =>
        JSON.parse(r.stdout).data.checks.find(
          (/** @type {{id: string}} */ c) => c.id === 'integration-issues',
        );
      const fresh = check(run(['doctor'], {tmp: freshTmp(), cwd: dir}));
      // Doctor, reading no Core, finds the replaced component missing; the
      // everyday command, reading the carried Core, finds nothing.
      expect(JSON.stringify(fresh)).toContain('SideNav');
      const everyday = run(['template', '--list'], {
        tmp,
        cwd: dir,
        json: false,
      });
      expect(everyday.stderr).not.toContain('@acme/nav');
      run(['template', '--list'], {tmp, cwd: dir, json: false});
      // The everyday command kept its lists (the integration's and the
      // project's); doctor still answers as a fresh doctor does.
      expect(issuesEntries(tmp).size).toBe(2);
      expect(check(run(['doctor'], {tmp, cwd: dir}))).toEqual(fresh);
    } finally {
      fs.rmSync(carried, {force: true});
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }, 120_000);

  it.skipIf(process.getuid?.() === 0)(
    'lets doctor answer the same, silently, when its cache cannot be written',
    () => {
      const other = makeProject();
      /** @param {string} tmp @param {string} [mode] */
      const doctor = (tmp, mode) => {
        const catalogs = path.join(tmp, CACHE_NAME);
        fs.mkdirSync(catalogs, {recursive: true, mode: 0o700});
        if (mode === 'folder') fs.chmodSync(catalogs, 0o500);
        if (mode === 'tree') {
          fs.chmodSync(catalogs, 0o500);
          fs.chmodSync(path.dirname(catalogs), 0o500);
        }
        try {
          const r = run(['doctor'], {tmp, cwd: other.dir});
          return {
            status: r.status,
            stderr: r.stderr,
            // The cache row counts what the folder holds, which a write
            // earlier in the run adds to: the rest must match exactly.
            stdout: r.stdout
              .split(tmp)
              .join('<tmp>')
              .replace(/\(\d+ entr(?:y|ies), [\d.]+ MB\)/g, '(<count>)'),
          };
        } finally {
          fs.chmodSync(path.dirname(catalogs), 0o700);
          fs.chmodSync(catalogs, 0o700);
        }
      };
      try {
        const writable = doctor(freshTmp());
        expect(writable.status).toBe(0);
        // An unwritable cache folder, and a cache whose whole tree is read
        // only: doctor neither fails nor warns, and says the same.
        expect(doctor(freshTmp(), 'folder')).toEqual(writable);
        expect(doctor(freshTmp(), 'tree')).toEqual(writable);
      } finally {
        fs.rmSync(other.dir, {recursive: true, force: true});
      }
    },
    120_000,
  );

  it("does not depend on a variable's value when code only lists the names", () => {
    const tmp = keptTmp('env-values');
    const other = makeProject();
    try {
      // A TypeScript manifest: loading it transforms it, and the transform
      // lists every variable's name (it reads only its own variables).
      fs.rmSync(path.join(other.widgets, 'astryx.integration.mjs'));
      fs.writeFileSync(
        path.join(other.widgets, 'astryx.integration.ts'),
        "const integration: {templates: string} = {templates: './templates'};\nexport default integration;\n",
      );
      const templates = path.join(other.widgets, 'templates');
      fs.mkdirSync(templates, {recursive: true});
      fs.writeFileSync(
        path.join(templates, 'tally.doc.mjs'),
        `export default {type: 'page', name: 'tally', description: 'Running totals, tallied by team.', category: 'Widget - Tally'};\n`,
      );
      fs.writeFileSync(
        path.join(templates, 'tally.tsx'),
        `export default function Page() { return null; }\n`,
      );
      const ask = QUERIES[0];
      const at = (/** @type {string} */ value) =>
        run(ask, {tmp, cwd: other.dir, env: {ASTRYX_TEST_TOKEN: value}});
      const first = at('one');
      const inodes = () =>
        new Map([...entries(tmp)].map(([name, {ino}]) => [name, ino]));
      const kept = inodes();
      expect(kept.size).toBeGreaterThan(0);
      // An unrelated variable with another value, as a tool sets per call:
      // the kept catalog is read back.
      expect(at('two')).toEqual(first);
      expect(inodes()).toEqual(kept);
    } finally {
      fs.rmSync(other.dir, {recursive: true, force: true});
    }
  }, 120_000);

  it('misses when a variable the gather reads has another value', () => {
    const tmp = keptTmp('env-read');
    const other = makeProject();
    try {
      // The manifest reads a variable's value to pick its templates.
      fs.writeFileSync(
        path.join(other.widgets, 'astryx.integration.mjs'),
        "export default {templates: process.env.ASTRYX_TEST_ROOT === 'b' ? './templates-b' : './templates'};\n",
      );
      for (const [folder, description] of [
        ['templates', 'Running totals, tallied by team.'],
        ['templates-b', 'Grand totals, tallied by week.'],
      ]) {
        const dir = path.join(other.widgets, folder);
        fs.mkdirSync(dir, {recursive: true});
        fs.writeFileSync(
          path.join(dir, 'tally.doc.mjs'),
          `export default {type: 'page', name: 'tally', description: '${description}', category: 'Widget - Tally'};\n`,
        );
        fs.writeFileSync(
          path.join(dir, 'tally.tsx'),
          `export default function Page() { return null; }\n`,
        );
      }
      const ask = ['template', '--list'];
      const at = (/** @type {string} */ value, /** @type {string} */ where) =>
        run(ask, {tmp: where, cwd: other.dir, env: {ASTRYX_TEST_ROOT: value}});
      expect(at('a', tmp)).toEqual(at('a', freshTmp()));
      const b = at('b', tmp);
      expect(b.stdout).toContain('Grand totals');
      expect(b).toEqual(at('b', freshTmp()));
    } finally {
      fs.rmSync(other.dir, {recursive: true, force: true});
    }
  }, 120_000);

  it('hands a variable an inner kept gather read on to the gather around it', () => {
    const tmp = keptTmp('env-nested');
    const dir = fs.mkdtempSync(path.join(work, 'nested-'));
    try {
      // Two kept gathers of the installed CLI, one inside the other: the
      // outer reads a file, the inner a variable.
      const input = path.join(dir, 'outer.txt');
      const script = path.join(dir, 'nested.mjs');
      fs.writeFileSync(
        script,
        `import * as fs from 'node:fs';
const {persistedGather, recordRun} = await import(${JSON.stringify(
          pathToFileURL(
            path.join(packed, 'foundation', 'fs', 'gather-cache.mjs'),
          ).href,
        )});
const codec = {encode: v => v, decode: v => v};
const answer = await recordRun(() =>
  persistedGather(['nested-outer'], async () => {
    const inner = await persistedGather(['nested-inner'], async () => process.env.ASTRYX_TEST_V, codec);
    return inner + ':' + fs.readFileSync(${JSON.stringify(input)}, 'utf8');
  }, codec),
);
process.stdout.write(answer);
`,
      );
      const at = (/** @type {string} */ value) => {
        const result = spawnSync(process.execPath, [script], {
          encoding: 'utf8',
          env: {
            ...process.env,
            XDG_CACHE_HOME: tmp,
            XDG_CONFIG_HOME: userConfig(),
            ASTRYX_TEST_V: value,
          },
        });
        expect(result.status, result.stderr).toBe(0);
        return result.stdout;
      };
      fs.writeFileSync(input, '1');
      expect(at('a')).toBe('a:1');
      // Only the outer input changes: the outer gathers again while the
      // inner is read back.
      fs.writeFileSync(input, '2');
      expect(at('a')).toBe('a:2');
      // Then the variable the inner read changes.
      expect(at('b')).toBe('b:2');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }, 60_000);

  it('is skipped silently when its folder cannot be used', () => {
    fs.mkdirSync(path.join(work, 'tmp'), {recursive: true});
    const notAFolder = path.join(work, 'tmp', 'file-tmp');
    fs.writeFileSync(notAFolder, '');
    // Open to others: refused, as one someone else could have planted.
    const shared = path.join(work, 'tmp', 'shared');
    fs.mkdirSync(path.join(shared, CACHE_NAME), {recursive: true});
    fs.chmodSync(path.join(shared, CACHE_NAME), 0o777);
    const expected = run(QUERIES[0], {tmp: freshTmp()});
    expect(run(QUERIES[0], {tmp: shared})).toEqual(expected);
    expect(entries(shared).size).toBe(0);

    expect(derivedEntries(shared)).toEqual([]);
    const broken = spawnSync(
      process.execPath,
      [
        path.join(packed, 'clients', 'cli', 'bin', 'astryx.mjs'),
        ...QUERIES[0],
        '--json',
      ],
      {
        cwd: project,
        encoding: 'utf8',
        env: {
          ...process.env,
          TMPDIR: notAFolder,
          XDG_CACHE_HOME: notAFolder,
          XDG_CONFIG_HOME: userConfig(),
          NO_UPDATE_NOTIFIER: '1',
          NODE_DISABLE_COMPILE_CACHE: '1',
        },
      },
    );
    expect(broken.status).toBe(0);
    expect(broken.stdout).toBe(expected.stdout);
  }, 120_000);
});
