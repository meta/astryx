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
      // Search read the saved copy; it did not call the source.
      expect(fs.existsSync(marker)).toBe(false);
    },
    TIMEOUT,
  );
});
