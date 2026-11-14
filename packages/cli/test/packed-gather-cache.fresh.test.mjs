// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A published CLI keeps the catalog `search` and `build` gather between runs
 * (foundation/fs/gather-cache.mjs) and uses it only while nothing it read has
 * changed: a kept catalog answers as a fresh gather while nothing changed,
 * and after random changes.
 * Each case's answer from a kept catalog must equal a fresh gather's.
 */

import {describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  usePackedCli,
  work,
  widgets,
  writeTemplate,
  makeProject,
  run,
  CACHE_NAME,
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
    'answers as a fresh gather, and is used while nothing changed',
    async () => {
      const tmp = keptTmp('warm');
      const cold = run(QUERIES[0], {tmp});
      const stored = entries(tmp);
      expect(stored.size).toBe(1);
      const warm = run(QUERIES[0], {tmp});
      const after = entries(tmp);
      expect(warm).toEqual(cold);
      const [[name, before]] = [...stored];
      // A hit reads the entry and touches it; a miss writes a new one.
      expect(after.get(name)?.ino).toBe(before.ino);
      expect(run(QUERIES[0], {tmp: freshTmp()})).toEqual(cold);
      await expectSameAsFresh(tmp);
    },
    120_000,
  );

  it.skipIf(!hasModuleHooks)(
    'answers as a fresh gather after random changes',
    async () => {
      const tmp = keptTmp('random');
      let seed = 7;
      const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const ids = ['ledger', 'roster', 'kanban', 'gallery'];
      const words = ['totals', 'team', 'balances', 'crew', 'columns', 'photos'];
      await expectSameAsFresh(tmp);
      for (let step = 0; step < 8; step++) {
        const id = ids[Math.floor(random() * ids.length)];
        const doc = path.join(widgets, 'templates', `${id}.doc.mjs`);
        const op = Math.floor(random() * 4);
        if (op === 0 || !fs.existsSync(doc)) {
          writeTemplate(
            id,
            `Rows with ${words[Math.floor(random() * words.length)]}.`,
          );
        } else if (op === 1) {
          fs.rmSync(doc);
        } else if (op === 2) {
          const now = new Date(Date.now() + 1000 * step);
          fs.utimesSync(doc, now, now);
        } else {
          fs.writeFileSync(
            path.join(widgets, 'astryx.integration.mjs'),
            `export default { templates: './templates' };\n${'//\n'.repeat(step)}`,
          );
        }
        const outcomes = await expectSameAsFresh(tmp);
        expect(outcomes.slice(1)).toEqual(['hit']);
      }
    },
    600_000,
  );

  it.skipIf(!hasModuleHooks)(
    'is kept by the first run, which makes its folder, and used by the next',
    () => {
      const fresh = run(QUERIES[0], {tmp: freshTmp()});
      const tmp = path.join(work, 'tmp', 'first');
      // The release cache, as keptTmp() leaves it: this packed copy, with no
      // Core beside it, starts a background Core install that makes the
      // folder, and the gather looks it up.
      fs.mkdirSync(path.join(tmp, 'astryx', 'releases'), {recursive: true});
      expect(run(QUERIES[0], {tmp})).toEqual(fresh);
      expect(fs.readdirSync(path.join(tmp, 'astryx'))).toContain('catalogs');
      expect(fs.statSync(path.join(tmp, CACHE_NAME)).mode & 0o777).toBe(0o700);
      const kept = entries(tmp);
      expect(kept.size).toBe(1);
      expect(run(QUERIES[0], {tmp})).toEqual(fresh);
      const [name] = [...kept.keys()];
      // The second run read the entry back: it did not write it again.
      expect(entries(tmp).get(name)?.ino).toBe(kept.get(name)?.ino);
    },
    120_000,
  );

  it.skipIf(!hasModuleHooks || process.getuid?.() === 0)(
    'lets the first run answer the same, silently, when it cannot make or write its folder',
    () => {
      const fresh = run(QUERIES[0], {tmp: freshTmp()});
      expect(fresh.status).toBe(0);
      /**
       * Run the query on a new machine whose cache folder is set up by
       * `prepare`, then make every folder writable again.
       * @param {string} name
       * @param {(tmp: string) => string[]} prepare - returns the folders it
       *   made read only
       */
      const firstRun = (name, prepare) => {
        const tmp = path.join(work, 'tmp', name);
        fs.mkdirSync(tmp, {recursive: true});
        const locked = prepare(tmp);
        try {
          return {result: run(QUERIES[0], {tmp}), kept: entries(tmp).size};
        } finally {
          for (const dir of locked) fs.chmodSync(dir, 0o700);
        }
      };
      // The user cache folder is read only: the catalogs folder cannot be
      // made.
      const noFolder = firstRun('first-locked-home', tmp => {
        fs.mkdirSync(path.join(tmp, 'astryx', 'releases'), {recursive: true});
        fs.chmodSync(path.join(tmp, 'astryx'), 0o500);
        return [path.join(tmp, 'astryx')];
      });
      // The catalogs folder exists but nothing can be written in it.
      const noWrite = firstRun('first-locked-folder', tmp => {
        const catalogs = path.join(tmp, CACHE_NAME);
        fs.mkdirSync(catalogs, {recursive: true, mode: 0o700});
        fs.mkdirSync(path.join(tmp, 'astryx', 'releases'), {recursive: true});
        fs.chmodSync(catalogs, 0o500);
        return [catalogs];
      });
      for (const {result, kept} of [noFolder, noWrite]) {
        expect(result).toEqual(fresh);
        expect(kept).toBe(0);
      }
    },
    120_000,
  );

  it.skipIf(!hasModuleHooks)(
    "is used once a TypeScript integration's first load filled the transpile cache",
    () => {
      const tmp = keptTmp('typescript');
      const other = makeProject();
      try {
        // The integration's manifest in TypeScript, importing a helper: jiti
        // compiles both on the first load and writes them to its cache in the
        // per-user cache folder, beside the catalogs.
        fs.rmSync(path.join(other.widgets, 'astryx.integration.mjs'));
        fs.writeFileSync(
          path.join(other.widgets, 'helper.ts'),
          `export const root: string = './templates';\n`,
        );
        fs.writeFileSync(
          path.join(other.widgets, 'astryx.integration.ts'),
          `import {root} from './helper';\nconst integration: {templates: string} = {templates: root};\nexport default integration;\n`,
        );
        const outcomes = [];
        const fresh = run(QUERIES[0], {tmp: freshTmp(), cwd: other.dir});
        for (let i = 0; i < 3; i++) {
          const before = entries(tmp);
          expect(run(QUERIES[0], {tmp, cwd: other.dir})).toEqual(fresh);
          const after = entries(tmp);
          const [name] = [...after.keys()];
          outcomes.push(
            before.get(name)?.ino === after.get(name)?.ino ? 'hit' : 'miss',
          );
        }
        // The manifest's and the helper's transpiled copies, beside the
        // folder's own record of its last size check (a dot file).
        expect(
          fs
            .readdirSync(path.join(tmp, 'astryx', 'jiti'))
            .filter(name => !name.startsWith('.')).length,
        ).toBe(2);
        expect(outcomes).toEqual(['miss', 'hit', 'hit']);
      } finally {
        fs.rmSync(other.dir, {recursive: true, force: true});
      }
    },
    120_000,
  );
});
