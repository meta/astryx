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
  readKept,
  writeKept,
  docsTreeEntries,
  themeFactsEntries,
  BUILD_ID,
} from '../test-utils/packed-gather-cache-fixture.mjs';
import {copyPublishedCore} from '../scripts/generate-component-list.mjs';
import {REPO_ROOT} from '../test-utils/repo-root.mjs';

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
      const entry = readKept(file);
      // An altered but well-formed catalog, which a run that reads it shows.
      entry.value.all = [];
      entry.value.components = [];
      writeKept(file, entry);
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

  it.skipIf(!hasModuleHooks)(
    "keeps what theme build checks a theme against in Core's docs, and is not used after an edit to a visual-prop value in one of them",
    () => {
      const tmp = keptTmp('theme-facts');
      // A project with an integration, so theme build keeps its gathers, and
      // its own copies of the CLI and Core: theme build reads the Core
      // installed beside the CLI that runs.
      const {dir} = makeProject();
      const scope = path.join(dir, 'node_modules', '@astryxdesign');
      const cli = path.join(scope, 'cli');
      fs.cpSync(packed, cli, {recursive: true, verbatimSymlinks: true});
      const core = path.join(scope, 'core');
      fs.unlinkSync(core);
      copyPublishedCore(core);
      fs.symlinkSync(
        path.join(REPO_ROOT, 'packages', 'core', 'node_modules'),
        path.join(core, 'node_modules'),
        'dir',
      );
      fs.mkdirSync(path.join(dir, 'theme'));
      // A theme with no component overrides.
      fs.writeFileSync(
        path.join(dir, 'theme', 'plain.ts'),
        `import {defineTheme} from '@astryxdesign/core/theme';\nexport const plainTheme = defineTheme({name: 'plain', tokens: {'--color-accent': '#0b5fcc'}});\n`,
      );
      // `quiet` is not a built-in Button variant: the build adds it.
      fs.writeFileSync(
        path.join(dir, 'theme', 'probe.ts'),
        `import {defineTheme} from '@astryxdesign/core/theme';\nexport const probeTheme = defineTheme({name: 'probe', components: {button: {'variant:quiet': {color: 'red'}}}});\n`,
      );
      const ask = ['theme', 'build', 'theme/probe.ts'];
      try {
        const plain = run(['theme', 'build', 'theme/plain.ts'], {
          tmp,
          cwd: dir,
          cli,
        });
        expect(plain.status, plain.stderr).toBe(0);
        const kept = themeFactsEntries(tmp);
        expect(kept.size).toBe(1);
        // A build after an edit to that theme reads the facts back: they do
        // not depend on the theme.
        fs.appendFileSync(path.join(dir, 'theme', 'plain.ts'), '// edited\n');
        const edited = run(['theme', 'build', 'theme/plain.ts'], {
          tmp,
          cwd: dir,
          cli,
        });
        expect(edited.status, edited.stderr).toBe(0);
        expect(themeFactsEntries(tmp)).toEqual(kept);
        // A theme whose overrides name a prop value reads back the same
        // entry: it holds every fact a build checks a theme against.
        const first = run(ask, {tmp, cwd: dir, cli});
        expect(first.status, first.stderr).toBe(0);
        expect(themeFactsEntries(tmp)).toEqual(kept);
        // A warm run reads the facts back: the entry is not written again.
        const warm = run(ask, {tmp, cwd: dir, cli});
        expect(themeFactsEntries(tmp)).toEqual(kept);
        expect(warm).toEqual(first);
        // An in-place edit makes `quiet` a built-in value.
        const doc = path.join(core, 'src', 'Button', 'Button.doc.mjs');
        const text = fs.readFileSync(doc, 'utf8');
        const builtIn = "'primary' | 'secondary' | 'ghost' | 'destructive'";
        expect(text).toContain(builtIn);
        fs.writeFileSync(doc, text.replaceAll(builtIn, `${builtIn} | 'quiet'`));
        const after = run(ask, {tmp, cwd: dir, cli});
        expect(after).toEqual(run(ask, {tmp: freshTmp(), cwd: dir, cli}));
        expect(after).not.toEqual(first);
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    },
    180_000,
  );

  it.skipIf(!hasModuleHooks)(
    "keeps the CLI's own docs tree, which a reinstall or a copy in another folder gathers again",
    async () => {
      const tmp = keptTmp('docs-tree');
      const ask = ['docs', 'authoring/building-blocks/components'];
      const first = run(ask, {tmp});
      expect(first.status, first.stderr).toBe(0);
      expect(docsTreeEntries(tmp).size).toBe(1);
      expectWarmHit(tmp, [ask]);
      const tree = path.join('assets', 'docs', 'tree', 'components.doc.mjs');
      /** @param {string} cli */
      const edit = cli => {
        const file = path.join(cli, tree);
        const source = fs.readFileSync(file, 'utf8');
        const edited = source.replace(
          'Add components to an integration,',
          'Add components to an integration package,',
        );
        expect(edited).not.toBe(source);
        fs.writeFileSync(file, edited);
        return () => fs.writeFileSync(file, source);
      };
      // A patched copy, installed beside the CLI as a package manager's patch
      // installs one in another folder, while the CLI it came from stays as it
      // was: it keeps its own entries.
      const copy = path.join(path.dirname(packed), 'cli-copy');
      fs.cpSync(packed, copy, {recursive: true});
      try {
        edit(copy);
        const patched = run(ask, {tmp: freshTmp(), cli: copy});
        expect(patched.stdout).not.toBe(first.stdout);
        expect(run(ask, {tmp, cli: copy})).toEqual(patched);
      } finally {
        fs.rmSync(copy, {recursive: true, force: true});
      }
      // As patch-package or a hand edit leaves the installed CLI: same build
      // id, same folder, other text. The build id and the folder stand for
      // the CLI's own files, so the edit is not seen (the record says
      // in-place edits to an installed CLI aren't supported).
      const restore = edit(packed);
      const buildIdFile = path.join(packed, BUILD_ID);
      const buildId = fs.readFileSync(buildIdFile, 'utf8');
      try {
        const fresh = run(ask, {tmp: freshTmp()});
        expect(fresh.stdout).not.toBe(first.stdout);
        expect(run(ask, {tmp})).toEqual(first);
        // A reinstall gives another build id: the next run gathers again.
        fs.writeFileSync(
          buildIdFile,
          JSON.stringify({id: 'reinstalled'}) + '\n',
        );
        const [kept, again] = await Promise.all([
          runAsync(ask, {tmp}),
          runAsync(ask, {tmp: freshTmp()}),
        ]);
        expect(kept).toEqual(again);
        expect(kept.stdout).toBe(fresh.stdout);
      } finally {
        restore();
        fs.writeFileSync(buildIdFile, buildId);
      }
    },
    180_000,
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
