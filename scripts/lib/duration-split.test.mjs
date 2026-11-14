// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {
  assertEachOnce,
  costOf,
  fitLegsToBudget,
  medianOf,
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

  it('gives the Node legs their split and the contract legs their median', () => {
    expect(medianOf([5, 1, 3])).toBe(3);
    expect(medianOf([])).toBe(1);
    const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
    expect(read('scripts/vitest-shard-sequencer.mjs')).toMatch(
      /import \{[^}]*splitByDuration[^}]*\} from '\.\/lib\/duration-split\.mjs'/,
    );
    expect(read('.github/scripts/a11y-contract-shard.mjs')).toMatch(
      /import \{medianOf\} from '\.\.\/\.\.\/scripts\/lib\/duration-split\.mjs'/,
    );
    expect(read('.github/scripts/playwright-legs.mjs')).toMatch(
      /import \{[^}]*costOf[^}]*splitByDuration[^}]*\} from '\.\.\/\.\.\/scripts\/lib\/duration-split\.mjs'/,
    );
    expect(read('.github/scripts/a11y-pr-contracts.mjs')).toMatch(
      /import \{[^}]*costOf[^}]*splitByDuration[^}]*\} from '\.\.\/\.\.\/scripts\/lib\/duration-split\.mjs'/,
    );
    for (const file of [
      'scripts/vitest-shard-sequencer.mjs',
      '.github/scripts/a11y-contract-shard.mjs',
      '.github/scripts/playwright-legs.mjs',
      '.github/scripts/a11y-pr-contracts.mjs',
    ])
      expect(read(file), file).not.toMatch(/known\[Math\.floor/);
  });
});

describe('fitting legs to a budget', () => {
  const cost = seconds => item => seconds[item];

  it('keeps every leg within the budget, each item once', () => {
    const seconds = {a: 300, b: 300, c: 300, d: 200, e: 100};
    const plan = fitLegsToBudget(Object.keys(seconds), cost(seconds), {
      budget: 600,
    });
    expect(plan.shares.flat().sort()).toEqual(Object.keys(seconds).sort());
    expect(plan.longest).toBeLessThanOrEqual(600);
    expect(plan.count).toBe(2);
  });

  it('gives an item over the budget a leg of its own without raising the others', () => {
    const seconds = {long: 900, a: 400, b: 400, c: 400};
    const plan = fitLegsToBudget(Object.keys(seconds), cost(seconds), {
      budget: 720,
    });
    expect(plan.shares).toContainEqual(['long']);
    for (const leg of plan.shares.filter(each => !each.includes('long')))
      expect(
        leg.reduce((sum, item) => sum + seconds[item], 0),
      ).toBeLessThanOrEqual(720);
  });

  it('stops at maxLegs even when a leg is still over', () => {
    const seconds = {a: 500, b: 500, c: 500};
    const plan = fitLegsToBudget(Object.keys(seconds), cost(seconds), {
      budget: 600,
      maxLegs: 2,
    });
    expect(plan.count).toBe(2);
    expect(plan.longest).toBe(1000);
  });

  it('starts from the count it is given', () => {
    const seconds = {a: 10, b: 10, c: 10};
    const plan = fitLegsToBudget(Object.keys(seconds), cost(seconds), {
      budget: 600,
      start: 3,
    });
    expect(plan.count).toBe(3);
  });

  it('never plans more legs than maxLegs, even when the items over the budget fill them', () => {
    const seconds = {A: 700, B: 700, C: 700, d: 10};
    const plan = fitLegsToBudget(Object.keys(seconds), cost(seconds), {
      budget: 600,
      maxLegs: 3,
    });
    expect(plan.count).toBe(3);
    expect(plan.shares.flat().sort()).toEqual(['A', 'B', 'C', 'd']);
  });

  it('never plans more legs than maxLegs when every item is over the budget', () => {
    for (const names of [
      ['A', 'B', 'C', 'D'],
      ['A', 'B', 'C', 'D', 'E'],
    ]) {
      const plan = fitLegsToBudget(names, () => 700, {
        budget: 600,
        maxLegs: 3,
      });
      expect(plan.count, names.join('')).toBe(3);
      expect(plan.shares.flat().sort()).toEqual(names);
    }
  });
});
