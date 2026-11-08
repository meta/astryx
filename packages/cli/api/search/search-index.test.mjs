// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A stored search index ranks as the folder's search does: an index of
 * the whole project, and per-package indexes plus a Core index when no package
 * replaces another's docs, ranked by `rankSearchIndex`, answer every golden
 * query with the whole response `search` gives in that project, linked
 * descriptions of an integration's components included.
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
  'AcmeButton',
  'branded press target',
];
const ACME = '@acme/ui';

/** An integration whose component description holds inline doc tokens. */
function writeAcme(dir) {
  const root = path.join(dir, 'node_modules', '@acme', 'ui');
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: ACME,
      version: '1.0.0',
      type: 'module',
      exports: {'./AcmeButton': './src/AcmeButton.tsx'},
    }),
  );
  fs.writeFileSync(
    path.join(root, 'astryx.integration.mjs'),
    "export default {components: './src'};\n",
  );
  fs.writeFileSync(
    path.join(root, 'src', 'AcmeButton.tsx'),
    'export function AcmeButton() { return null; }\n',
  );
  fs.writeFileSync(
    path.join(root, 'src', 'AcmeButton.doc.mjs'),
    `export const docs = ${JSON.stringify({
      name: 'AcmeButton',
      displayName: 'Acme Button',
      category: 'Actions',
      description:
        'AcmeButton is a branded press target. Add it with {@command component AcmeButton}.',
      keywords: ['acme button', 'branded button'],
      props: [],
    })};\n`,
  );
}

/**
 * @param {string} name
 * @param {string[]} linked
 */
function project(name, linked, acme = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `astryx-${name}-`));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name,
      dependencies: Object.fromEntries([
        ...linked.map(pkg => [`@astryxdesign/${pkg}`, '*']),
        ...(acme ? [[ACME, '*']] : []),
      ]),
    }),
  );
  if (acme) writeAcme(dir);
  const scope = path.join(dir, 'node_modules', '@astryxdesign');
  fs.mkdirSync(scope, {recursive: true});
  for (const pkg of linked)
    fs.symlinkSync(path.join(packages, pkg), path.join(scope, pkg), 'dir');
  return dir;
}

/**
 * The whole response, as JSON carries it.
 * @param {unknown} response
 */
const ranked = response => JSON.parse(JSON.stringify(response));

describe('rankSearchIndex over stored indexes', () => {
  /** @type {string[]} */
  const dirs = [];
  /** @type {string} */
  let full;
  /** @type {import('./search.type.mjs').SearchIndex[]} */
  let indexes;
  beforeAll(async () => {
    full = project('full', ['core', ...INTEGRATIONS], true);
    const coreOnly = project('core-only', ['core']);
    dirs.push(full, coreOnly);
    indexes = [
      JSON.parse(JSON.stringify(await exportSearchIndex({cwd: coreOnly}))),
    ];
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
    const acme = project('acme', ['core'], true);
    dirs.push(acme);
    indexes.push(
      JSON.parse(
        JSON.stringify(await exportSearchIndex({cwd: acme, package: ACME})),
      ),
    );
  }, SLOW);
  afterAll(() => {
    for (const dir of dirs) fs.rmSync(dir, {recursive: true, force: true});
  });

  it.each(GOLDEN)(
    '`%s` from the whole-project index answers as search() does there',
    async query => {
      const whole = JSON.parse(
        JSON.stringify(await exportSearchIndex({cwd: full})),
      );
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

  it(
    "an integration component's description prints with its tokens resolved",
    async () => {
      const {results} = (await rankSearchIndex('AcmeButton', indexes)).data;
      expect(results[0]).toMatchObject({package: ACME, name: 'AcmeButton'});
      expect(results[0].description).not.toContain('{@');
      expect(results[0].description).toContain('astryx component AcmeButton');
    },
    SLOW,
  );

  it('reports meta.partial when no index had Core, as search() does', async () => {
    const docsOnly = {
      ...indexes[0],
      candidates: indexes[0].candidates.filter(c => c.domain === 'doc'),
      coreSkipped: 'Core is not installed here.',
    };
    const response = await rankSearchIndex('button', [docsOnly]);
    expect(response.meta?.partial).toMatchObject({
      reason: 'Core is not installed here.',
    });
    const withCore = await rankSearchIndex('button', [docsOnly, indexes[1]]);
    expect(withCore.meta?.partial).toBeUndefined();
    // A docs-only search never reads Core, so it reports nothing skipped.
    const docs = await rankSearchIndex('button', [docsOnly], {type: 'doc'});
    expect(docs.meta?.partial).toBeUndefined();
    // A domain that reads Core, asked for by name, is refused as search() is.
    await expect(
      rankSearchIndex('button', [docsOnly], {type: 'component'}),
    ).rejects.toMatchObject({code: 'ERR_CORE_NOT_FOUND'});
    // The stored lookup error is the one thrown.
    const uncached = {...docsOnly, coreSkippedCode: 'ERR_VERSIONS_UNAVAILABLE'};
    await expect(
      rankSearchIndex('button', [uncached], {type: 'hook'}),
    ).rejects.toMatchObject({code: 'ERR_VERSIONS_UNAVAILABLE'});
    const open = await rankSearchIndex('button', [uncached]);
    expect(open.meta?.partial?.skipped).toEqual([
      'component',
      'hook',
      'template',
    ]);
  });

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
    await expect(
      exportSearchIndex({cwd: full, package: ' '}),
    ).rejects.toMatchObject({code: 'ERR_INVALID_ARGUMENT'});
  });
});
