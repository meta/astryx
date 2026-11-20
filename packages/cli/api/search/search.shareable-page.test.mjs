// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file In an Astryx project (one that installs or declares Core or the CLI),
 * and outside any package, `astryx search` returns the experimental guides
 * for sharing a page as one HTML file, one entry each, and still leaves every
 * other experimental doc out. In a package without Astryx it answers without
 * them (spec:AST-017 FR27).
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {runCli} from '../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {search} from './search.mjs';
import {exportSearchIndex, rankSearchIndex} from './search-index.mjs';

/** The guides search returns while experimental (they set `searchable`). */
const GUIDES = new Set([
  'cli/experimental/share-a-page',
  'cli/experimental/export-pages',
]);

/** @type {string} */
let tmp;
/** @type {string} */
let astryxApp;
/** @type {string} */
let plainApp;
/** @type {string} */
let outside;
/** @type {string} */
let declared;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-share-guides-'));
  astryxApp = makeLinkedFixture('astryx-share-guides-app-', [
    '@astryxdesign/core',
  ]);
  // A fresh clone: it declares Core and has installed nothing yet.
  declared = path.join(tmp, 'declared');
  fs.mkdirSync(declared, {recursive: true});
  fs.writeFileSync(
    path.join(declared, 'package.json'),
    JSON.stringify({
      name: 'declared',
      private: true,
      dependencies: {'@astryxdesign/core': '*'},
    }),
  );
  outside = path.join(tmp, 'outside');
  fs.mkdirSync(outside, {recursive: true});
  plainApp = path.join(tmp, 'plain');
  fs.mkdirSync(plainApp, {recursive: true});
  fs.writeFileSync(
    path.join(plainApp, 'package.json'),
    JSON.stringify({
      name: 'plain',
      private: true,
      dependencies: {react: '^19.2.0'},
    }),
  );
});

afterAll(() => {
  removeLinkedFixture(astryxApp);
  fs.rmSync(tmp, {recursive: true, force: true});
});

/** @param {string} query @param {string} cwd */
async function docs(query, cwd) {
  const {status, stdout} = await runCli(
    ['search', ...query.split(' '), '--type', 'doc', '--json'],
    cwd,
  );
  expect(status).toBe(0);
  return /** @type {Array<{name: string, command: string}>} */ (
    JSON.parse(stdout).data.results
  );
}

/** @param {{command: string}} result */
const isGuide = result =>
  [...GUIDES].some(route => result.command.includes(`docs ${route}`));

describe('search and the shareable-page guides', () => {
  it.each([...GUIDES])('%s is a docs route', async route => {
    const {status} = await runCli(['docs', route, '--index'], astryxApp);
    expect(status).toBe(0);
  });

  it.each(['share', 'single file', 'static html', 'artifact', 'snapshot'])(
    'in an Astryx project, "%s" returns a shareable-page guide first',
    async query => {
      const [first] = await docs(query, astryxApp);
      expect(isGuide(first)).toBe(true);
    },
  );

  it.each(['share', 'single file', 'static html'])(
    'outside any package, "%s" returns a shareable-page guide first',
    async query => {
      const [first] = await docs(query, outside);
      expect(isGuide(first)).toBe(true);
    },
  );

  it('in a project that declares Core and has installed nothing, "single file" returns a guide first', async () => {
    const [first] = await docs('single file', declared);
    expect(isGuide(first)).toBe(true);
  });

  it.each(['share', 'single file', 'static html'])(
    'in a project without Astryx, "%s" returns no shareable-page guide',
    async query => {
      expect((await docs(query, plainApp)).filter(isGuide)).toEqual([]);
    },
  );

  it.each(['plain', 'astryx', 'outside'])(
    'in a %s folder, an exported index ranks "single file" as search() does',
    async kind => {
      const cwd =
        kind === 'plain' ? plainApp : kind === 'outside' ? outside : astryxApp;
      const index = JSON.parse(JSON.stringify(await exportSearchIndex({cwd})));
      const expected = JSON.parse(
        JSON.stringify(await search('single file', {cwd, limit: 50})),
      );
      const actual = JSON.parse(
        JSON.stringify(
          await rankSearchIndex('single file', index, {limit: 50}),
        ),
      );
      expect(actual).toEqual(expected);
    },
    120_000,
  );

  it('a shareable-page guide answers as one entry, never by a section', async () => {
    for (const query of ['share', 'single file', 'warnings', 'get it back']) {
      for (const result of await docs(query, astryxApp)) {
        if (!isGuide(result)) continue;
        expect(result).not.toHaveProperty('section');
      }
    }
  });

  it('every other experimental doc stays out', async () => {
    for (const query of ['icon set', 'theme editor', 'experimental', 'share']) {
      for (const result of await docs(query, astryxApp)) {
        if (isGuide(result)) continue;
        expect(result.name).not.toMatch(/experimental/);
        expect(result.command).not.toMatch(/experimental/);
      }
    }
  });
});
