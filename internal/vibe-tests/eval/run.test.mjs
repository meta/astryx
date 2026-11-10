// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {Budget, parseOptions, planJobs} from './run.mjs';

describe('parseOptions', () => {
  it('requires a pinned model and a total cap for a run', () => {
    expect(() => parseOptions(['--budget-usd', '10'])).toThrow(/--model is required/);
    expect(() => parseOptions(['--model', 'm'])).toThrow(/--budget-usd is required/);
    expect(() => parseOptions(['--model', 'm', '--budget-usd', '1', '--run-budget-usd', '2'])).toThrow(/cover at least one run/);
  });

  it('reads defaults and lists', () => {
    const options = parseOptions(['--model', 'm', '--budget-usd', '10', '--tasks', 'a, b']);
    expect(options).toMatchObject({reps: 3, runBudgetUsd: 3, concurrency: 4, taskSet: 'pilot', taskIds: ['a', 'b']});
    expect(options.arms).toEqual(['astryx-vite', 'shadcn-vite']);
  });

  it('needs no model for self-test', () => {
    expect(parseOptions(['--self-test', '--tasks', 'a']).selfTest).toBe(true);
  });

  it('rejects bad numbers', () => {
    expect(() => parseOptions(['--model', 'm', '--budget-usd', '10', '--reps', '0'])).toThrow(/--reps/);
  });
});

describe('planJobs', () => {
  it('interleaves arms inside each task and repeats tasks per rep', () => {
    const jobs = planJobs([{id: 't1'}, {id: 't2'}], [{id: 'a'}, {id: 'b'}], 2);
    expect(jobs.map(job => `${job.rep}:${job.task.id}:${job.arm.id}`)).toEqual([
      '1:t1:a', '1:t1:b', '1:t2:a', '1:t2:b',
      '2:t1:a', '2:t1:b', '2:t2:a', '2:t2:b',
    ]);
  });
});

describe('Budget', () => {
  it('admits runs while their caps fit and waits instead of skipping', async () => {
    const budget = new Budget(10, 3);
    expect(await budget.reserve()).toBe(true);
    expect(await budget.reserve()).toBe(true);
    expect(await budget.reserve()).toBe(true);
    let admitted = false;
    const fourth = budget.reserve().then(result => (admitted = result));
    await Promise.resolve();
    expect(admitted).toBe(false);
    budget.settle(0.5);
    await fourth;
    expect(admitted).toBe(true);
  });

  it('skips when a run cannot fit with nothing in flight', async () => {
    const budget = new Budget(6, 3);
    expect(await budget.reserve()).toBe(true);
    budget.settle(undefined);
    expect(budget.spentUsd).toBe(3);
    expect(await budget.reserve()).toBe(true);
    budget.settle(2.5);
    expect(await budget.reserve()).toBe(false);
  });
});
