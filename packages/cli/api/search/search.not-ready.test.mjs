// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every template result carries `isReady`, after its other fields: false
 * for a template whose doc sets `isReady: false`, true for a ready template
 * and for one whose doc leaves it out. An unready template stays in the same
 * place, and its text record reads `page (not ready)`. Build's pages and
 * blocks carry the same field.
 *
 * @input a project with made-up integration templates: ready, unready, and
 *   one that leaves `isReady` out
 * @output each template's result, its place, its text record, and build's kit
 * @position packages/cli/api/search — search results
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {requireNatively} from '../../test-utils/native-require.mjs';

const require = requireNatively(import.meta.url);
/** @type {typeof import('./search.mjs')} */
const {search} = require('./search.mjs');
/** @type {typeof import('../build/build.mjs')} */
const {build} = require('../build/build.mjs');

const SLOW = 60_000;
const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const packages = path.resolve(CLI, '..');

/** @type {string} */
let dir;
/** @type {string} */
let templates;

/**
 * Write a made-up page template with the given `isReady` line.
 * @param {string} id
 * @param {string} readiness - `isReady: …,` or empty
 */
function writePage(id, readiness) {
  fs.writeFileSync(
    path.join(templates, `${id}.doc.mjs`),
    `export default {type: 'page', name: '${id}', description: 'A quokka roster as rows.', ${readiness}};\n`,
  );
  fs.writeFileSync(
    path.join(templates, `${id}.tsx`),
    `export default function Page() { return null; }\n`,
  );
}

/** @param {any[]} results */
const quokkas = results => results.filter(r => r.name.startsWith('quokka'));

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-search-not-ready-'));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'consumer',
      private: true,
      dependencies: {'@astryxdesign/core': '*', '@acme/pages': '1.0.0'},
    }),
  );
  const scope = path.join(dir, 'node_modules', '@astryxdesign');
  fs.mkdirSync(scope, {recursive: true});
  fs.symlinkSync(path.join(packages, 'core'), path.join(scope, 'core'), 'dir');
  const acme = path.join(dir, 'node_modules', '@acme', 'pages');
  templates = path.join(acme, 'templates');
  fs.mkdirSync(templates, {recursive: true});
  fs.writeFileSync(
    path.join(acme, 'package.json'),
    JSON.stringify({name: '@acme/pages', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(acme, 'astryx.integration.mjs'),
    `export default { templates: './templates' };\n`,
  );
  writePage('quokka-ready', 'isReady: true,');
  writePage('quokka-unready', 'isReady: false,');
  writePage('quokka-plain', '');
});
afterAll(() => fs.rmSync(dir, {recursive: true, force: true}));

describe('an unready template in search', () => {
  it(
    "gives every page and block in build's kit isReady, after its other fields",
    async () => {
      const kit = (await build('a quokka roster page with a table', {cwd: dir}))
        .data;
      const rows = [...kit.pages, ...kit.blocks];
      expect(kit.pages.length).toBeGreaterThan(0);
      expect(kit.blocks.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(typeof row.isReady, row.name).toBe('boolean');
        expect(Object.keys(row).at(-1), row.name).toBe('isReady');
      }
      // Build lists only pages it could start from.
      expect(kit.pages.map(p => p.name)).not.toContain('quokka-unready');
    },
    SLOW,
  );

  it(
    'carries isReady: false on an unready template and true on the others, after every other field',
    async () => {
      const found = quokkas(
        (await search('quokka roster', {cwd: dir, type: 'template'})).data
          .results,
      );
      const byName = Object.fromEntries(found.map(r => [r.name, r]));
      expect(Object.keys(byName).sort()).toEqual([
        'quokka-plain',
        'quokka-ready',
        'quokka-unready',
      ]);
      expect(byName['quokka-unready'].isReady).toBe(false);
      expect(byName['quokka-ready'].isReady).toBe(true);
      expect(byName['quokka-plain'].isReady).toBe(true);
      // The field comes after every field a template result had.
      for (const result of found) {
        expect(Object.keys(result)).toEqual([
          'domain',
          'name',
          'package',
          'score',
          'reason',
          'description',
          'displayName',
          'kind',
          'command',
          'isReady',
        ]);
      }
      const others = (await search('quokka roster', {cwd: dir})).data.results;
      for (const result of others) {
        expect('isReady' in result, result.name).toBe(
          result.domain === 'template',
        );
      }
    },
    SLOW,
  );

  it(
    'keeps its place: the order is the same once it is ready',
    async () => {
      const order = async () =>
        quokkas(
          (await search('quokka roster', {cwd: dir, type: 'template'})).data
            .results,
        ).map(r => [r.name, r.score]);
      const before = await order();
      writePage('quokka-unready', 'isReady: true, ');
      try {
        const after = await order();
        expect(after).toEqual(before);
        // The second search saw the flip.
        const flipped = (
          await search('quokka roster', {cwd: dir, type: 'template'})
        ).data.results.find(r => r.name === 'quokka-unready');
        expect(flipped?.isReady).toBe(true);
      } finally {
        writePage('quokka-unready', 'isReady: false,');
      }
    },
    SLOW,
  );

  it(
    'reads `page (not ready)` in text, on the unready template only',
    () => {
      const env = {...process.env, NO_COLOR: '1', COLUMNS: '100'};
      for (const key of Object.keys(env)) {
        if (key.startsWith('VITEST')) delete env[key];
      }
      const result = spawnSync(
        process.execPath,
        [
          path.join(CLI, 'clients', 'cli', 'bin', 'astryx.mjs'),
          'search',
          'quokka roster',
          '--type',
          'template',
        ],
        {cwd: dir, encoding: 'utf8', env},
      );
      expect(result.status, result.stderr).toBe(0);
      const records = result.stdout.split('\n\n');
      /** @param {string} id */
      const recordOf = id =>
        records.find(r => r.includes(`name:        ${id}\n`)) ?? '';
      expect(recordOf('quokka-unready')).toContain(
        '\nkind:        page (not ready)\n',
      );
      for (const id of ['quokka-ready', 'quokka-plain']) {
        expect(recordOf(id)).toContain('\nkind:        page\n');
      }
      expect(
        records
          .filter(r => r.includes('name:        quokka'))
          .join('\n\n')
          .split('(not ready)'),
      ).toHaveLength(2);
    },
    SLOW,
  );
});
