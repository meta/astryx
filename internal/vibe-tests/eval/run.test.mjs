// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {agentErrorReason, agentFromRecord, Budget, modelMismatch, parseOptions, planJobs, sensitiveRootsFor} from './run.mjs';

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

describe('agentErrorReason', () => {
  it('separates agent failures from library failures', () => {
    expect(agentErrorReason({spawnError: 'ENOENT'})).toMatch(/did not start/);
    expect(agentErrorReason({initModel: 'm-2', result: null}, 'm-1')).toMatch(/started on m-2, not m-1/);
    expect(agentErrorReason({result: null})).toMatch(/no result/);
    expect(agentErrorReason({result: {isError: true, turns: 0, subtype: 'error_during_execution'}})).toMatch(/before its first turn/);
    expect(agentErrorReason({result: {isError: true, turns: 6, subtype: 'error_max_budget_usd'}})).toBeNull();
    expect(agentErrorReason({timedOut: true, result: null})).toBeNull();
  });
});

describe('modelMismatch', () => {
  it('requires the pinned model and allows a helper model', () => {
    expect(modelMismatch({initModel: 'm-1', result: {models: ['m-1', 'helper']}}, 'm-1')).toBe(false);
    expect(modelMismatch({initModel: 'm-2', result: {models: ['m-2']}}, 'm-1')).toBe(true);
    expect(modelMismatch({initModel: null, result: {models: ['helper']}}, 'm-1')).toBe(true);
  });
});

describe('regrade', () => {
  it('keeps a timed-out run out of model-mismatch', () => {
    const timedOut = {agent: {exitCode: null, timedOut: true, initModel: 'm-1'}};
    expect(modelMismatch(agentFromRecord(timedOut), 'm-1')).toBe(false);
    const other = {agent: {initModel: 'm-2', models: ['m-2']}};
    expect(modelMismatch(agentFromRecord(other), 'm-1')).toBe(true);
  });
});

describe('sensitiveRootsFor', () => {
  it('lists the run, other runs, the repository and the home folder by given and real path', () => {
    const roots = sensitiveRootsFor(os.tmpdir());
    expect(roots).toContain(path.join(os.tmpdir(), 'astryx-vibe-eval'));
    expect(roots).toContain(fs.realpathSync(os.homedir()));
    expect(roots).toContain(path.resolve(os.homedir()));
  });
});
