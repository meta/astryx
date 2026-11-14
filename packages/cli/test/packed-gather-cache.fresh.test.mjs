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
    'is not kept by the first run, which only makes its folder',
    () => {
      const tmp = path.join(work, 'tmp', 'first');
      const first = run(QUERIES[0], {tmp});
      expect(fs.readdirSync(path.join(tmp, 'astryx'))).toContain('catalogs');
      expect(fs.statSync(path.join(tmp, CACHE_NAME)).mode & 0o777).toBe(0o700);
      expect(fs.readdirSync(path.join(tmp, CACHE_NAME))).toEqual([]);
      expect(first).toEqual(run(QUERIES[0], {tmp: freshTmp()}));
      run(QUERIES[0], {tmp});
      expect(entries(tmp).size).toBe(1);
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
        expect(fs.readdirSync(path.join(tmp, 'astryx', 'jiti')).length).toBe(2);
        expect(outcomes).toEqual(['miss', 'hit', 'hit']);
      } finally {
        fs.rmSync(other.dir, {recursive: true, force: true});
      }
    },
    120_000,
  );
});
