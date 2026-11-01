// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import DurationShardSequencer, {
  DURATIONS,
  partitionByDuration,
  readDurations,
  recordDurations,
} from './vitest-shard-sequencer.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const recorded = readDurations();
const files = Object.keys(recorded).sort();
const total = leg => leg.reduce((sum, file) => sum + recorded[file], 0);
const slowest = [...files].sort((a, b) => recorded[b] - recorded[a]);

describe('duration-balanced Node legs', () => {
  it('records a time for the whole Node suite', () => {
    expect(files.length).toBeGreaterThan(500);
    for (const file of files) {
      // A file faster than 50 ms is recorded as 0.
      expect(recorded[file], file).toBeGreaterThanOrEqual(0);
      expect(path.isAbsolute(file), file).toBe(false);
    }
    // The slowest files still exist, so the split they steer is real.
    for (const file of slowest.slice(0, 6))
      expect(fs.existsSync(path.join(ROOT, file)), file).toBe(true);
  });

  it.each([4, 6])(
    'runs every file in exactly one of %i legs, the same split in any order',
    count => {
      const legs = partitionByDuration(files, count, recorded);
      expect(legs.flat().sort()).toEqual(files);
      expect(new Set(legs.flat()).size).toBe(files.length);
      const shuffled = [...files].reverse();
      expect(partitionByDuration(shuffled, count, recorded)).toEqual(legs);
    },
  );

  it.each([4, 6])(
    'never puts two of the %i slowest files in one leg, and keeps legs within a slow file of each other',
    count => {
      const legs = partitionByDuration(files, count, recorded);
      const legOf = file => legs.findIndex(leg => leg.includes(file));
      const top = slowest.slice(0, count).map(legOf);
      expect(new Set(top).size).toBe(count);
      // Greedy slowest-first: legs differ by at most the slowest file's time.
      const totals = legs.map(total);
      expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(
        recorded[slowest[0]],
      );
    },
  );

  it('counts a file with no recorded time as the median', () => {
    const seconds = {'a.test.mjs': 10, 'b.test.mjs': 2, 'c.test.mjs': 1};
    const legs = partitionByDuration(
      ['a.test.mjs', 'b.test.mjs', 'c.test.mjs', 'new.test.mjs'],
      2,
      seconds,
    );
    // a (10) alone; b, new (2, as the median) and c share the other leg.
    expect(legs).toEqual([
      ['a.test.mjs'],
      ['b.test.mjs', 'c.test.mjs', 'new.test.mjs'],
    ]);
  });

  it('splits only the node project; other projects keep Vitest’s split', async () => {
    const spec = (project, file) => ({
      project: {name: project},
      moduleId: path.join(ROOT, file),
    });
    const node = slowest.slice(0, 12).map(file => spec('node', file));
    const ui = Array.from({length: 9}, (_, i) =>
      spec('ui', `packages/core/src/X${i}/X${i}.test.tsx`),
    );
    const count = 3;
    const legs = [];
    for (let index = 1; index <= count; index += 1) {
      const sequencer = new DurationShardSequencer({
        config: {root: ROOT, shard: {index, count}},
      });
      legs.push(await sequencer.shard([...ui, ...node]));
    }
    const ids = legs.flat().map(item => item.moduleId);
    expect(ids.sort()).toEqual(
      [...ui, ...node].map(item => item.moduleId).sort(),
    );
    const expected = partitionByDuration(
      node.map(item => path.relative(ROOT, item.moduleId)),
      count,
      recorded,
    );
    for (const [index, leg] of legs.entries()) {
      expect(
        leg
          .filter(item => item.project.name === 'node')
          .map(item => path.relative(ROOT, item.moduleId))
          .sort(),
      ).toEqual(expected[index]);
      expect(leg.filter(item => item.project.name === 'ui')).toHaveLength(3);
    }
  });

  it('runs a new test file that has no recorded time in exactly one leg', async () => {
    const added = 'packages/cli/a-brand-new.test.mjs';
    expect(recorded[added]).toBeUndefined();
    const node = [...slowest.slice(0, 20), added].map(file => ({
      project: {name: 'node'},
      moduleId: path.join(ROOT, file),
    }));
    const legs = [];
    for (let index = 1; index <= 6; index += 1) {
      const sequencer = new DurationShardSequencer({
        config: {root: ROOT, shard: {index, count: 6}},
      });
      legs.push((await sequencer.shard(node)).map(item => item.moduleId));
    }
    expect(
      legs.filter(leg => leg.includes(path.join(ROOT, added))),
    ).toHaveLength(1);
    expect(legs.flat().sort()).toEqual(node.map(item => item.moduleId).sort());
  });

  it('documents how to regenerate the recorded times', () => {
    const {$comment} = JSON.parse(fs.readFileSync(DURATIONS, 'utf8'));
    expect($comment).toContain(
      'node scripts/vitest-shard-sequencer.mjs record',
    );
    expect(
      fs.readFileSync(
        path.join(ROOT, 'scripts/vitest-shard-sequencer.mjs'),
        'utf8',
      ),
    ).toContain("command !== 'record'");
  });

  it("starts each leg's slowest recorded Node file first, keeping other projects' order", async () => {
    // The project fields Vitest's own sort reads.
    const spec = (project, file) => ({
      project: {
        name: project,
        config: {sequence: {groupOrder: 0}, isolate: true},
      },
      moduleId: path.join(ROOT, file),
    });
    const fast = slowest.slice(-3).map(file => spec('node', file));
    const slow = slowest.slice(0, 3).map(file => spec('node', file));
    const ui = [spec('ui', 'packages/core/src/A/A.test.tsx')];
    const sequencer = new DurationShardSequencer({
      config: {root: ROOT, shard: {index: 1, count: 1}},
      cache: {
        getFileTestResults: () => undefined,
        getFileStats: () => undefined,
      },
    });
    const order = (await sequencer.sort([...fast, ...ui, ...slow])).map(item =>
      path.relative(ROOT, item.moduleId),
    );
    const nodeOrder = order.filter(file => !file.startsWith('packages/core/'));
    expect(nodeOrder.slice(0, 3)).toEqual(slowest.slice(0, 3));
    expect(order).toContain('packages/core/src/A/A.test.tsx');
    expect(order).toHaveLength(7);
  });

  it('is the sequencer every Vitest run uses', () => {
    const config = fs.readFileSync(path.join(ROOT, 'vitest.config.ts'), 'utf8');
    expect(config).toContain(
      "import DurationShardSequencer from './scripts/vitest-shard-sequencer.mjs';",
    );
    expect(config).toContain('sequence: {sequencer: DurationShardSequencer},');
  });

  it('records seconds per file from Node leg log lines, failed files included', () => {
    const log = [
      '2026-11-01T07:54:35.11Z  ✓  node  packages/cli/a.test.mjs (124 tests) 2733ms',
      'job\tstep\t2026-11-01T07:57:41.61Z  ❯  node  packages/cli/b.test.mjs (40 tests | 1 failed) 192231ms',
      ' ✓ |node| scripts/c.test.mjs (3 tests) 1.5s',
      ' ↓  node  internal/d.test.ts (31 tests | 31 skipped)',
      ' ✓  ui  packages/core/src/E/E.test.tsx (5 tests) 900ms',
      'unrelated',
    ].join('\n');
    expect(recordDurations(log)).toEqual({
      'packages/cli/a.test.mjs': 2.7,
      'packages/cli/b.test.mjs': 192.2,
      'scripts/c.test.mjs': 1.5,
    });
    expect(path.relative(ROOT, DURATIONS)).toBe(
      'scripts/vitest-node-durations.json',
    );
  });
});
