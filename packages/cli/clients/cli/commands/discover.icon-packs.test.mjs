// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx discover` lists the icon sets a project could add even where
 * icon features are off, so an app can compare them before it picks one
 * (spec:AST-084 FR17): the Available list, a search, and the item page with
 * the descriptor's text, how many of the CLI's meanings the set maps (text
 * only), the install command, and the `experimental icon use` command that
 * picks the set.
 * A set's definitions stay behind the opt-in. With no icon set in the
 * catalog, the output is the same as in a project that opts in. Driven
 * through the real CLI against hermetic projects whose astryx.config sets
 * `discover`; saved copies go to a temp cache directory.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {writeIconSetProject} from '../../../test-utils/icon-set-fixture.mjs';

const PACK = {
  package: '@acme/glyph-pack',
  integration: 'acme-glyph-pack',
  aliases: [],
  latest: '1.2.0',
  description: 'Icons for apps',
  versions: [
    {
      version: '1.2.0',
      publishedAt: '2026-09-20T00:00:00.000Z',
      prerelease: false,
      status: 'ok',
    },
  ],
  contributions: [
    {
      kind: 'icon-set',
      name: 'glyphs',
      title: 'Acme Glyphs',
      summary: 'Outline icons drawn on a 24px grid.',
      license: 'MIT',
      iconCount: 412,
      definitions: ['close', 'search'],
    },
  ],
};

const CHARTS = {
  package: '@acme/charts',
  integration: 'acme-charts',
  aliases: [],
  latest: '2.0.0',
  versions: [
    {
      version: '2.0.0',
      publishedAt: '2026-09-20T00:00:00.000Z',
      prerelease: false,
      status: 'ok',
    },
  ],
  contributions: [{kind: 'component', name: 'BarChart', summary: 'Bars.'}],
};

/**
 * @param {object[]} packages
 * @param {boolean} optIn
 * @param {string[]} [integrations]
 */
const config = (packages, optIn, integrations = []) => `
const packages = ${JSON.stringify(packages)};
export default {
  ${optIn ? "experimental: {iconSet: 'glyphs'}," : ''}
  ${integrations.length > 0 ? `integrations: ${JSON.stringify(integrations)},` : ''}
  async discover({package: name}) {
    return {
      schemaVersion: 1,
      source: {name: 'Test catalog', generatedAt: '2026-09-30T00:00:00.000Z', complete: true},
      packages: packages.filter(p => name == null || p.package === name),
    };
  },
};
`;

// Each case spawns the CLI several times.
const TIMEOUT = 60_000;

let tmpDir;
/** @type {Record<string, string | undefined>} */
let savedEnv;

/**
 * A project whose discover source lists `packages`.
 * @param {string} name
 * @param {object[]} packages
 * @param {boolean} [optIn]
 */
function project(name, packages, optIn = false) {
  const dir = path.join(tmpDir, name);
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      dependencies: {'@astryxdesign/core': '*'},
    }),
  );
  fs.writeFileSync(
    path.join(dir, 'astryx.config.mjs'),
    config(packages, optIn),
  );
  return dir;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-discover-packs-'));
  savedEnv = {
    HOME: process.env.HOME,
    XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
  };
  process.env.HOME = path.join(tmpDir, 'home');
  process.env.XDG_CACHE_HOME = path.join(tmpDir, 'cache');
  process.env.LOCALAPPDATA = path.join(tmpDir, 'localappdata');
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * @param {string} cwd
 * @param {string[]} args
 */
async function run(cwd, args) {
  const r = await runCli(args, {cwd});
  expect(r.status, r.stderr).toBe(0);
  return r.stdout;
}

