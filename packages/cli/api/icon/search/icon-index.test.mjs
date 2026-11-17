// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `exportIconIndex()` and `rankIconIndex()`: a stored index answers
 * exactly as `icon()` does in the folder it was made in.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {icon} from '../icon.mjs';
import {exportIconIndex, rankIconIndex} from './icon-index.mjs';
import {cliVersion} from '../../../foundation/release/run-context.mjs';
import {
  definitionSource,
  glyphsData,
  writeIconSetProject,
} from '../../../test-utils/icon-set-fixture.mjs';

/** @type {string} */
let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-index-'));
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/** Three sets in two packages, one with its own definition, one withdrawn. */
function multiSetProject(config = {}) {
  const lines = glyphsData();
  lines.icons = lines.icons.map(each => ({
    ...each,
    words: [...each.words].reverse(),
  }));
  lines.map = {close: 'trash', search: 'search'};
  return writeIconSetProject(tmp, {
    packages: [
      {},
      {
        name: '@acme/lines',
        data: {...lines, module: '@acme/lines'},
        definitions: {
          rubbish: definitionSource('rubbish', {words: ['bin', 'litter']}),
        },
      },
      {name: '@acme/broken', data: '{nope'},
    ],
    config,
  });
}

/**
 * Every word and id the fixture's icons carry, their parts, prefixes,
 * infixes, plurals, and a few phrases and misses.
 */
function queries() {
  const words = new Set();
  for (const each of glyphsData().icons) {
    for (const word of [each.id, ...each.words]) {
      words.add(word);
      for (const part of word.split(/[\s-]+/u)) words.add(part);
    }
  }
  const out = new Set();
  for (const word of words) {
    out.add(word);
    out.add(`${word}s`);
    out.add(word.toUpperCase());
    for (let n = 2; n < word.length; n++) out.add(word.slice(0, n));
    if (word.length > 4) out.add(word.slice(1, -1));
  }
  for (const phrase of [
    'an icon for delete',
    'icon to close the dialog',
    'magnifier',
    'rubbish',
    'litter',
    'bin',
    'trash can',
    'home page',
    'zebra',
    'x',
    '  search  ',
  ])
    out.add(phrase);
  return [...out];
}

/** @param {string} cwd @param {string} query @param {object} [options] */
async function both(cwd, query, options = {}) {
  const index = await exportIconIndex({cwd});
  const stored = JSON.parse(JSON.stringify(index));
  const settle = (/** @type {Promise<unknown>} */ p) =>
    p.then(
      value => ({value}),
      (/** @type {any} */ error) => ({
        error: {code: error.code, message: error.message},
      }),
    );
  return {
    direct: await settle(icon(query, {cwd, ...options})),
    stored: await settle(rankIconIndex(query, stored, options)),
  };
}

describe('rankIconIndex answers as icon() does where the index was made', () => {
  it('for every query, with and without a project set', async () => {
    for (const config of [{}, {experimental: {iconSet: 'lines'}}]) {
      const cwd = multiSetProject(config);
      const index = JSON.parse(JSON.stringify(await exportIconIndex({cwd})));
      const list = queries();
      expect(list.length).toBeGreaterThan(100);
      for (const query of list) {
        expect(await rankIconIndex(query, index), query).toEqual(
          await icon(query, {cwd}),
        );
      }
      fs.rmSync(tmp, {recursive: true, force: true});
      fs.mkdirSync(tmp);
    }
  });

  it('with `set` and `limit`, and with the errors icon() gives', async () => {
    const cwd = multiSetProject();
    for (const [query, options] of /** @type {Array<[string, object]>} */ ([
      ['close', {set: 'lines'}],
      ['close', {set: '@acme/glyphs/glyphs'}],
      ['delete', {limit: 1}],
      ['close', {set: 'broken'}],
      ['close', {set: 'nope'}],
      ['close', {limit: 0}],
      ['close', {limit: null}],
      ['close', {limit: 1.5}],
      ['', {}],
      [/** @type {any} */ (undefined), {}],
      [/** @type {any} */ (7), {}],
    ])) {
      const {direct, stored} = await both(cwd, query, options);
      expect(stored, `${query} ${JSON.stringify(options)}`).toEqual(direct);
    }
  });

  it('with `package`, keeps only that package and answers as a folder with it alone', async () => {
    const cwd = multiSetProject();
    const index = await exportIconIndex({cwd, package: '@acme/lines'});
    expect(index.sets.map(each => each.package)).toEqual(['@acme/lines']);
    expect(index.withdrawn).toEqual([]);
    const alone = writeIconSetProject(path.join(tmp, 'alone'), {
      packages: [
        {
          name: '@acme/lines',
          data: {...index.sets[0].data},
          definitions: {
            rubbish: definitionSource('rubbish', {words: ['bin', 'litter']}),
          },
        },
      ],
    });
    for (const query of ['close', 'bin', 'search', 'delete']) {
      expect(await rankIconIndex(query, index)).toEqual(
        await icon(query, {cwd: alone}),
      );
    }
  });

  it('ranks several indexes as one list; equal scores keep the order given', async () => {
    const cwd = multiSetProject();
    const glyphs = await exportIconIndex({cwd, package: '@acme/glyphs'});
    const lines = await exportIconIndex({cwd, package: '@acme/lines'});
    const sets = async (/** @type {any[]} */ indexes) =>
      (await rankIconIndex('search', indexes)).data.matches.map(m => m.set);
    expect(await sets([glyphs, lines])).toEqual(['glyphs', 'lines']);
    expect(await sets([lines, glyphs])).toEqual(['lines', 'glyphs']);
  });

  it('holds no folder paths and records the CLI version', async () => {
    const cwd = multiSetProject();
    const index = await exportIconIndex({cwd});
    expect(index.version).toBe(cliVersion());
    expect(JSON.stringify(index)).not.toContain(tmp);
  });
});

describe('rankIconIndex refuses what it cannot rank', () => {
  it('an index from another CLI version, or not an index', async () => {
    const cwd = multiSetProject();
    const index = await exportIconIndex({cwd});
    await expect(
      rankIconIndex('close', {...index, version: '0.0.1'}),
    ).rejects.toMatchObject({
      code: 'ERR_INVALID_ARGUMENT',
      message: expect.stringMatching(/made by CLI 0\.0\.1/u),
    });
    await expect(
      rankIconIndex('close', /** @type {any} */ ({version: index.version})),
    ).rejects.toMatchObject({code: 'ERR_INVALID_ARGUMENT'});
  });

  it('an empty query or a bad limit', async () => {
    const index = await exportIconIndex({cwd: multiSetProject()});
    await expect(rankIconIndex('  ', index)).rejects.toMatchObject({
      code: 'ERR_MISSING_ARGUMENT',
    });
    await expect(
      rankIconIndex('close', index, {limit: 1.5}),
    ).rejects.toMatchObject({code: 'ERR_INVALID_ARGUMENT'});
  });

  it('a query that names one icon, which icon() reads as that icon', async () => {
    const index = await exportIconIndex({cwd: multiSetProject()});
    await expect(rankIconIndex('glyphs/trash', index)).rejects.toMatchObject({
      code: 'ERR_INVALID_ARGUMENT',
      message: expect.stringMatching(/names one icon/u),
    });
  });

  it('exportIconIndex refuses a package that is not a name', async () => {
    await expect(
      exportIconIndex({cwd: multiSetProject(), package: ' '}),
    ).rejects.toMatchObject({code: 'ERR_INVALID_ARGUMENT'});
  });
});
