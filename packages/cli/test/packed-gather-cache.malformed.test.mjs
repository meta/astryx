// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A kept entry whose value is missing, will not decode, or decodes to the
 * wrong shape is a miss (foundation/fs/gather-cache.mjs): the command answers
 * as a fresh run, and the bad entry is stored over, so it cannot stick.
 * Covers every kind of kept entry the commands below store: search's catalog,
 * its entry table, build's block catalog, each integration's check results,
 * the project's issue list, template discovery's records, each
 * integration's theme records and doctor's docs checks.
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
  hasModuleHooks,
} from '../test-utils/packed-gather-cache-fixture.mjs';

usePackedCli();

/**
 * The kind of a kept entry, from the key it was stored under.
 * @param {string} file
 * @returns {string}
 */
function kindOf(file) {
  const key = JSON.parse(JSON.parse(fs.readFileSync(file, 'utf8')).key);
  const [first, second] = key.slice(5);
  if (first === 'derived') return String(second);
  return typeof first === 'string' &&
    !first.includes('/') &&
    !first.includes('\\')
    ? first
    : 'search-catalog';
}

/**
 * Every kept entry, by name, with its inode.
 * @param {string} tmp
 * @returns {Map<string, number>}
 */
function keptInodes(tmp) {
  const dir = path.join(tmp, CACHE_NAME);
  return new Map(
    fs
      .readdirSync(dir)
      .filter(name => name.startsWith('gather-'))
      .map(name => [name, fs.statSync(path.join(dir, name)).ino]),
  );
}

/** What each case writes in place of every kept entry's value. */
const BREAKS = {
  'no value': (/** @type {any} */ entry) => {
    delete entry.value;
  },
  'a null value': (/** @type {any} */ entry) => {
    entry.value = null;
  },
  'a value of the wrong shape': (/** @type {any} */ entry) => {
    entry.value = {unexpected: true};
  },
  'a string value': (/** @type {any} */ entry) => {
    entry.value = 'unexpected';
  },
  'a number value': (/** @type {any} */ entry) => {
    entry.value = 5;
  },
  'a list where an object was, and back': (/** @type {any} */ entry) => {
    entry.value = Array.isArray(entry.value)
      ? Object.fromEntries(entry.value.map((v, i) => [i, v]))
      : Object.values(entry.value ?? {});
  },
  'an entry table with no fields': (/** @type {any} */ entry) => {
    if (entry.value && 'fields' in entry.value) entry.value.fields = {};
    else delete entry.value;
  },
  'a value whose decode throws': (/** @type {any} */ entry) => {
    entry.value = {all: 5, ids: 5, blocks: 5, components: 5};
  },
};

const ASKS = [
  ['search', 'running', 'totals'],
  ['build', 'a', 'ledger', 'page', 'with', 'totals'],
  // A block request, so build keeps its block catalog too.
  ['build', 'a dashboard with a chart and a table'],
  ['template', '--list'],
  ['component', 'Button'],
  ['doctor'],
  ['theme', 'list'],
];

describe.skipIf(process.platform !== 'linux' || !hasModuleHooks)(
  'a malformed kept entry',
  () => {
    for (const [name, damage] of Object.entries(BREAKS)) {
      it(`is a miss, and is stored over, for ${name}`, () => {
        const tmp = keptTmp(`malformed-${name.replace(/\W+/g, '-')}`);
        const other = makeProject();
        try {
          const templates = path.join(other.widgets, 'templates');
          fs.mkdirSync(templates, {recursive: true});
          fs.writeFileSync(
            path.join(templates, 'ledger.doc.mjs'),
            `export default {type: 'page', name: 'ledger', description: 'Entries as rows with running totals.', category: 'Widget - Ledger'};\n`,
          );
          fs.writeFileSync(
            path.join(templates, 'ledger.tsx'),
            `export default function Page() { return null; }\n`,
          );
          // A theme the integration ships, so its theme records are kept too.
          fs.writeFileSync(
            path.join(other.widgets, 'package.json'),
            JSON.stringify({
              name: '@acme/widgets',
              version: '1.0.0',
              type: 'module',
              exports: {
                './themes/tally': './dist/tally.js',
                './themes/tally.css': './dist/tally.css',
              },
            }),
          );
          fs.writeFileSync(
            path.join(other.widgets, 'astryx.integration.mjs'),
            "export default { templates: './templates', themes: './themes' };\n",
          );
          fs.mkdirSync(path.join(other.widgets, 'dist'));
          fs.writeFileSync(
            path.join(other.widgets, 'dist', 'tally.js'),
            "export const tallyTheme = {name: 'tally', tokens: {}};\n",
          );
          fs.writeFileSync(
            path.join(other.widgets, 'dist', 'tally.css'),
            '[data-astryx-theme="tally"] { --color-text: black; }\n',
          );
          const theme = path.join(other.widgets, 'themes', 'tally');
          fs.mkdirSync(theme, {recursive: true});
          fs.writeFileSync(
            path.join(theme, 'tallyTheme.doc.mjs'),
            "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: 'tally', displayName: 'Tally', description: 'Tally theme for ledgers.', maintained: true};\n",
          );
          fs.writeFileSync(
            path.join(theme, 'tallyTheme.ts'),
            "export const tallyTheme = {name: 'tally', tokens: {}};\n",
          );
          // doctor's cache row names the folder and counts what it holds,
          // which differ between two cache folders: the rest must match.
          const all = (/** @type {string} */ where) =>
            ASKS.map(ask => {
              const r = run(ask, {tmp: where, cwd: other.dir});
              return {
                ...r,
                stdout: r.stdout
                  .split(where)
                  .join('<cache>')
                  .replace(/\(\d+ entr(?:y|ies), [\d.]+ MB\)/g, '(<count>)'),
              };
            });
          all(tmp);
          all(tmp);
          const dir = path.join(tmp, CACHE_NAME);
          const kept = [...keptInodes(tmp).keys()];
          // Every kind is kept: the catalog, its table and block catalog, the
          // integration's checks, the issue list, the template records, the
          // integration's theme records and doctor's docs checks.
          expect(
            new Set(kept.map(file => kindOf(path.join(dir, file)))),
          ).toEqual(
            new Set([
              'search-catalog',
              'entry-table',
              'block-catalog',
              'integration-issues',
              'project-issues',
              'template-sources',
              'integration-themes',
              'doctor-check',
            ]),
          );
          for (const file of kept) {
            const entry = JSON.parse(
              fs.readFileSync(path.join(dir, file), 'utf8'),
            );
            damage(entry);
            fs.writeFileSync(path.join(dir, file), JSON.stringify(entry));
          }
          const fresh = all(freshTmp());
          const answers = all(tmp);
          for (const [i, ask] of ASKS.entries()) {
            expect(answers[i].status, ask.join(' ')).toBe(0);
            expect(answers[i], ask.join(' ')).toEqual(fresh[i]);
          }
          // Each bad entry was stored over with a value that reads back: the
          // next runs hit, writing nothing.
          for (const file of kept) {
            const entry = JSON.parse(
              fs.readFileSync(path.join(dir, file), 'utf8'),
            );
            expect(entry.value, file).not.toEqual({unexpected: true});
            expect(entry.value ?? null, file).not.toBeNull();
          }
          const warm = keptInodes(tmp);
          all(tmp);
          expect(keptInodes(tmp)).toEqual(warm);
        } finally {
          fs.rmSync(other.dir, {recursive: true, force: true});
        }
      }, 300_000);
    }
  },
);
