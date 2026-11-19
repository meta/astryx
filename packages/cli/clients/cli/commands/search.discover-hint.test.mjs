// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx search` points at `discover` only when discover has something
 * to add: with a saved copy of a discover catalog, the line is printed only
 * when a package in it that the project could add matches the query. With no
 * saved copy, the line is printed as always. Search never calls a discover
 * source. Driven through the real CLI against a hermetic project whose
 * astryx.config sets `discover`; saved copies go to a temp cache directory.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {runCli} from '../../../test-utils/run-cli.mjs';

/** @param {string} marker a file the source writes each time it is called */
const config = marker => `
import {appendFileSync} from 'node:fs';
export default {
  async discover() {
    appendFileSync(${JSON.stringify(marker)}, 'called\\n');
    return {
      schemaVersion: 1,
      source: {name: 'Test catalog', generatedAt: '2026-09-30T00:00:00.000Z', complete: true},
      packages: [
        {
          package: '@acme/charts',
          integration: 'acme-charts',
          aliases: [],
          latest: '1.0.0',
          description: 'Charts for dashboards',
          versions: [
            {version: '1.0.0', publishedAt: '2026-09-20T00:00:00.000Z', prerelease: false, status: 'ok'},
          ],
          contributions: [
            {kind: 'component', name: 'BarChart', summary: 'Compare values across categories.'},
          ],
        },
      ],
    };
  },
};
`;

const HINT = 'More in packages you could add:';
// Generous: each case spawns the CLI several times.
const TIMEOUT = 60_000;

let tmpDir;
let project;
let marker;
/** @type {Record<string, string | undefined>} */
let savedEnv;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-search-hint-'));
  project = path.join(tmpDir, 'project');
  marker = path.join(tmpDir, 'source-calls.txt');
  fs.mkdirSync(project, {recursive: true});
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({name: 'proj', version: '1.0.0'}),
  );
  fs.writeFileSync(path.join(project, 'astryx.config.mjs'), config(marker));
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

/** @param {string[]} args */
async function search(args) {
  const r = await runCli(['search', ...args], {cwd: project});
  expect(r.status).toBe(0);
  return r.stdout;
}

/** Output without the discover line and the blank line before it. */
const withoutHint = (/** @type {string} */ out) =>
  out.replace(/\n\nMore in packages you could add: .*$/m, '');

describe('discover reads every word of an unquoted query', () => {
  it(
    'finds an item by the words of its name and summary, typed unquoted',
    async () => {
      const r = await runCli(['discover', 'chart', 'categories', '--json'], {
        cwd: project,
      });
      expect(r.status).toBe(0);
      const {data} = JSON.parse(r.stdout);
      expect(data.query).toBe('chart categories');
      expect(data.matches.map((/** @type {any} */ m) => m.component)).toEqual([
        'BarChart',
      ]);
    },
    TIMEOUT,
  );

  it(
    'opens an item from a package path and its item typed as two words',
    async () => {
      const r = await runCli(
        ['discover', '@acme/charts', 'BarChart', '--json'],
        {cwd: project},
      );
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(JSON.parse(r.stdout)).toMatchObject({
        type: 'discover.item',
        data: {package: '@acme/charts', name: 'BarChart'},
      });
      // A scope alone is no package name: its words are free text.
      const scopeOnly = await runCli(
        ['discover', '@acme', 'charts', '--json'],
        {cwd: project},
      );
      expect(JSON.parse(scopeOnly.stdout)).toMatchObject({
        type: 'discover.search',
        data: {query: '@acme charts'},
      });
      // More than one word after it is free text, searched as one query.
      const more = await runCli(
        ['discover', '@acme/charts', 'bar', 'chart', '--json'],
        {cwd: project},
      );
      expect(more.status, more.stdout + more.stderr).toBe(0);
      expect(JSON.parse(more.stdout)).toMatchObject({
        type: 'discover.search',
        data: {query: '@acme/charts bar chart'},
      });
    },
    TIMEOUT,
  );
});

