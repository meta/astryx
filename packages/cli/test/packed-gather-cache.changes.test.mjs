// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A published CLI keeps the catalog `search` and `build` gather between runs
 * (foundation/fs/gather-cache.mjs) and uses it only while nothing it read has
 * changed: a kept catalog is not used after edits, a change above the project, or another project or environment.
 * Each case's answer from a kept catalog must equal a fresh gather's.
 */

import {describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
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
});
