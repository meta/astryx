// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A published CLI keeps the catalog `search` and `build` gather between runs
 * (foundation/fs/gather-cache.mjs) and uses it only while nothing it read has
 * changed: a kept catalog is not used after edits, a change above the project, or another project or environment.
 * Each case's answer from a kept catalog must equal a fresh gather's.
 */

import {describe, expect, it} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  usePackedCli,
  BUILD_ID,
  packed,
  project,
  widgets,
  writeTemplate,
  makeProject,
  run,
  keptTmp,
  freshTmp,
  entries,
  QUERIES,
  expectSameAsFresh,
  hasModuleHooks,
  userConfig,
  work,
} from '../test-utils/packed-gather-cache-fixture.mjs';

usePackedCli();

describe.skipIf(process.platform !== 'linux')('a kept catalog', () => {
  it.skipIf(!hasModuleHooks)(
    'is not used after an edit, an added or removed file, or a copy that keeps the time',
    async () => {
      const tmp = keptTmp('stale');
      expect(await expectSameAsFresh(tmp)).toEqual(['miss', 'hit']);
      writeTemplate('ledger', 'Entries as rows with running balances.');
      expect(await expectSameAsFresh(tmp)).toEqual(['miss', 'hit']);
      writeTemplate('kanban', 'Cards in columns with running totals.');
      expect(await expectSameAsFresh(tmp)).toEqual(['miss', 'hit']);
      fs.rmSync(path.join(widgets, 'templates', 'kanban.doc.mjs'));
      expect(await expectSameAsFresh(tmp)).toEqual(['miss', 'hit']);
      // Same size and times, other text: a copy that keeps the time.
      const doc = path.join(widgets, 'templates', 'roster.doc.mjs');
      const {atime, mtime, size} = fs.statSync(doc);
      const text = fs.readFileSync(doc, 'utf8').replace('team', 'crew');
      expect(Buffer.byteLength(text)).toBe(size);
      const copy = `${doc}.copy`;
      fs.writeFileSync(copy, text);
      fs.utimesSync(copy, atime, mtime);
      fs.renameSync(copy, doc);
      expect(await expectSameAsFresh(tmp)).toEqual(['miss', 'hit']);
      writeTemplate('roster', 'People as rows with role and team.');
    },
    300_000,
  );

  it.skipIf(!hasModuleHooks)(
    'is not used by another project, another CLI, or another environment',
    async () => {
      const tmp = keptTmp('other');
      await expectSameAsFresh(tmp);
      const other = makeProject();
      try {
        await expectSameAsFresh(tmp, {cwd: other.dir});
        expect(entries(tmp).size).toBe(2);
      } finally {
        fs.rmSync(other.dir, {recursive: true, force: true});
      }
      fs.writeFileSync(
        path.join(packed, BUILD_ID),
        JSON.stringify({id: 'second'}) + '\n',
      );
      expect((await expectSameAsFresh(tmp))[0]).toBe('miss');
      expect((await expectSameAsFresh(tmp, {env: {CI: '1'}}))[0]).toBe('miss');
    },
    300_000,
  );

  it('is not used after a change in a folder above the project', async () => {
    const tmp = keptTmp('ancestors');
    const parent = path.dirname(project);
    const config = path.join(project, 'astryx.config.mjs');
    // The project lists an integration it does not install itself.
    fs.writeFileSync(
      config,
      `export default { integrations: ['@acme/widgets', '@acme/far'] };\n`,
    );
    /** @type {string[]} */
    const made = [];
    try {
      await expectSameAsFresh(tmp);
      // A package.json, then a config file, in the folder above.
      for (const [name, text] of [
        ['package.json', JSON.stringify({name: 'parent'})],
        ['astryx.config.mjs', 'export default {};\n'],
      ]) {
        const file = path.join(parent, name);
        fs.writeFileSync(file, text);
        made.push(file);
        await expectSameAsFresh(tmp);
      }
      // A node_modules folder above, then the listed integration in it.
      const far = path.join(parent, 'node_modules', '@acme', 'far');
      made.push(path.join(parent, 'node_modules'));
      fs.mkdirSync(path.join(parent, 'node_modules'));
      await expectSameAsFresh(tmp);
      fs.mkdirSync(path.join(far, 'templates'), {recursive: true});
      fs.writeFileSync(
        path.join(far, 'package.json'),
        JSON.stringify({name: '@acme/far', version: '1.0.0'}),
      );
      fs.writeFileSync(
        path.join(far, 'astryx.integration.mjs'),
        `export default { templates: './templates' };\n`,
      );
      fs.writeFileSync(
        path.join(far, 'templates', 'tally.doc.mjs'),
        `export default {type: 'page', name: 'tally', description: 'Running totals per team, tallied.', category: 'Far - Tally'};\n`,
      );
      fs.writeFileSync(
        path.join(far, 'templates', 'tally.tsx'),
        `export default function Page() { return null; }\n`,
      );
      const before = run(QUERIES[0], {tmp: freshTmp()});
      expect((await expectSameAsFresh(tmp))[0]).toBe('miss');
      expect(run(QUERIES[0], {tmp}).stdout).toBe(before.stdout);
    } finally {
      for (const file of made.reverse()) {
        fs.rmSync(file, {recursive: true, force: true});
      }
      fs.writeFileSync(
        config,
        `export default { integrations: ['@acme/widgets'] };\n`,
      );
    }
  }, 300_000);

  it.skipIf(!hasModuleHooks)(
    "does not depend on a variable's value when code only lists the names",
    () => {
      const tmp = keptTmp('env-values');
      const other = makeProject();
      try {
        // A TypeScript manifest: loading it transforms it, and the transform
        // lists every variable's name (it reads only its own variables).
        fs.rmSync(path.join(other.widgets, 'astryx.integration.mjs'));
        fs.writeFileSync(
          path.join(other.widgets, 'astryx.integration.ts'),
          "const integration: {templates: string} = {templates: './templates'};\nexport default integration;\n",
        );
        const templates = path.join(other.widgets, 'templates');
        fs.mkdirSync(templates, {recursive: true});
        fs.writeFileSync(
          path.join(templates, 'tally.doc.mjs'),
          `export default {type: 'page', name: 'tally', description: 'Running totals, tallied by team.', category: 'Widget - Tally'};\n`,
        );
        fs.writeFileSync(
          path.join(templates, 'tally.tsx'),
          `export default function Page() { return null; }\n`,
        );
        const ask = QUERIES[0];
        const at = (/** @type {string} */ value) =>
          run(ask, {tmp, cwd: other.dir, env: {ASTRYX_TEST_TOKEN: value}});
        const first = at('one');
        const inodes = () =>
          new Map([...entries(tmp)].map(([name, {ino}]) => [name, ino]));
        const kept = inodes();
        expect(kept.size).toBeGreaterThan(0);
        // An unrelated variable with another value, as a tool sets per call:
        // the kept catalog is read back.
        expect(at('two')).toEqual(first);
        expect(inodes()).toEqual(kept);
      } finally {
        fs.rmSync(other.dir, {recursive: true, force: true});
      }
    },
    120_000,
  );

  it('misses when a variable the gather reads has another value', () => {
    const tmp = keptTmp('env-read');
    const other = makeProject();
    try {
      // The manifest reads a variable's value to pick its templates.
      fs.writeFileSync(
        path.join(other.widgets, 'astryx.integration.mjs'),
        "export default {templates: process.env.ASTRYX_TEST_ROOT === 'b' ? './templates-b' : './templates'};\n",
      );
      for (const [folder, description] of [
        ['templates', 'Running totals, tallied by team.'],
        ['templates-b', 'Grand totals, tallied by week.'],
      ]) {
        const dir = path.join(other.widgets, folder);
        fs.mkdirSync(dir, {recursive: true});
        fs.writeFileSync(
          path.join(dir, 'tally.doc.mjs'),
          `export default {type: 'page', name: 'tally', description: '${description}', category: 'Widget - Tally'};\n`,
        );
        fs.writeFileSync(
          path.join(dir, 'tally.tsx'),
          `export default function Page() { return null; }\n`,
        );
      }
      const ask = ['template', '--list'];
      const at = (/** @type {string} */ value, /** @type {string} */ where) =>
        run(ask, {tmp: where, cwd: other.dir, env: {ASTRYX_TEST_ROOT: value}});
      expect(at('a', tmp)).toEqual(at('a', freshTmp()));
      const b = at('b', tmp);
      expect(b.stdout).toContain('Grand totals');
      expect(b).toEqual(at('b', freshTmp()));
    } finally {
      fs.rmSync(other.dir, {recursive: true, force: true});
    }
  }, 120_000);

  it('hands a variable an inner kept gather read on to the gather around it', () => {
    const tmp = keptTmp('env-nested');
    const dir = fs.mkdtempSync(path.join(work, 'nested-'));
    try {
      // Two kept gathers of the installed CLI, one inside the other: the
      // outer reads a file, the inner a variable.
      const input = path.join(dir, 'outer.txt');
      const script = path.join(dir, 'nested.mjs');
      fs.writeFileSync(
        script,
        `import * as fs from 'node:fs';
const {persistedGather, recordRun} = await import(${JSON.stringify(
          pathToFileURL(
            path.join(packed, 'foundation', 'fs', 'gather-cache.mjs'),
          ).href,
        )});
const codec = {encode: v => v, decode: v => v};
const answer = await recordRun(() =>
  persistedGather(['nested-outer'], async () => {
    const inner = await persistedGather(['nested-inner'], async () => process.env.ASTRYX_TEST_V, codec);
    return inner + ':' + fs.readFileSync(${JSON.stringify(input)}, 'utf8');
  }, codec),
);
process.stdout.write(answer);
`,
      );
      const at = (/** @type {string} */ value) => {
        const result = spawnSync(process.execPath, [script], {
          encoding: 'utf8',
          env: {
            ...process.env,
            XDG_CACHE_HOME: tmp,
            XDG_CONFIG_HOME: userConfig(),
            ASTRYX_TEST_V: value,
          },
        });
        expect(result.status, result.stderr).toBe(0);
        return result.stdout;
      };
      fs.writeFileSync(input, '1');
      expect(at('a')).toBe('a:1');
      // Only the outer input changes: the outer gathers again while the
      // inner is read back.
      fs.writeFileSync(input, '2');
      expect(at('a')).toBe('a:2');
      // Then the variable the inner read changes.
      expect(at('b')).toBe('b:2');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }, 60_000);
});
