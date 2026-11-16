// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A docs read names a page in another spelling of its route, or by the
 * words of its title and declared keywords. Only separators and word order
 * change the route a read opens; words alone give suggestions, closest page
 * first.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {docs} from './docs.mjs';
import {REPO_ROOT} from '../../test-utils/repo-root.mjs';

const SLOW = 60_000;

/** @type {string} */
let tmpDir;

/**
 * Write one doc of an integration's docs folder.
 * @param {string} docsDir
 * @param {Record<string, unknown>} doc
 */
function writeDoc(docsDir, doc) {
  fs.writeFileSync(
    path.join(docsDir, `${doc.name}.doc.mjs`),
    `export const docs = ${JSON.stringify(doc, null, 2)};\n`,
  );
}

/**
 * A guide in one of the made-up namespaces.
 * @param {string} parent
 * @param {string} name
 * @param {string} title
 * @param {string[]} [keywords]
 */
function guide(parent, name, title, keywords) {
  return {
    type: 'generic',
    name,
    title,
    description: `${title}.`,
    ...(keywords ? {keywords} : {}),
    placement: {parent: `namespace:${parent}`, slot: 'guides'},
    sections: [{title: 'Steps', content: [{type: 'prose', text: 'Steps.'}]}],
  };
}

/**
 * A project with one integration: the `orchard` namespace with three guides,
 * and the `cellar` namespace with a guide whose name has the words of one in
 * orchard in another order.
 */
function scaffold() {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'consumer'}),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.config.mjs'),
    "export default {integrations: ['@acme/farm']};\n",
  );
  const pkgDir = path.join(tmpDir, 'node_modules', '@acme', 'farm');
  const docsDir = path.join(pkgDir, 'docs');
  fs.mkdirSync(docsDir, {recursive: true});
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({name: '@acme/farm', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(pkgDir, 'astryx.integration.mjs'),
    "export default {docs: './docs'};\n",
  );
  for (const name of ['orchard', 'cellar']) {
    writeDoc(docsDir, {
      type: 'namespace',
      name,
      title: name,
      summary: `Everything about the ${name}.`,
      slots: {guides: {title: 'Guides', accepts: {kinds: ['generic']}}},
    });
  }
  writeDoc(
    docsDir,
    guide('orchard', 'prune-trees', 'Cut back branches', ['secateurs']),
  );
  writeDoc(docsDir, guide('orchard', 'press-cider', 'Make apple juice'));
  writeDoc(docsDir, guide('orchard', 'store-fruit', 'Keep the harvest'));
  writeDoc(docsDir, guide('cellar', 'fruit-store', 'Keep the harvest cool'));
  writeDoc(docsDir, {
    type: 'generic',
    name: 'barbecue',
    title: 'Cook over coals',
    description: 'Cook over coals.',
    category: 'guide',
    keywords: ['smoker'],
    sections: [{title: 'Steps', content: [{type: 'prose', text: 'Steps.'}]}],
  });
  writeDoc(
    docsDir,
    guide('cellar', 'start-here', 'Set up the racks', [
      'set up',
      'quick start',
    ]),
  );
}

/**
 * The response or error of one read in the made-up project.
 * @param {string} typed
 */
const read = typed => docs(typed, undefined, {cwd: tmpDir}).catch(e => e);

/** @param {any} error */
const routes = error => error.suggestions.map((/** @type {any} */ s) => s.name);

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-docs-spelling-test-'));
  scaffold();
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('a docs route in another spelling', () => {
  it(
    'opens the page whatever separates the words, in any order',
    async () => {
      const canonical = await read('orchard/prune-trees');
      expect(canonical.data.name).toBe('orchard/prune-trees');
      for (const typed of [
        'orchard.prune-trees',
        'orchard prune trees',
        'orchard_prune_trees',
        'prune-trees/orchard',
        'trees/prune/orchard',
        'Orchard Prune Trees',
      ]) {
        expect(await read(typed), typed).toEqual(canonical);
      }
    },
    SLOW,
  );

  it(
    'opens a child named in another spelling when only one child has the name',
    async () => {
      expect(await read('cider press')).toEqual(
        await read('orchard/press-cider'),
      );
    },
    SLOW,
  );

  it(
    'suggests every page that shares the spelling, and opens none',
    async () => {
      const error = await read('fruit store');
      expect(error.code).toBe('ERR_UNKNOWN_TOPIC');
      expect([...routes(error)].sort()).toEqual([
        'cellar/fruit-store',
        'orchard/store-fruit',
      ]);
    },
    SLOW,
  );
});

describe('a docs miss named by words', () => {
  it(
    'suggests the page its title names first, and opens nothing',
    async () => {
      const error = await read('cutting branches');
      expect(error.code).toBe('ERR_UNKNOWN_TOPIC');
      expect(routes(error)[0]).toBe('orchard/prune-trees');
    },
    SLOW,
  );

  it(
    'suggests the page that declares the keyword first',
    async () => {
      const error = await read('secateurs');
      expect(error.code).toBe('ERR_UNKNOWN_TOPIC');
      expect(routes(error)[0]).toBe('orchard/prune-trees');
    },
    SLOW,
  );

  it(
    'suggests an integration topic by a keyword it declares',
    async () => {
      const error = await read('smoker');
      expect(error.code).toBe('ERR_UNKNOWN_TOPIC');
      expect(routes(error)[0]).toBe('barbecue');
    },
    SLOW,
  );

  it(
    'orders a namespace child list by title and keyword words',
    async () => {
      const error = await read('orchard/apple-juice');
      expect(error.code).toBe('ERR_UNKNOWN_TOPIC');
      const names = routes(error);
      expect(names[0]).toBe('orchard/press-cider');
      // The list is still every child of the namespace the route reaches.
      const none = await read('orchard/zzzz-nope');
      expect([...names].sort()).toEqual([...routes(none)].sort());
    },
    SLOW,
  );

  it(
    'keeps first the route the typed words name, ahead of pages that only share other words',
    async () => {
      for (const typed of ['set-up-orchard', 'orchard quick start']) {
        const error = await read(typed);
        expect(error.code, typed).toBe('ERR_UNKNOWN_TOPIC');
        expect(routes(error)[0], typed).toBe('orchard');
      }
    },
    SLOW,
  );

  it(
    'suggests the page that declares the words when no route is named',
    async () => {
      const error = await read('racks set up');
      expect(error.code).toBe('ERR_UNKNOWN_TOPIC');
      expect(routes(error)[0]).toBe('cellar/start-here');
    },
    SLOW,
  );

  it(
    'names the broader page once, not each child that shares its word',
    async () => {
      const error = await read('orchard tools');
      expect(error.code).toBe('ERR_UNKNOWN_TOPIC');
      expect(routes(error)[0]).toBe('orchard');
      expect(
        routes(error).some((/** @type {string} */ r) =>
          r.startsWith('orchard/'),
        ),
      ).toBe(false);
      expect(routes(error).length).toBeLessThanOrEqual(5);
    },
    SLOW,
  );
});