describe('search points at discover by the saved catalog copy', () => {
  it(
    'prints the line as always when no saved copy exists, and never calls a source',
    async () => {
      expect(await search(['bar', 'chart'])).toContain(HINT);
      expect(await search(['zzqqxx'])).toContain(HINT);
      expect(fs.existsSync(marker)).toBe(false);
    },
    TIMEOUT,
  );

  it(
    'with a saved copy, prints the line only when a package the project could add matches',
    async () => {
      const before = await search(['zzqqxx']);
      const discovered = await runCli(['discover', '--json'], {cwd: project});
      expect(discovered.status).toBe(0);
      fs.rmSync(marker);

      const match = await search(['bar', 'chart']);
      expect(match).toMatch(
        /^More in packages you could add: .*discover 'bar chart'$/m,
      );
      const none = await search(['zzqqxx']);
      expect(none).not.toContain(HINT);
      // Only the line changes.
      expect(none).toBe(withoutHint(before));
      // Hooks never get the line, as before.
      expect(await search(['chart', '--type', 'hook'])).not.toContain(HINT);
      // A search kept to one kind points at discover kept to it, and shows
      // the line only when discover kept to it would answer.
      expect(await search(['bar', 'chart', '--type', 'component'])).toMatch(
        /^More in packages you could add: .*discover 'bar chart' --type component$/m,
      );
      expect(await search(['bar', 'chart', '--type', 'theme'])).not.toContain(
        HINT,
      );
      // The JSON never carries the line.
      const json = await runCli(['--json', 'search', 'bar', 'chart'], {
        cwd: project,
      });
      expect(json.status).toBe(0);
      expect(json.stdout).not.toContain(HINT);
      expect(() => JSON.parse(json.stdout)).not.toThrow();
      // Search read the saved copy; it did not call the source.
      expect(fs.existsSync(marker)).toBe(false);
    },
    TIMEOUT,
  );

  it(
    'agrees with discover when only an integration the project loads answers',
    async () => {
      // The project loads @acme/frob through astryx.config without
      // declaring it, and a source lists the same package: discover counts
      // it as installed, so its catalog items are not something to add.
      const pkgDir = path.join(project, 'node_modules', '@acme', 'frob');
      fs.mkdirSync(path.join(pkgDir, 'components'), {recursive: true});
      fs.writeFileSync(
        path.join(pkgDir, 'package.json'),
        JSON.stringify({name: '@acme/frob', version: '1.0.0'}),
      );
      fs.writeFileSync(
        path.join(pkgDir, 'astryx.integration.mjs'),
        `export default {components: './components'};\n`,
      );
      const frob = {
        package: '@acme/frob',
        integration: 'acme-frob',
        aliases: [],
        latest: '1.0.0',
        versions: [
          {
            version: '1.0.0',
            publishedAt: '2026-09-20T00:00:00.000Z',
            prerelease: false,
            status: 'ok',
          },
        ],
        contributions: [{kind: 'component', name: 'Frobnicator'}],
      };
      fs.writeFileSync(
        path.join(project, 'astryx.config.mjs'),
        config(marker)
          .replace('packages: [', `packages: [${JSON.stringify(frob)},`)
          .replace(
            'export default {',
            "export default {\n  integrations: ['@acme/frob'],",
          ),
      );
      expect(
        (await runCli(['discover', '--json'], {cwd: project})).status,
      ).toBe(0);
      for (const query of ['frobnicator', 'bar chart', 'zzqqxx']) {
        const found = await runCli(['discover', query, '--json'], {
          cwd: project,
        });
        const shown = (await search([query])).includes(HINT);
        expect(shown, query).toBe(found.status === 0);
      }
      expect((await search(['frobnicator'])).includes(HINT)).toBe(false);
    },
    TIMEOUT,
  );

  it(
    "keeps each project's own source copy apart: one project's catalog never answers for another",
    async () => {
      // A second project whose own source lists nothing to add.
      const other = path.join(tmpDir, 'other');
      fs.mkdirSync(other, {recursive: true});
      fs.writeFileSync(
        path.join(other, 'package.json'),
        JSON.stringify({name: 'other', version: '1.0.0'}),
      );
      fs.writeFileSync(
        path.join(other, 'astryx.config.mjs'),
        config(marker).replace(
          /packages: \[[\s\S]*?\n {6}\],\n/,
          'packages: [],\n',
        ),
      );
      const searchIn = async (/** @type {string} */ cwd) => {
        const r = await runCli(['search', 'bar', 'chart'], {cwd});
        expect(r.status).toBe(0);
        return r.stdout.includes(HINT);
      };
      // Each project saves its own copy; the order they run in changes
      // nothing.
      expect(
        (await runCli(['discover', '--json'], {cwd: project})).status,
      ).toBe(0);
      expect((await runCli(['discover', '--json'], {cwd: other})).status).toBe(
        0,
      );
      expect(await searchIn(project)).toBe(true);
      expect(await searchIn(other)).toBe(false);
      expect(
        (await runCli(['discover', '--json'], {cwd: project})).status,
      ).toBe(0);
      expect(await searchIn(other)).toBe(false);
      expect(await searchIn(project)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    'reads the project copy from any folder in the project, with the source down',
    async () => {
      // A source that fails once the test takes its host down.
      const down = path.join(tmpDir, 'down');
      fs.writeFileSync(
        path.join(project, 'astryx.config.mjs'),
        config(marker).replace(
          'async discover() {',
          `async discover() {
    if ((await import('node:fs')).existsSync(${JSON.stringify(down)})) throw new Error('host down');`,
        ),
      );
      expect(
        (await runCli(['discover', '--json'], {cwd: project})).status,
      ).toBe(0);
      // The host goes down; a subfolder still reads the copy the project
      // root saved.
      fs.writeFileSync(down, '');
      const src = path.join(project, 'src');
      fs.mkdirSync(src, {recursive: true});
      const listed = await runCli(['discover', '--json'], {cwd: src});
      expect(listed.status).toBe(0);
      const available = JSON.parse(listed.stdout).meta.available.map(
        (/** @type {{name: string}} */ entry) => entry.name,
      );
      expect(available).toContain('@acme/charts');
      const search = async (/** @type {string[]} */ words) =>
        (await runCli(['search', ...words], {cwd: src})).stdout;
      expect(await search(['bar', 'chart'])).toContain(HINT);
      expect(await search(['qqzzx'])).not.toContain(HINT);
    },
    TIMEOUT,
  );
});
