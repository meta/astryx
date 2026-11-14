// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A published CLI keeps the catalog `search` and `build` gather between runs
 * (foundation/fs/gather-cache.mjs) and uses it only while nothing it read has
 * changed. This file: a kept catalog keeps the component list, template
 * discovery, an integration's themes, doctor's theme-wiring scan and docs
 * checks, finds an edit to any of them, and is skipped silently when its
 * folder cannot be used.
 * Each case's answer from a kept catalog must equal a fresh gather's.
 */

import {describe, expect, it} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
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

  it.skipIf(!hasModuleHooks)(
    "lets doctor --built read doctor's kept checks back, and checks the build on every run",
    () => {
      const tmp = keptTmp('doctor-built');
      const other = makeProject();
      try {
        const dist = path.join(other.dir, 'dist');
        fs.mkdirSync(dist);
        fs.writeFileSync(
          path.join(dist, 'index.html'),
          '<html><head><link rel="stylesheet" href="app.css"></head><body></body></html>\n',
        );
        const css = path.join(dist, 'app.css');
        fs.writeFileSync(css, '.page { color: red; }\n');
        /** @param {{stdout: string}} result */
        const checks = result =>
          /** @type {{id: string}[]} */ (JSON.parse(result.stdout).data.checks);
        // The cache row names the folder and what it holds, which differ
        // between a kept and a fresh temp folder.
        /** @param {{id: string}[]} list */
        const withoutCacheRow = list =>
          list.filter(check => check.id !== 'gather-cache');
        /** @param {{id: string}[]} list */
        const usage = list =>
          list.find(check => check.id === 'built-astryx-usage');
        const built = (/** @type {string} */ at) =>
          checks(run(['doctor', '--built', 'dist'], {tmp: at, cwd: other.dir}));

        run(['doctor'], {tmp, cwd: other.dir});
        const kept = doctorEntries(tmp);
        expect([...kept.keys()].sort()).toEqual([
          'cli-docs',
          'docs-progressive-disclosure',
          'docs-tree',
        ]);
        // A kept entry read back is marked as just used; date them an hour
        // back to see it.
        const dir = path.join(tmp, CACHE_NAME);
        const hourAgo = new Date(Date.now() - 3600_000);
        /** @returns {number[]} */
        const doctorTimes = () =>
          fs
            .readdirSync(dir)
            .map(name => path.join(dir, name))
            .filter(file => [...kept.values()].includes(fs.statSync(file).ino))
            .map(file => fs.statSync(file).mtimeMs);
        for (const name of fs.readdirSync(dir)) {
          fs.utimesSync(path.join(dir, name), hourAgo, hourAgo);
        }
        // doctor --built reads the same entries back and answers as a fresh
        // doctor --built does.
        const first = built(tmp);
        expect(doctorEntries(tmp)).toEqual(kept);
        const times = doctorTimes();
        expect(times).toHaveLength(3);
        for (const time of times)
          expect(time).toBeGreaterThan(hourAgo.getTime());
        expect(withoutCacheRow(first)).toEqual(
          withoutCacheRow(built(freshTmp())),
        );
        expect(usage(first)).toMatchObject({status: 'fail'});
        // The build itself is checked on every run: an edit shows on the very
        // next one, as on a fresh run, and leaves the kept checks as they were.
        fs.writeFileSync(css, '@layer astryx-base { .page { color: red; } }\n');
        const edited = built(tmp);
        expect(usage(edited)).toMatchObject({status: 'pass'});
        expect(withoutCacheRow(edited)).toEqual(
          withoutCacheRow(built(freshTmp())),
        );
        expect(doctorEntries(tmp)).toEqual(kept);
      } finally {
        fs.rmSync(other.dir, {recursive: true, force: true});
      }
    },
    180_000,
  );

  it.skipIf(!hasModuleHooks)(
    'answers a doctor integration check as a fresh run does, run after run',
    () => {
      const tmp = keptTmp('doctor-integration');
      const other = makeProject();
      try {
        const validate = (/** @type {string} */ at) =>
          run(['doctor', 'integration', 'validate'], {
            tmp: at,
            cwd: other.widgets,
          });
        const fresh = validate(freshTmp());
        expect(validate(tmp)).toEqual(fresh);
        expect(validate(tmp)).toEqual(fresh);
        expect(doctorEntries(tmp).size).toBe(0);
      } finally {
        fs.rmSync(other.dir, {recursive: true, force: true});
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
});
