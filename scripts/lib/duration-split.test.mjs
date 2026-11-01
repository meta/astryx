// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {
  assertEachOnce,
  costOf,
  slowestFirst,
  splitByDuration,
} from './duration-split.mjs';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

describe('splitting test files by recorded time', () => {
  it('uses a recorded time, a recorded 0 included, and the median otherwise', () => {
    const cost = costOf(['a', 'b', 'c', 'zero', 'new'], {
      a: 10,
      b: 4,
      c: 1,
      zero: 0,
    });
    expect([cost('a'), cost('zero'), cost('new')]).toEqual([10, 0, 4]);
    expect(costOf(['x'], {})('x')).toBe(1);
  });

  it('orders slowest first, ties by path, whatever order items came in', () => {
    const cost = costOf(['b', 'a', 'c'], {a: 2, b: 2, c: 5});
    expect(slowestFirst(['b', 'a', 'c'], cost)).toEqual(['c', 'a', 'b']);
    expect(slowestFirst(['c', 'b', 'a'], cost)).toEqual(['c', 'a', 'b']);
  });

  it('puts every item in exactly one leg, the slowest ones apart', () => {
    const seconds = {a: 9, b: 8, c: 3, d: 3, e: 2, f: 1};
    const legs = splitByDuration(
      Object.keys(seconds),
      2,
      costOf(Object.keys(seconds), seconds),
    );
    expect(legs.flat().sort()).toEqual(Object.keys(seconds).sort());
    expect(legs.findIndex(leg => leg.includes('a'))).not.toBe(
      legs.findIndex(leg => leg.includes('b')),
    );
  });

  it('refuses a split that lost, repeated or added an item', () => {
    expect(() => assertEachOnce(['a', 'b'], [['a'], []])).toThrow(
      'lost or repeated',
    );
    expect(() => assertEachOnce(['a', 'b'], [['a', 'b'], ['a']])).toThrow(
      'lost or repeated',
    );
    expect(() => assertEachOnce(['a', 'b'], [['a'], ['c']])).toThrow('added');
    expect(() => assertEachOnce(['a', 'b'], [['b'], ['a']])).not.toThrow();
  });

  it('is the one split both the Node legs and the contract legs use', () => {
    for (const file of [
      'scripts/vitest-shard-sequencer.mjs',
      '.github/scripts/a11y-contract-shard.mjs',
    ]) {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      expect(source, file).toMatch(
        /from '(\.\.\/)*(\.\/)?(scripts\/)?lib\/duration-split\.mjs'/,
      );
      expect(source, file).not.toMatch(
        /known\[Math\.floor\(known\.length \/ 2\)\]/,
      );
    }
  });
});