describe('discover lists icon packs before a project opts in', () => {
  it(
    'lists the pack and finds its set, with the command that picks it',
    async () => {
      const cwd = project('app', [PACK, CHARTS]);
      const list = JSON.parse(await run(cwd, ['discover', '--json']));
      expect(list.meta.available).toContainEqual(
        expect.objectContaining({
          package: '@acme/glyph-pack',
          iconSets: ['glyphs'],
        }),
      );
      expect(await run(cwd, ['discover'])).toMatch(
        /^Then use an icon set it adds: .*experimental icon use <set>, for example .*experimental icon use @acme\/glyph-pack\/glyphs$/m,
      );
      const found = JSON.parse(
        await run(cwd, ['discover', 'glyphs', '--json']),
      );
      expect(found.data.matches[0]).toEqual({
        package: '@acme/glyph-pack',
        component: 'glyphs',
        kind: 'icon-set',
        installed: false,
        title: 'Acme Glyphs',
        summary: 'Outline icons drawn on a 24px grid.',
        experimental: true,
      });
      const row = await run(cwd, ['discover', 'glyphs']);
      expect(row).toMatch(
        /discover @acme\/glyph-pack\/glyphs {2}\(icon-set, not installed\) \[experimental\]$/m,
      );
      expect(await run(cwd, ['discover', '--available'])).toMatch(
        /^iconSets: +glyphs \[experimental\]$/m,
      );
      expect(
        list.meta.available.find(
          (/** @type {any} */ e) => e.package === '@acme/glyph-pack',
        ).experimentalFields,
      ).toEqual(['iconSets']);
      // The package page marks its sets the same way.
      const pkgText = await run(cwd, ['discover', '@acme/glyph-pack']);
      expect(pkgText).toMatch(/^iconSets: +glyphs \[experimental\]$/m);
      expect(pkgText).not.toMatch(/experimentalFields/);
      const pkgJson = JSON.parse(
        await run(cwd, ['discover', '@acme/glyph-pack', '--json']),
      );
      expect(pkgJson.data).toMatchObject({
        iconSets: ['glyphs'],
        experimentalFields: ['iconSets'],
      });
    },
    TIMEOUT,
  );

  it(
    'shows the set page with its coverage and the use command, keeping its definitions behind the opt-in',
    async () => {
      const cwd = project('app', [PACK]);
      const page = JSON.parse(
        await run(cwd, ['discover', '@acme/glyph-pack/glyphs', '--json']),
      );
      expect(page.data).toMatchObject({
        kind: 'icon-set',
        name: 'glyphs',
        title: 'Acme Glyphs',
        license: 'MIT',
        iconCount: 412,
        experimental: true,
        installed: false,
      });
      expect(page.data.install).toContain('@acme/glyph-pack');
      // The coverage is text only; the JSON lists no definitions.
      expect(page.data).not.toHaveProperty('definitions');

      const text = await run(cwd, ['discover', '@acme/glyph-pack/glyphs']);
      expect(text).toMatch(/^name: +glyphs \[experimental\]$/m);
      expect(text).not.toMatch(/^experimental:/m);
      expect(text).toMatch(/^definitions: +2\/\d+$/m);
      expect(text).toMatch(/^Then use its icon set:$/m);
      expect(text).toMatch(/experimental icon use @acme\/glyph-pack\/glyphs$/m);

      const optedIn = project('opted-in', [PACK], true);
      const full = JSON.parse(
        await run(optedIn, ['discover', '@acme/glyph-pack/glyphs', '--json']),
      );
      expect(full.data.definitions).toEqual(['close', 'search']);
    },
    TIMEOUT,
  );

  it(
    'still refuses --type icon-set without the opt-in',
    async () => {
      const cwd = project('app', [PACK]);
      const r = await runCli(['discover', '--type', 'icon-set', '--json'], {
        cwd,
      });
      expect(r.status).not.toBe(0);
    },
    TIMEOUT,
  );

  it(
    'prints the same output as an opted-in project when the catalog has no icon set',
    async () => {
      const plain = project('plain', [CHARTS]);
      const optedIn = project('opted-in', [CHARTS], true);
      for (const args of [
        ['discover'],
        ['discover', '--json'],
        ['discover', 'chart'],
        ['discover', '@acme/charts/BarChart', '--json'],
      ]) {
        const a = await run(plain, args);
        expect(a).toBe(await run(optedIn, args));
        expect(a).not.toMatch(/icon-set|iconSets|icon use/);
      }
    },
    TIMEOUT,
  );

  it(
    'keeps icon-set fields off other kinds: their item pages read as without them',
    async () => {
      const marked = {
        ...CHARTS,
        contributions: [
          {
            ...CHARTS.contributions[0],
            iconCount: 3,
            license: 'MIT',
            definitions: ['close'],
          },
          {
            kind: 'template',
            name: 'pages/Report',
            iconCount: 1,
            definitions: ['search'],
          },
        ],
      };
      const bare = {
        ...CHARTS,
        contributions: [
          CHARTS.contributions[0],
          {kind: 'template', name: 'pages/Report'},
        ],
      };
      const withFields = project('with-fields', [marked]);
      const without = project('without', [bare]);
      for (const args of [
        ['discover', '@acme/charts/BarChart'],
        ['discover', '@acme/charts/BarChart', '--json'],
        ['discover', '@acme/charts/pages/Report'],
        ['discover', '@acme/charts/pages/Report', '--json'],
        ['discover', '--json'],
      ]) {
        expect(await run(withFields, args)).toBe(await run(without, args));
      }
    },
    TIMEOUT,
  );

  it(
    'answers no installed set while icon features are off, and other stable commands still hide sets',
    async () => {
      const cwd = writeIconSetProject(path.join(tmpDir, 'installed'), {
        config: null,
      });
      // The installed version declares no icon sets, so icon features stay
      // off; only the catalog says the package has a set.
      fs.writeFileSync(
        path.join(
          cwd,
          'node_modules',
          '@acme',
          'glyphs',
          'astryx.integration.mjs',
        ),
        'export default {};\n',
      );
      const pack = {
        ...PACK,
        package: '@acme/glyphs',
        integration: '@acme/glyphs',
      };
      fs.writeFileSync(
        path.join(cwd, 'astryx.config.mjs'),
        config([pack], false, ['@acme/glyphs']),
      );
      const page = await runCli(['discover', '@acme/glyphs/glyphs', '--json'], {
        cwd,
      });
      expect(page.status).not.toBe(0);
      expect(page.stdout).not.toContain('"installed": true');
      expect(page.stdout).not.toContain('experimental icon');
      // Nor does another version of the installed package list its sets.
      const other = JSON.parse(
        await run(cwd, ['discover', '@acme/glyphs@1.2.0', '--json']),
      );
      expect(other.data).not.toHaveProperty('iconSets');
      const list = JSON.parse(await run(cwd, ['discover', '--json']));
      expect(
        list.data.find((/** @type {any} */ e) => e.name === '@acme/glyphs'),
      ).not.toHaveProperty('iconSets');
      // `astryx search` never lists an icon set.
      const found = JSON.parse(await run(cwd, ['search', 'glyphs', '--json']));
      expect(
        found.data.results.filter(
          (/** @type {any} */ r) =>
            r.name === 'glyphs' || /icon-set/u.test(JSON.stringify(r)),
        ),
      ).toEqual([]);
    },
    TIMEOUT,
  );

  it(
    "keeps search's discover line off icon sets while icon features are off",
    async () => {
      const HINT = 'More in packages you could add';
      const off = project('hint-off', [PACK, CHARTS]);
      expect((await runCli(['discover', '--json'], {cwd: off})).status).toBe(0);
      // Only the pack's set matches "outline": search is a stable command, so
      // its line does not point at it.
      expect(await run(off, ['search', 'outline'])).not.toContain(HINT);
      expect(await run(off, ['search', 'bar', 'chart'])).toContain(HINT);
      // Where icon features are on, the set counts like any other item.
      const on = project('hint-on', [PACK, CHARTS], true);
      expect((await runCli(['discover', '--json'], {cwd: on})).status).toBe(0);
      expect(await run(on, ['search', 'outline'])).toContain(HINT);
    },
    TIMEOUT,
  );
});
