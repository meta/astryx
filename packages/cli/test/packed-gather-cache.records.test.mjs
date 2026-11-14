// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A published CLI keeps the catalog `search` and `build` gather between runs
 * (foundation/fs/gather-cache.mjs) and uses it only while nothing it read has
 * changed. This file: a kept catalog keeps search, build and doctor records, and
 * gathers fresh on a Node without module hooks; packed-gather-cache.discovery
 * covers the component list, template discovery, themes and docs.
 * Each case's answer from a kept catalog must equal a fresh gather's.
 */

import {describe, expect, it} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {COMPONENT_REPLACES_CLI} from '../foundation/integrations/cli-requirement.mjs';
import {REPO_ROOT} from '../test-utils/repo-root.mjs';
import {
  usePackedCli,
  work,
  packed,
  project,
  makeProject,
  userConfig,
  run,
  runAsync,
  CACHE_NAME,
  keptTmp,
  freshTmp,
  issuesEntries,
  derivedEntries,
  entries,
  QUERIES,
  hasModuleHooks,
} from '../test-utils/packed-gather-cache-fixture.mjs';

usePackedCli();

describe.skipIf(process.platform !== 'linux')('a kept catalog', () => {
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
    // Every kind of entry the folder holds is named, the docs not-found
    // hint's name summaries (kept-tree.mjs) included.
    expect(plain).toContain("the docs not-found hint's name summaries");
    // The bound on the folder, and on jiti's folder beside it.
    expect(plain).toContain('at most 64 MB');
    expect(plain).toContain(path.join(tmp, 'astryx', 'jiti'));
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

  it.skipIf(!hasModuleHooks)(
    'keeps a digest of each environment value it read, never the value',
    () => {
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
          expect(state === null || /^[0-9a-f]{32}$/.test(state), name).toBe(
            true,
          );
        }
      }
      expect(states).toBeGreaterThan(0);
    },
    120_000,
  );

  it.skipIf(!hasModuleHooks)(
    "keeps search's entry table beside the catalog, and reads it back the same",
    () => {
      const tmp = keptTmp('table');
      const fresh = run(QUERIES[0], {tmp: freshTmp()});
      expect(run(QUERIES[0], {tmp})).toEqual(fresh);
      expect(derivedEntries(tmp)).toHaveLength(1);
      const [table] = derivedEntries(tmp);
      const {ino} = fs.statSync(path.join(tmp, CACHE_NAME, table));
      // Read back, not rebuilt: the same file, and the same answer.
      expect(run(QUERIES[0], {tmp})).toEqual(fresh);
      expect(run(QUERIES[1], {tmp})).toEqual(
        run(QUERIES[1], {tmp: freshTmp()}),
      );
      expect(fs.statSync(path.join(tmp, CACHE_NAME, table)).ino).toBe(ino);
    },
    120_000,
  );

  it.skipIf(!hasModuleHooks)(
    "keeps build's block catalog beside the search catalog, and reads it back the same",
    () => {
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
    },
    120_000,
  );

  it.skipIf(!hasModuleHooks)(
    "keeps each integration's check results, and checks again after an edit",
    async () => {
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
    },
    120_000,
  );

  it('records nothing for component, template, theme, discover or docs in a project with no integration', () => {
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
        ['docs'],
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

  it.skipIf(!hasModuleHooks)(
    'keeps the check results of an integration installed beside the CLI, run outside a project',
    () => {
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
        expect(answer(run(ask, {tmp, cwd: outside, json: false}))).toEqual(
          fresh,
        );
        const kept = issuesEntries(tmp);
        // The integration's own checks, and the project's whole issue list.
        expect(kept.size).toBe(2);
        expect(answer(run(ask, {tmp, cwd: outside, json: false}))).toEqual(
          fresh,
        );
        expect(issuesEntries(tmp)).toEqual(kept);
      } finally {
        fs.rmSync(beside, {recursive: true, force: true});
        fs.rmSync(outside, {recursive: true, force: true});
      }
    },
    120_000,
  );

  it('leaves a missing cache folder missing when doctor runs', () => {
    const tmp = freshTmp();
    run(['doctor'], {tmp});
    run(['doctor'], {tmp});
    expect(fs.existsSync(path.join(tmp, CACHE_NAME))).toBe(false);
  }, 60_000);

  it.skipIf(!hasModuleHooks)(
    'keeps the whole issue list, and finds a replacement problem after an edit',
    async () => {
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
    },
    120_000,
  );

  it.skipIf(!hasModuleHooks)(
    'gives doctor its own answer after an everyday command kept the issue list',
    () => {
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
    },
    120_000,
  );

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

  it('reports an installed dependency whose manifest fails to load as its issue', () => {
    const tmp = keptTmp('unloadable');
    const other = makeProject();
    try {
      // No config: the dependency is linked because it ships a manifest,
      // which imports a package the install lacks.
      fs.rmSync(path.join(other.dir, 'astryx.config.mjs'));
      fs.writeFileSync(
        path.join(other.dir, 'package.json'),
        JSON.stringify({
          name: 'consumer',
          dependencies: {'@acme/widgets': '1.0.0'},
        }),
      );
      // The package declares what its manifest imports: an install without
      // it is broken, which reinstalling fixes.
      fs.writeFileSync(
        path.join(other.widgets, 'package.json'),
        JSON.stringify({
          name: '@acme/widgets',
          version: '1.0.0',
          dependencies: {'astryx-test-missing-package': '1.0.0'},
        }),
      );
      const manifest = path.join(other.widgets, 'astryx.integration.mjs');
      fs.writeFileSync(
        manifest,
        "import 'astryx-test-missing-package';\nexport default { templates: './templates' };\n",
      );
      fs.mkdirSync(path.join(other.widgets, 'templates'), {recursive: true});
      const list = run(['template', '--list'], {
        tmp,
        cwd: other.dir,
        json: false,
      });
      expect(list.status).toBe(0);
      expect(list.stderr).toContain('@acme/widgets has 1 integration issue');
      const check = JSON.parse(
        run(['doctor'], {tmp, cwd: other.dir}).stdout,
      ).data.checks.find(
        (/** @type {{id: string}} */ c) => c.id === 'integration-issues',
      );
      expect(check.status).toBe('warn');
      expect(check.message).toContain('@acme/widgets');
      expect(check.message).toContain('astryx-test-missing-package');
      // A theme lookup in that package is still an unknown theme.
      expect(
        JSON.parse(
          run(['theme', 'add', 'tally', '--package', '@acme/widgets'], {
            tmp,
            cwd: other.dir,
          }).stdout,
        ).code,
      ).toBe('ERR_UNKNOWN_THEME');
      // Kept, it says the same; once the missing package is installed (the
      // reinstall that repairs it), it says nothing.
      expect(
        run(['template', '--list'], {tmp, cwd: other.dir, json: false}),
      ).toEqual(list);
      const installed = path.join(
        other.dir,
        'node_modules',
        'astryx-test-missing-package',
      );
      fs.mkdirSync(installed, {recursive: true});
      fs.writeFileSync(
        path.join(installed, 'package.json'),
        JSON.stringify({
          name: 'astryx-test-missing-package',
          version: '1.0.0',
          type: 'module',
          exports: './index.mjs',
        }),
      );
      fs.writeFileSync(path.join(installed, 'index.mjs'), 'export {};\n');
      const fixed = run(['template', '--list'], {
        tmp,
        cwd: other.dir,
        json: false,
      });
      expect(fixed.stderr).not.toContain('integration issue');
    } finally {
      fs.rmSync(other.dir, {recursive: true, force: true});
    }
  }, 120_000);
});

describe.skipIf(process.platform !== 'linux' || hasModuleHooks)(
  'a Node without module.registerHooks',
  () => {
    it('answers as a fresh gather on every run, and keeps no catalog', () => {
      const tmp = keptTmp('no-module-hooks');
      const first = run(QUERIES[0], {tmp});
      const second = run(QUERIES[0], {tmp});
      expect(first.status).toBe(0);
      expect(second).toEqual(first);
      expect(second).toEqual(run(QUERIES[0], {tmp: freshTmp()}));
      expect(entries(tmp).size).toBe(0);
    }, 120_000);
  },
);
