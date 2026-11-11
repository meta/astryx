// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A published CLI keeps the catalog `search` and `build` gather between runs
 * (foundation/fs/gather-cache.mjs) and uses it only while nothing it read has
 * changed. Every answer from a kept catalog must equal a fresh gather's:
 * after an edit, an added or removed file, a copy that keeps the time, an
 * upgrade, another project or another environment, and after random changes.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {REPO_ROOT} from '../test-utils/repo-root.mjs';
import {packPublishedCli} from '../test-utils/pack-published-cli.mjs';

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
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'packed-gather-cache-'));
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
  if (work) fs.rmSync(work, {recursive: true, force: true});
  if (project) fs.rmSync(project, {recursive: true, force: true});
});

/**
 * Run the packed CLI with `tmp` as the system temp folder.
 * @param {string[]} args
 * @param {{tmp: string, cwd?: string, env?: Record<string, string>}} options
 */
function run(args, {tmp, cwd = project, env = {}}) {
  fs.mkdirSync(tmp, {recursive: true});
  const base = {...process.env};
  delete base.CI;
  const result = spawnSync(
    process.execPath,
    [
      path.join(packed, 'clients', 'cli', 'bin', 'astryx.mjs'),
      ...args,
      '--json',
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
        ...env,
      },
    },
  );
  return {status: result.status, stdout: result.stdout, stderr: result.stderr};
}

/** The user's cache folder's name in a temp folder. */
const CACHE_NAME = `astryx-cli-cache${process.getuid ? `-${process.getuid()}` : ''}`;

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
  return tmp;
}

/** A temp folder no run has used: a fresh gather. */
let fresh = 0;
const freshTmp = () => path.join(work, 'tmp', `fresh-${fresh++}`);

/**
 * The kept entries in a temp folder's cache: each file's inode and time.
 * @param {string} tmp
 * @returns {Map<string, {ino: number, mtimeMs: number}>}
 */
function entries(tmp) {
  if (!fs.existsSync(tmp)) return new Map();
  const dir = fs
    .readdirSync(tmp)
    .find(name => name.startsWith('astryx-cli-cache'));
  /** @type {Map<string, {ino: number, mtimeMs: number}>} */
  const out = new Map();
  if (!dir) return out;
  for (const name of fs.readdirSync(path.join(tmp, dir))) {
    const {ino, mtimeMs} = fs.statSync(path.join(tmp, dir, name));
    out.set(name, {ino, mtimeMs});
  }
  return out;
}

const QUERIES = [
  ['search', 'running totals'],
  ['search', 'team roster'],
  ['build', 'a ledger page with totals'],
];

/**
 * Every query's answer, from the kept folder `tmp` and from a fresh one.
 * @param {string} tmp
 * @param {{cwd?: string, env?: Record<string, string>}} [options]
 */
function expectSameAsFresh(tmp, options = {}) {
  /** @type {('hit' | 'miss')[]} */
  const outcomes = [];
  for (const args of QUERIES) {
    const before = entries(tmp);
    const kept = run(args, {tmp, ...options});
    const after = entries(tmp);
    // A hit leaves every entry's file in place; a miss writes one anew.
    outcomes.push(
      before.size > 0 &&
        [...after].every(([name, {ino}]) => before.get(name)?.ino === ino)
        ? 'hit'
        : 'miss',
    );
    const gathered = run(args, {tmp: freshTmp(), ...options});
    expect(kept.status, args.join(' ')).toBe(0);
    expect(kept, `${args.join(' ')} (${outcomes.at(-1)})`).toEqual(gathered);
  }
  return outcomes;
}

