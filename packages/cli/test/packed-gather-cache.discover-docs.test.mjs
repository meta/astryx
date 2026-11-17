// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A published CLI keeps discover's record of the integrations a project
 * loads and what each adds (api/discover/_adapter.mjs describeInstalled),
 * which `discover` lists and search's discover line reads, between runs
 * (foundation/fs/gather-cache.mjs). This file: the record is kept, an edit
 * to an installed package's doc shows on the very next run, and a cache
 * folder that cannot be written leaves the answer as a fresh run gives it.
 */

import {describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  usePackedCli,
  makeProject,
  run,
  CACHE_NAME,
  keptTmp,
  freshTmp,
  readKept,
} from '../test-utils/packed-gather-cache-fixture.mjs';

usePackedCli();

/**
 * A doc file an integration ships, one topic of its own.
 * @param {string} dir the package's docs folder
 * @param {string} name
 */
function writeDoc(dir, name) {
  fs.writeFileSync(
    path.join(dir, `${name}.doc.mjs`),
    `export const docs = ${JSON.stringify({
      type: 'generic',
      name,
      title: name,
      description: `About ${name}.`,
      sections: [{title: 'Use', content: [{type: 'prose', text: 'Use it.'}]}],
    })};\n`,
  );
}

/**
 * The project's @acme/widgets, with a docs root.
 * @returns {{dir: string, docs: string}}
 */
function projectWithDocs() {
  const other = makeProject();
  const docs = path.join(other.widgets, 'docs');
  fs.mkdirSync(docs, {recursive: true});
  fs.writeFileSync(
    path.join(other.widgets, 'astryx.integration.mjs'),
    `export default { templates: './templates', docs: './docs' };\n`,
  );
  writeDoc(docs, 'widgets-setup');
  return {dir: other.dir, docs};
}

/**
 * The docs `discover` lists for @acme/widgets.
 * @param {string} tmp
 * @param {string} cwd
 * @returns {string[]}
 */
function listedDocs(tmp, cwd) {
  const result = run(['discover'], {tmp, cwd});
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout).data.find(
    (/** @type {{name: string}} */ each) => each.name === '@acme/widgets',
  ).docs;
}

/**
 * The kept entries of discover's installed integrations.
 * @param {string} tmp
 */
function docNameEntries(tmp) {
  const dir = path.join(tmp, CACHE_NAME);
  return fs.readdirSync(dir).filter(name => {
    try {
      return (
        JSON.parse(readKept(path.join(dir, name)).key)[5] ===
        'discover-installed'
      );
    } catch {
      return false;
    }
  });
}

describe.skipIf(process.platform !== 'linux')(
  'kept installed doc names',
  () => {
    it('are kept, and an edit to an installed package doc shows on the very next run', () => {
      const tmp = keptTmp('installed-doc-names');
      const {dir, docs} = projectWithDocs();
      try {
        expect(listedDocs(tmp, dir)).toEqual(['widgets-setup']);
        expect(docNameEntries(tmp)).toHaveLength(1);
        expect(listedDocs(tmp, dir)).toEqual(['widgets-setup']);
        // A new doc, then a renamed one: each shows on the next run, as a
        // fresh run gives it.
        writeDoc(docs, 'widgets-theming');
        expect(listedDocs(tmp, dir)).toEqual([
          'widgets-setup',
          'widgets-theming',
        ]);
        expect(listedDocs(freshTmp(), dir)).toEqual([
          'widgets-setup',
          'widgets-theming',
        ]);
        fs.rmSync(path.join(docs, 'widgets-theming.doc.mjs'));
        writeDoc(docs, 'widgets-layout');
        expect(listedDocs(tmp, dir)).toEqual([
          'widgets-layout',
          'widgets-setup',
        ]);
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    }, 240_000);

    it('answer as a fresh run does when the cache folder cannot be written', () => {
      const tmp = keptTmp('installed-doc-names-locked');
      const {dir} = projectWithDocs();
      const catalogs = path.join(tmp, CACHE_NAME);
      try {
        fs.chmodSync(catalogs, 0o500);
        expect(listedDocs(tmp, dir)).toEqual(['widgets-setup']);
        expect(listedDocs(tmp, dir)).toEqual(['widgets-setup']);
        expect(fs.readdirSync(catalogs)).toEqual([]);
      } finally {
        fs.chmodSync(catalogs, 0o700);
        fs.rmSync(dir, {recursive: true, force: true});
      }
    }, 240_000);
  },
);
