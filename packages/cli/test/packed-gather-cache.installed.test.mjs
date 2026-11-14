// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A published CLI keeps the catalog `search` and `build` gather between runs
 * (foundation/fs/gather-cache.mjs) and uses it only while nothing it read has
 * changed: a kept catalog is not used after installed code or integrations change.
 * Each case's answer from a kept catalog must equal a fresh gather's.
 */

import {describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  usePackedCli,
  work,
  packed,
  project,
  makeProject,
  run,
  runAsync,
  CACHE_NAME,
  keptTmp,
  freshTmp,
  derivedEntries,
  entries,
  QUERIES,
  expectSameAsFresh,
  expectWarmHit,
  hasModuleHooks,
} from '../test-utils/packed-gather-cache-fixture.mjs';

usePackedCli();

describe.skipIf(process.platform !== 'linux')('a kept catalog', () => {
  it.skipIf(!hasModuleHooks)(
    'is not used after an integration is installed or removed',
    async () => {
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
    },
    300_000,
  );

  it.skipIf(!hasModuleHooks)(
    "installs no module hook unless it keeps a catalog, and keeps none under Plug'n'Play",
    () => {
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
      // An altered but well-formed catalog, which a run that reads it shows.
      entry.value.all = [];
      entry.value.components = [];
      fs.writeFileSync(file, JSON.stringify(entry));
      expect(run(QUERIES[0], {tmp: kept}).stdout).not.toBe(fresh.stdout);
      expect(run(QUERIES[0], {tmp: kept, env: asPnp})).toEqual(fresh);
    },
    120_000,
  );

  it.skipIf(!hasModuleHooks)(
    "is not used when another entry is copied over this one's name",
    () => {
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
        // The warm path hits before anything is copied.
        expectWarmHit(tmp, [QUERIES[0]], {cwd: project});
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
    },
    120_000,
  );

  it("is not used after an edit to the installed CLI's table-building code or cards", async () => {
    // As patch-package or a hand edit leaves it: same build id, other code.
    const tmp = keptTmp('code-edit');
    const asks = ['color picker', 'menu button', 'date picker', 'tab list'].map(
      q => ['search', q],
    );
    for (const ask of asks) run(ask, {tmp});
    const before = asks.map(ask => run(ask, {tmp}).stdout);
    if (hasModuleHooks) expectWarmHit(tmp, asks);
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
    if (hasModuleHooks) expectWarmHit(tmp, [ask]);
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

  it("is not used after an edit to the installed CLI's block weights or stopwords", async () => {
    const tmp = keptTmp('weights-edit');
    const asks = [
      ['build', 'a dashboard with a chart and a table'],
      ['build', 'a settings page with a form'],
      ['build', 'a kanban board with cards'],
    ];
    for (const ask of asks) run(ask, {tmp});
    const before = asks.map(ask => run(ask, {tmp}).stdout);
    if (hasModuleHooks) expectWarmHit(tmp, asks);
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
    if (hasModuleHooks) expectWarmHit(tmp, asks);
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
});