describe('a kept catalog', () => {
  it('answers as a fresh gather, and is used while nothing changed', () => {
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
    expectSameAsFresh(tmp);
  }, 120_000);

  it('is not used after an edit, an added or removed file, or a copy that keeps the time', () => {
    const tmp = keptTmp('stale');
    expect(expectSameAsFresh(tmp)).toEqual(['miss', 'hit', 'hit']);
    writeTemplate('ledger', 'Entries as rows with running balances.');
    expect(expectSameAsFresh(tmp)).toEqual(['miss', 'hit', 'hit']);
    writeTemplate('kanban', 'Cards in columns with running totals.');
    expect(expectSameAsFresh(tmp)).toEqual(['miss', 'hit', 'hit']);
    fs.rmSync(path.join(widgets, 'templates', 'kanban.doc.mjs'));
    expect(expectSameAsFresh(tmp)).toEqual(['miss', 'hit', 'hit']);
    // Same size and times, other text: a copy that keeps the time.
    const doc = path.join(widgets, 'templates', 'roster.doc.mjs');
    const {atime, mtime, size} = fs.statSync(doc);
    const text = fs.readFileSync(doc, 'utf8').replace('team', 'crew');
    expect(Buffer.byteLength(text)).toBe(size);
    const copy = `${doc}.copy`;
    fs.writeFileSync(copy, text);
    fs.utimesSync(copy, atime, mtime);
    fs.renameSync(copy, doc);
    expect(expectSameAsFresh(tmp)).toEqual(['miss', 'hit', 'hit']);
    writeTemplate('roster', 'People as rows with role and team.');
  }, 300_000);

  it('is not used by another project, another CLI, or another environment', () => {
    const tmp = keptTmp('other');
    expectSameAsFresh(tmp);
    const other = makeProject();
    try {
      expectSameAsFresh(tmp, {cwd: other.dir});
      expect(entries(tmp).size).toBe(2);
    } finally {
      fs.rmSync(other.dir, {recursive: true, force: true});
    }
    fs.writeFileSync(
      path.join(packed, BUILD_ID),
      JSON.stringify({id: 'second'}) + '\n',
    );
    expect(expectSameAsFresh(tmp)[0]).toBe('miss');
    expect(expectSameAsFresh(tmp, {env: {CI: '1'}})[0]).toBe('miss');
  }, 300_000);

  it('is not used after an integration is installed or removed', () => {
    const tmp = keptTmp('install');
    expect(expectSameAsFresh(tmp)).toEqual(['miss', 'hit', 'hit']);
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
    expect(expectSameAsFresh(tmp)).toEqual(['miss', 'hit', 'hit']);
    fs.writeFileSync(
      config,
      `export default { integrations: ['@acme/widgets'] };\n`,
    );
    fs.rmSync(extra, {recursive: true, force: true});
    expect(expectSameAsFresh(tmp)).toEqual(['miss', 'hit', 'hit']);
  }, 300_000);

  it('is not used after a change in a folder above the project', () => {
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
      expectSameAsFresh(tmp);
      // A package.json, then a config file, in the folder above.
      for (const [name, text] of [
        ['package.json', JSON.stringify({name: 'parent'})],
        ['astryx.config.mjs', 'export default {};\n'],
      ]) {
        const file = path.join(parent, name);
        fs.writeFileSync(file, text);
        made.push(file);
        expectSameAsFresh(tmp);
      }
      // A node_modules folder above, then the listed integration in it.
      const far = path.join(parent, 'node_modules', '@acme', 'far');
      made.push(path.join(parent, 'node_modules'));
      fs.mkdirSync(path.join(parent, 'node_modules'));
      expectSameAsFresh(tmp);
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
      expect(expectSameAsFresh(tmp)[0]).toBe('miss');
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

  it('answers as a fresh gather after random changes', () => {
    const tmp = keptTmp('random');
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const ids = ['ledger', 'roster', 'kanban', 'gallery'];
    const words = ['totals', 'team', 'balances', 'crew', 'columns', 'photos'];
    expectSameAsFresh(tmp);
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
      const outcomes = expectSameAsFresh(tmp);
      expect(outcomes.slice(1)).toEqual(['hit', 'hit']);
    }
  }, 600_000);

  it('is not kept by the first run, which only makes its folder', () => {
    const tmp = path.join(work, 'tmp', 'first');
    const first = run(QUERIES[0], {tmp});
    expect(fs.readdirSync(tmp)).toEqual([CACHE_NAME]);
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
      // temp folder.
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
      expect(fs.existsSync(path.join(tmp, 'jiti'))).toBe(true);
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
    // Plug'n'Play with a usable folder: no hook, no catalog, the same answer.
    const pnp = keptTmp('pnp');
    const asPnp = {...strictEnv, AS_PNP: '1'};
    expect(run(QUERIES[0], {tmp: pnp, env: asPnp})).toEqual(fresh);
    expect(run(QUERIES[0], {tmp: pnp, env: asPnp})).toEqual(fresh);
    expect(entries(pnp).size).toBe(0);
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
  }, 120_000);

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
          NO_UPDATE_NOTIFIER: '1',
          NODE_DISABLE_COMPILE_CACHE: '1',
        },
      },
    );
    expect(broken.status).toBe(0);
    expect(broken.stdout).toBe(expected.stdout);
  }, 120_000);
});
