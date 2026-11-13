// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A published CLI keeps the catalog `search` and `build` gather between runs
 * (foundation/fs/gather-cache.mjs) and uses it only while nothing it read has
 * changed: a kept catalog keeps search, build and doctor records, and gathers fresh on a Node without module hooks.
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
  doctorEntries,
  issuesEntries,
  derivedEntries,
  entries,
  templatesEntries,
  themeEntries,
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

  it.skipIf(!hasModuleHooks)(
    "keeps doctor's docs checks, and a broken link shows on the very next run",
    () => {
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
    },
    180_000,
  );

  it.skipIf(!hasModuleHooks)(
    'keeps the component list, and a new or edited component shows on the very next run',
    () => {
      const tmp = keptTmp('component-list');
      const other = makeProject();
      try {
        fs.writeFileSync(
          path.join(other.widgets, 'astryx.integration.mjs'),
          `export default { components: './components' };\n`,
        );
        const component = (
          /** @type {string} */ name,
          /** @type {string} */ description,
        ) => {
          const dir = path.join(other.widgets, 'components', name);
          fs.mkdirSync(dir, {recursive: true});
          fs.writeFileSync(
            path.join(dir, `${name}.doc.mjs`),
            `export const docs = {type: 'component', name: '${name}', description: '${description}', props: []};\n`,
          );
          fs.writeFileSync(
            path.join(dir, `${name}.tsx`),
            `export function ${name}() { return null; }\n`,
          );
        };
        component('Gadget', 'Shows a gadget.');
        // Core as a copy of what component discovery reads, so a test can edit
        // a Core doc in place.
        const core = path.join(
          other.dir,
          'node_modules',
          '@astryxdesign',
          'core',
        );
        const coreSource = fs.realpathSync(core);
        fs.unlinkSync(core);
        fs.mkdirSync(core);
        for (const entry of [
          'package.json',
          'groups.doc.mjs',
          'docs.mjs',
          'src',
        ]) {
          fs.cpSync(path.join(coreSource, entry), path.join(core, entry), {
            recursive: true,
            filter: from => !from.includes(`${path.sep}__tests__`),
          });
        }
        const lists = () =>
          new Map(
            fs
              .readdirSync(path.join(tmp, CACHE_NAME))
              .map(name => path.join(tmp, CACHE_NAME, name))
              .filter(
                file =>
                  JSON.parse(fs.readFileSync(file, 'utf8')).value?.type ===
                  'component.list',
              )
              .map(file => [file, fs.statSync(file).ino]),
          );
        for (const ask of [
          ['component', '--list'],
          ['component', '--list', '--detail', 'compact'],
        ]) {
          for (const json of [true, false]) {
            const fresh = run(ask, {tmp: freshTmp(), cwd: other.dir, json});
            expect(fresh.status, fresh.stderr).toBe(0);
            // Kept, then read back: byte for byte what a fresh run prints.
            expect(run(ask, {tmp, cwd: other.dir, json})).toEqual(fresh);
            expect(run(ask, {tmp, cwd: other.dir, json})).toEqual(fresh);
          }
        }
        const kept = lists();
        // One per list detail: text and JSON print the same kept list.
        expect(kept.size).toBe(2);
        expect(run(['component', '--list'], {tmp, cwd: other.dir})).toEqual(
          run(['component', '--list'], {tmp: freshTmp(), cwd: other.dir}),
        );
        expect(lists()).toEqual(kept);
        // A new component folder, then an edited doc: each shows on the very
        // next run, as a fresh run shows it.
        component('Widget', 'Shows a widget.');
        const added = run(['component', '--list'], {tmp, cwd: other.dir});
        expect(added.stdout).toContain('Widget');
        expect(added).toEqual(
          run(['component', '--list'], {tmp: freshTmp(), cwd: other.dir}),
        );
        // A Core doc edited in place: its new description shows.
        const buttonDoc = path.join(core, 'src', 'Button', 'Button.doc.mjs');
        const text = fs.readFileSync(buttonDoc, 'utf8');
        const description = /description:\s*'([^']{20,})'/.exec(text)?.[1];
        expect(description).toBeDefined();
        const compact = ['component', '--list', '--detail', 'compact'];
        expect(run(compact, {tmp, cwd: other.dir}).stdout).toContain(
          /** @type {string} */ (description).slice(0, 30),
        );
        fs.writeFileSync(
          buttonDoc,
          text.replace(
            /** @type {string} */ (description),
            'A button, edited in place.',
          ),
        );
        const edited = run(compact, {tmp, cwd: other.dir});
        expect(edited.stdout).toContain('A button, edited in place.');
        expect(edited).toEqual(run(compact, {tmp: freshTmp(), cwd: other.dir}));
        // A component read is unchanged warm and cold.
        const read = ['component', 'Button'];
        expect(run(read, {tmp, cwd: other.dir})).toEqual(
          run(read, {tmp: freshTmp(), cwd: other.dir}),
        );
      } finally {
        fs.rmSync(other.dir, {recursive: true, force: true});
      }
    },
    240_000,
  );

  it.skipIf(!hasModuleHooks)(
    "keeps doctor's theme-wiring scan, and an edit to the app's import or the theme module shows on the very next run",
    () => {
      const tmp = keptTmp('theme-wiring');
      const other = makeProject();
      try {
        const version = JSON.parse(
          fs.readFileSync(path.join(packed, 'package.json'), 'utf8'),
        ).version;
        const theme = path.join(
          other.dir,
          'node_modules',
          '@astryxdesign',
          'theme-neutral',
        );
        fs.mkdirSync(path.join(theme, 'dist'), {recursive: true});
        fs.writeFileSync(
          path.join(theme, 'package.json'),
          JSON.stringify({
            name: '@astryxdesign/theme-neutral',
            version,
            type: 'module',
            exports: {
              '.': './dist/index.js',
              './built': './dist/neutral.js',
              './theme.css': './dist/theme.css',
            },
          }),
        );
        const themeModule = path.join(theme, 'dist', 'neutral.js');
        fs.writeFileSync(
          themeModule,
          `export const neutralTheme = {name: 'neutral', tokens: {}};\n`,
        );
        fs.writeFileSync(
          path.join(theme, 'dist', 'index.js'),
          `export {neutralTheme} from './neutral.js';\n`,
        );
        fs.writeFileSync(
          path.join(theme, 'dist', 'theme.css'),
          `[data-astryx-theme="neutral"] { --color-text: black; }\n`,
        );
        const themes = (/** @type {string} */ at) => {
          const result = run(['doctor'], {tmp: at, cwd: other.dir});
          return JSON.parse(result.stdout).data.checks.find(
            (/** @type {{id: string}} */ c) => c.id === 'themes',
          );
        };
        const wiringEntries = () =>
          fs
            .readdirSync(path.join(tmp, CACHE_NAME))
            .filter(name =>
              Array.isArray(
                JSON.parse(
                  fs.readFileSync(path.join(tmp, CACHE_NAME, name), 'utf8'),
                ).value?.wired,
              ),
            );
        // Nothing wired yet: kept, then read back, as a fresh run answers.
        const unwired = themes(freshTmp());
        expect(themes(tmp)).toEqual(unwired);
        expect(wiringEntries()).toHaveLength(1);
        expect(themes(tmp)).toEqual(unwired);
        // The app passes the package's theme to Core's Theme: the very next
        // run sees it.
        fs.mkdirSync(path.join(other.dir, 'app'), {recursive: true});
        fs.writeFileSync(
          path.join(other.dir, 'app', 'providers.tsx'),
          [
            "import {Theme} from '@astryxdesign/core/theme';",
            "import {neutralTheme} from '@astryxdesign/theme-neutral/built';",
            'export const Providers = ({children}: any) => (',
            '  <Theme theme={neutralTheme}>{children}</Theme>',
            ');',
            '',
          ].join('\n'),
        );
        const wired = themes(tmp);
        expect(wired).not.toEqual(unwired);
        expect(wired).toEqual(themes(freshTmp()));
        expect(themes(tmp)).toEqual(wired);
        // An edit to the theme module alone scans again, as a fresh run does.
        const keptEntry = path.join(tmp, CACHE_NAME, wiringEntries()[0]);
        const before = fs.statSync(keptEntry).ino;
        fs.writeFileSync(
          themeModule,
          `export const neutralTheme = {name: 'neutral', tokens: {color: {}}};\n`,
        );
        expect(themes(tmp)).toEqual(themes(freshTmp()));
        const rescanned = fs.statSync(keptEntry).ino;
        expect(rescanned).not.toBe(before);
        // The package no longer exports the built theme the app imports: the
        // very next run scans again and reports it, as a fresh run does.
        const pkgFile = path.join(theme, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
        delete pkg.exports['./built'];
        fs.writeFileSync(pkgFile, JSON.stringify(pkg));
        const dropped = themes(tmp);
        expect(dropped).not.toEqual(wired);
        expect(dropped).toEqual(themes(freshTmp()));
        expect(fs.statSync(keptEntry).ino).not.toBe(rescanned);
      } finally {
        fs.rmSync(other.dir, {recursive: true, force: true});
      }
    },
    240_000,
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

  it('keeps template discovery, and discovers again after a template edit', async () => {
    const tmp = keptTmp('templates');
    const other = makeProject();
    try {
      const templates = path.join(other.widgets, 'templates');
      fs.mkdirSync(templates, {recursive: true});
      const doc = path.join(templates, 'tally.doc.mjs');
      const write = (/** @type {string} */ description) =>
        fs.writeFileSync(
          doc,
          `export default {type: 'page', name: 'tally', description: '${description}', category: 'Widget - Tally'};\n`,
        );
      write('Running totals, tallied by team.');
      fs.writeFileSync(
        path.join(templates, 'tally.tsx'),
        `export default function Page() { return null; }\n`,
      );
      const ask = ['template', '--list'];
      const fresh = run(ask, {tmp: freshTmp(), cwd: other.dir, json: false});
      expect(run(ask, {tmp, cwd: other.dir, json: false})).toEqual(fresh);
      const kept = templatesEntries(tmp);
      // Node 22.13 has no synchronous module hooks, so the supported fallback
      // gathers fresh and keeps no template records.
      expect(kept.size).toBe(hasModuleHooks ? 1 : 0);
      // With hooks this reads back the same file; without them it gathers
      // fresh. Either path must return the same answer.
      expect(run(ask, {tmp, cwd: other.dir, json: false})).toEqual(fresh);
      expect(templatesEntries(tmp)).toEqual(kept);
      write('Grand totals, tallied by week.');
      const [again, edited] = await Promise.all([
        runAsync(ask, {tmp, cwd: other.dir, json: false}),
        runAsync(ask, {tmp: freshTmp(), cwd: other.dir, json: false}),
      ]);
      expect(edited.stdout).toContain('Grand totals');
      expect(again).toEqual(edited);
    } finally {
      fs.rmSync(other.dir, {recursive: true, force: true});
    }
  }, 120_000);

  it('keeps template records apart for two copies of one build, outside a project', () => {
    const tmp = keptTmp('two-copies');
    // A second copy of the same build, in an install of its own, and an
    // integration beside the first copy only.
    const second = path.join(
      work,
      'install-2',
      'node_modules',
      '@astryxdesign',
      'cli',
    );
    fs.cpSync(packed, second, {recursive: true, verbatimSymlinks: true});
    const beside = path.join(work, 'install', 'node_modules', '@acme', 'tally');
    const outside = fs.mkdtempSync(path.join(work, 'outside-'));
    try {
      fs.mkdirSync(path.join(beside, 'templates'), {recursive: true});
      fs.writeFileSync(
        path.join(beside, 'package.json'),
        JSON.stringify({name: '@acme/tally', version: '1.0.0'}),
      );
      fs.writeFileSync(
        path.join(beside, 'astryx.integration.mjs'),
        `export default { templates: './templates' };\n`,
      );
      fs.writeFileSync(
        path.join(beside, 'templates', 'zqledger.doc.mjs'),
        `export default {type: 'page', name: 'zqledger', description: 'Running totals, tallied by team.', category: 'Widget - Tally'};\n`,
      );
      fs.writeFileSync(
        path.join(beside, 'templates', 'zqledger.tsx'),
        `export default function Page() { return null; }\n`,
      );
      const ask = ['template', '--list'];
      const first = run(ask, {tmp: freshTmp(), cwd: outside});
      const other = run(ask, {tmp: freshTmp(), cwd: outside, cli: second});
      // Only the first copy sees the integration beside it.
      expect(first.stdout).toContain('zqledger');
      expect(other.stdout).not.toContain('zqledger');
      run(ask, {tmp, cwd: outside, json: false});
      run(ask, {tmp, cwd: outside, json: false});
      // Only runtimes with synchronous hooks keep template records.
      expect(templatesEntries(tmp).size).toBe(hasModuleHooks ? 1 : 0);
      expect(run(ask, {tmp, cwd: outside, cli: second})).toEqual(other);
      expect(run(ask, {tmp, cwd: outside})).toEqual(first);
    } finally {
      fs.rmSync(beside, {recursive: true, force: true});
      fs.rmSync(path.join(work, 'install-2'), {recursive: true, force: true});
      fs.rmSync(outside, {recursive: true, force: true});
    }
  }, 120_000);

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

  it("keeps an integration's themes, and finds an edit to a theme or a module it imports", () => {
    const tmp = keptTmp('themes');
    const other = makeProject();
    try {
      fs.writeFileSync(
        path.join(other.widgets, 'astryx.integration.mjs'),
        `export default { themes: './themes' };\n`,
      );
      // A package that ships the theme's built files as its exports.
      const version = JSON.parse(
        fs.readFileSync(
          path.join(REPO_ROOT, 'packages', 'cli', 'package.json'),
          'utf8',
        ),
      ).version;
      fs.writeFileSync(
        path.join(other.widgets, 'package.json'),
        JSON.stringify({
          name: '@acme/widgets',
          version: '1.0.0',
          type: 'module',
          peerDependencies: {'@astryxdesign/core': `^${version}`},
          exports: {
            './themes/tally': './dist/tally.js',
            './themes/tally.css': './dist/tally.css',
          },
        }),
      );
      fs.mkdirSync(path.join(other.widgets, 'dist'));
      fs.writeFileSync(
        path.join(other.widgets, 'dist', 'tally.js'),
        "export const tallyTheme = {name: 'tally', tokens: {}};\n",
      );
      fs.writeFileSync(
        path.join(other.widgets, 'dist', 'tally.css'),
        '[data-astryx-theme="tally"] { --color-text: black; }\n',
      );
      const theme = path.join(other.widgets, 'themes', 'tally');
      fs.mkdirSync(theme, {recursive: true});
      const describe = (/** @type {string} */ text) =>
        fs.writeFileSync(
          path.join(theme, 'tallyTheme.doc.mjs'),
          `/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: 'tally', displayName: 'Tally', description: '${text}', maintained: true};\n`,
        );
      describe('Tally theme for ledgers.');
      fs.writeFileSync(
        path.join(theme, 'tallyTheme.ts'),
        "import {tokens} from './tokens';\nexport const tallyTheme = {name: 'tally', tokens};\n",
      );
      const tokens = (/** @type {string} */ source) =>
        fs.writeFileSync(path.join(theme, 'tokens.ts'), source);
      tokens('export const tokens = {};\n');
      const ask = ['theme', 'list'];
      const fresh = () => run(ask, {tmp: freshTmp(), cwd: other.dir});
      const kept = () => run(ask, {tmp, cwd: other.dir});
      const first = fresh();
      expect(first.stdout).toContain('Tally theme for ledgers.');
      expect(kept()).toEqual(first);
      // Runtimes with synchronous hooks keep one entry; older supported Node
      // versions gather fresh on each run and keep none.
      const keptThemes = themeEntries(tmp);
      expect(keptThemes.size).toBe(hasModuleHooks ? 1 : 0);
      expect(kept()).toEqual(first);
      expect(themeEntries(tmp)).toEqual(keptThemes);
      // An in-place edit to the theme's doc shows on the next run, which
      // discovers the themes again.
      describe('Tally theme, edited.');
      const edited = kept();
      expect(edited.stdout).toContain('Tally theme, edited.');
      expect(edited).toEqual(fresh());
      if (hasModuleHooks) {
        expect(themeEntries(tmp)).not.toEqual(keptThemes);
      } else {
        expect(themeEntries(tmp).size).toBe(0);
      }
      // So does an edit to a module the theme imports that breaks it.
      tokens("export {tokens} from './missing';\n");
      const broken = kept();
      expect(broken).toEqual(fresh());
      expect(broken).not.toEqual(edited);
    } finally {
      fs.rmSync(other.dir, {recursive: true, force: true});
    }
  }, 180_000);

  it('lets docs read the kept checks, and shows a topic edit on the very next call', () => {
    const tmp = keptTmp('docs');
    const other = makeProject();
    try {
      fs.writeFileSync(
        path.join(other.widgets, 'astryx.integration.mjs'),
        `export default { docs: './docs' };\n`,
      );
      fs.mkdirSync(path.join(other.widgets, 'docs'));
      const topic = (/** @type {string} */ text) =>
        fs.writeFileSync(
          path.join(other.widgets, 'docs', 'deploying.doc.mjs'),
          `export const docs = {type: 'generic', name: 'deploying', title: 'Deploying', description: 'How to deploy.', sections: [{title: 'Overview', content: [{type: 'prose', text: '${text}'}]}]};\n`,
        );
      topic('Ship it on Tuesdays.');
      const ask = ['docs', 'deploying'];
      const first = run(ask, {tmp: freshTmp(), cwd: other.dir});
      expect(first.stdout).toContain('Ship it on Tuesdays.');
      expect(run(ask, {tmp, cwd: other.dir})).toEqual(first);
      // docs keeps the integration's check results only when module reads can be recorded.
      const kept = issuesEntries(tmp);
      if (hasModuleHooks) {
        expect(kept.size).toBeGreaterThan(0);
      } else {
        expect(kept.size).toBe(0);
      }
      expect(run(ask, {tmp, cwd: other.dir})).toEqual(first);
      expect(issuesEntries(tmp)).toEqual(kept);
      // An in-place edit to the topic shows on the very next call.
      topic('Ship it on Thursdays.');
      const edited = run(ask, {tmp, cwd: other.dir});
      expect(edited.stdout).toContain('Ship it on Thursdays.');
      expect(edited).toEqual(run(ask, {tmp: freshTmp(), cwd: other.dir}));
    } finally {
      fs.rmSync(other.dir, {recursive: true, force: true});
    }
  }, 180_000);

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
