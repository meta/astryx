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
  hasModuleHooks,
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

/**
 * The folders the kept saved-search records were kept for.
 * @param {string} tmp
 * @returns {string[]}
 */
function savedSearchEntries(tmp) {
  const dir = path.join(tmp, CACHE_NAME);
  return fs.readdirSync(dir).flatMap(name => {
    try {
      const key = JSON.parse(readKept(path.join(dir, name)).key);
      return key[5] === 'discover-saved-search' ? [key[6]] : [];
    } catch {
      return [];
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
        expect(docNameEntries(tmp)).toHaveLength(hasModuleHooks ? 1 : 0);
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

    it("shows search's discover line from the saved copy as it is now", () => {
      const tmp = keptTmp('saved-search');
      const other = makeProject();
      /** @param {string[]} names the components the project's own source lists */
      const writeSource = names =>
        fs.writeFileSync(
          path.join(other.dir, 'astryx.config.mjs'),
          `export default {
  integrations: ['@acme/widgets'],
  async discover() {
    return {
      schemaVersion: 1,
      source: {name: 'Test catalog', generatedAt: '2026-09-30T00:00:00.000Z', complete: true},
      packages: [{
        package: '@acme/kit',
        integration: 'acme-kit',
        aliases: [],
        latest: '1.0.0',
        description: 'Parts for apps.',
        versions: [{version: '1.0.0', publishedAt: '2026-09-20T00:00:00.000Z', prerelease: false, status: 'ok'}],
        contributions: ${JSON.stringify(
          names.map(name => ({
            kind: 'component',
            name,
            summary: `The ${name} component.`,
          })),
        )},
      }],
    };
  },
};
`,
        );
      const hint = () => {
        const result = run(['search', 'bar', 'chart'], {
          tmp,
          cwd: other.dir,
          json: false,
        });
        expect(result.status, result.stderr).toBe(0);
        return result.stdout.includes('More in packages you could add');
      };
      try {
        writeSource(['BarChart']);
        // No saved copy yet: the line shows, as it always did.
        expect(hint()).toBe(true);
        expect(run(['discover'], {tmp, cwd: other.dir}).status).toBe(0);
        expect(hint()).toBe(true);
        expect(hint()).toBe(true);
        // The source stops listing the chart; discover saves the new copy,
        // and the very next search reads it.
        writeSource(['Stepper']);
        expect(run(['discover'], {tmp, cwd: other.dir}).status).toBe(0);
        expect(hint()).toBe(false);
        expect(hint()).toBe(false);
      } finally {
        fs.rmSync(other.dir, {recursive: true, force: true});
      }
    }, 240_000);

    it("keeps search's discover line per folder, as discover counts what each folder declares", () => {
      const other = makeProject();
      const src = path.join(other.dir, 'src');
      fs.mkdirSync(src, {recursive: true});
      // The root declares @acme/kit without installing it; src declares
      // nothing.
      fs.writeFileSync(
        path.join(other.dir, 'package.json'),
        JSON.stringify({
          name: 'consumer',
          dependencies: {'@acme/kit': '^1.0.0'},
        }),
      );
      fs.writeFileSync(
        path.join(other.dir, 'astryx.config.mjs'),
        `export default {
  integrations: ['@acme/widgets'],
  async discover() {
    return {
      schemaVersion: 1,
      source: {name: 'Test catalog', generatedAt: '2026-09-30T00:00:00.000Z', complete: true},
      packages: [{
        package: '@acme/kit',
        integration: 'acme-kit',
        aliases: [],
        latest: '1.0.0',
        description: 'Parts for apps.',
        versions: [{version: '1.0.0', publishedAt: '2026-09-20T00:00:00.000Z', prerelease: false, status: 'ok'}],
        contributions: [{kind: 'component', name: 'BarChart', summary: 'Compare values.'}],
      }],
    };
  },
};
`,
      );
      /** @param {string} tmp @param {string} cwd */
      const hint = (tmp, cwd) =>
        run(['search', 'bar', 'chart'], {
          tmp,
          cwd,
          json: false,
        }).stdout.includes('More in packages you could add');
      /** @param {string} tmp @param {string} cwd */
      const answers = (tmp, cwd) =>
        JSON.parse(run(['discover', 'bar', 'chart'], {tmp, cwd}).stdout)
          .type === 'discover.search';
      try {
        for (const order of [
          [other.dir, src],
          [src, other.dir],
        ]) {
          const tmp = keptTmp(`declared-${path.basename(order[0])}`);
          expect(run(['discover'], {tmp, cwd: other.dir}).status).toBe(0);
          for (const cwd of [...order, ...order]) {
            expect(hint(tmp, cwd)).toBe(answers(tmp, cwd));
          }
          // The two folders answer differently, and each keeps a record of
          // its own: a record one folder kept never answers for the other.
          expect(answers(tmp, other.dir)).toBe(false);
          expect(answers(tmp, src)).toBe(true);
          // Without module hooks no run keeps a record.
          expect(savedSearchEntries(tmp).sort()).toEqual(
            hasModuleHooks
              ? [fs.realpathSync(other.dir), fs.realpathSync(src)].sort()
              : [],
          );
        }
      } finally {
        fs.rmSync(other.dir, {recursive: true, force: true});
      }
    }, 240_000);
  },
);
