// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A stored search index ranks as the folder's search does: an index of
 * the whole project, and per-package indexes plus a Core index when no package
 * replaces another's docs, ranked by `rankSearchIndex`, answer every golden
 * query with the results, order, and scores `search` gives in that project.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {search} from './search.mjs';
import {exportSearchIndex, rankSearchIndex} from './search-index.mjs';

const SLOW = 120_000;
const packages = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const INTEGRATIONS = ['richtext', 'lab'];
const GOLDEN = [
  'button',
  'date picker',
  'rich text editor',
  'data table with filters',
  'modal dialog',
  'sidebar navigation',
  'theme',
  'empty state',
  'avatar group',
  'toast notification',
  'useDebounce',
  'search input',
  'chart',
  'settings page',
  'comment thread',
];

/**
 * @param {string} name
 * @param {string[]} linked
 */
function project(name, linked) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `astryx-${name}-`));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name,
      dependencies: Object.fromEntries(
        linked.map(pkg => [`@astryxdesign/${pkg}`, '*']),
      ),
    }),
  );
  const scope = path.join(dir, 'node_modules', '@astryxdesign');
  fs.mkdirSync(scope, {recursive: true});
  for (const pkg of linked)
    fs.symlinkSync(path.join(packages, pkg), path.join(scope, pkg), 'dir');
  return dir;
}

/** @param {{data: {results: any[], matchCount: number}}} response */
const ranked = response => ({
  matchCount: response.data.matchCount,
  results: response.data.results.map(r => [r.domain, r.package, r.name, r.score]),
});

describe('rankSearchIndex over stored indexes', () => {
  /** @type {string[]} */
  const dirs = [];
  /** @type {string} */
  let full;
  /** @type {import('./search.type.mjs').SearchIndex[]} */
  let indexes;
  beforeAll(async () => {
    full = project('full', ['core', ...INTEGRATIONS]);
    const coreOnly = project('core-only', ['core']);
    dirs.push(full, coreOnly);
    indexes = [JSON.parse(JSON.stringify(await exportSearchIndex({cwd: coreOnly})))];
    for (const pkg of INTEGRATIONS) {
      const alone = project(pkg, ['core', pkg]);
      dirs.push(alone);
      const index = await exportSearchIndex({
        cwd: alone,
        package: `@astryxdesign/${pkg}`,
      });
      // Stored and read back, as a catalog keeps it.
      indexes.push(JSON.parse(JSON.stringify(index)));
    }
  }, SLOW);
  afterAll(() => {
    for (const dir of dirs) fs.rmSync(dir, {recursive: true, force: true});
  });

  it.each(GOLDEN)(
    '`%s` from the whole-project index answers as search() does there',
    async query => {
      const whole = JSON.parse(JSON.stringify(await exportSearchIndex({cwd: full})));
      const expected = ranked(await search(query, {cwd: full, limit: 50}));
      const actual = ranked(await rankSearchIndex(query, whole, {limit: 50}));
      expect(actual).toEqual(expected);
    },
    SLOW,
  );

  it.each(GOLDEN)(
    '`%s` from per-package indexes answers as search() does in the project',
    async query => {
      const expected = ranked(await search(query, {cwd: full, limit: 50}));
      const actual = ranked(await rankSearchIndex(query, indexes, {limit: 50}));
      expect(actual).toEqual(expected);
    },
    SLOW,
  );

  it(
    'a domain restriction answers as search() does',
    async () => {
      const expected = ranked(
        await search('editor', {cwd: full, type: 'template', limit: 50}),
      );
      const actual = ranked(
        await rankSearchIndex('editor', indexes, {type: 'template', limit: 50}),
      );
      expect(actual).toEqual(expected);
    },
    SLOW,
  );

  it('a package index holds only that package, with no folder paths', () => {
    const index = indexes[1];
    expect(index.candidates.length).toBeGreaterThan(0);
    for (const candidate of index.candidates) {
      expect(candidate._package).toBe('@astryxdesign/richtext');
      expect(candidate).not.toHaveProperty('_docPath');
    }
  });

  it('refuses an index made by another CLI version', async () => {
    const stale = {...indexes[0], version: '0.0.0-other'};
    await expect(rankSearchIndex('button', [stale])).rejects.toMatchObject({
      code: 'ERR_INVALID_ARGUMENT',
    });
  });

  it('refuses a value that is not an index', async () => {
    await expect(
      rankSearchIndex('button', /** @type {any} */ ([{candidates: null}])),
    ).rejects.toMatchObject({code: 'ERR_INVALID_ARGUMENT'});
  });

  it('refuses an empty package name', async () => {
    await expect(exportSearchIndex({cwd: full, package: ' '})).rejects.toMatchObject(
      {code: 'ERR_INVALID_ARGUMENT'},
    );
  });
});
