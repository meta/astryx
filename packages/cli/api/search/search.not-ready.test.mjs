// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A template whose doc sets `isReady: false` stays in search's answer,
 * in the same place, and is marked: its JSON result carries `isReady: false`
 * and its text record reads `page (not ready)`. A ready template and one whose
 * doc leaves `isReady` out keep today's result.
 *
 * @input a project with made-up integration templates: ready, unready, and
 *   one that leaves `isReady` out
 * @output each template's result, its place, and its text record
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
    'carries isReady: false; a ready template and one without isReady carry nothing new',
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
      // The field comes after every field a template result had.
      expect(Object.keys(byName['quokka-unready'])).toEqual([
        ...Object.keys(byName['quokka-ready']),
        'isReady',
      ]);
      expect('isReady' in byName['quokka-ready']).toBe(false);
      expect('isReady' in byName['quokka-plain']).toBe(false);
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
