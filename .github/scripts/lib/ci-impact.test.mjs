// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ci-impact.test.mjs
 * Pins the CI-impact section: which pull requests count as CI changes, the
 * runner class of a `runs-on` value, the job-by-job workflow diff, the
 * before/after estimate (unchanged jobs keep their history, added or changed
 * jobs use this run), the flags, and a section with no prices in it.
 */

import {describe, expect, it} from 'vitest';
import impactLib from './ci-impact.js';

const {
  isCiChange,
  runnerClass,
  diffWorkflow,
  summarizeHistory,
  estimateImpact,
  renderCiImpact,
} = impactLib;

const at = minute => new Date(Date.UTC(2026, 9, 31, 12, minute)).toISOString();
const job = (name, start, end, conclusion = 'success') => ({
  name,
  conclusion,
  started_at: at(start),
  completed_at: at(end),
});

describe('isCiChange', () => {
  it('counts workflows, actions and CI scripts', () => {
    expect(isCiChange(['.github/workflows/ci.yml'])).toBe(true);
    expect(isCiChange(['.github/actions/setup/action.yml'])).toBe(true);
    expect(isCiChange(['.github/scripts/lib/pr-status.js'])).toBe(true);
    expect(isCiChange(['packages/core/src/Button/Button.tsx'])).toBe(false);
  });
});

describe('runnerClass', () => {
  it.each([
    ['ubuntu-latest', 'standard'],
    ['ubuntu-slim', 'standard'],
    ['ubuntu-24.04-arm', 'standard'],
    ['macos-15', 'standard'],
    ['4-core-ubuntu', 'non-standard'],
    ["${{ inputs.release && '4-core-ubuntu' || 'ubuntu-latest' }}", 'mixed'],
  ])('reads %s as %s', (runsOn, kind) => {
    expect(runnerClass(runsOn).kind).toBe(kind);
  });
});

describe('diffWorkflow', () => {
  it('lists added, removed and changed jobs with their runner class', () => {
    const base = {
      on: {pull_request: {}},
      jobs: {
        lint: {'runs-on': 'ubuntu-latest', steps: [1]},
        old: {'runs-on': 'ubuntu-latest'},
        build: {'runs-on': 'ubuntu-latest', steps: [1]},
      },
    };
    const head = {
      on: {pull_request: {}},
      jobs: {
        lint: {'runs-on': 'ubuntu-latest', steps: [1]},
        build: {'runs-on': '4-core-ubuntu', steps: [1]},
        fresh: {name: 'Fresh check', 'runs-on': 'ubuntu-slim'},
      },
    };
    const diff = diffWorkflow(base, head);
    expect(diff.changes.map(change => [change.name, change.change])).toEqual([
      ['build', 'changed'],
      ['Fresh check', 'added'],
      ['old', 'removed'],
    ]);
    expect(diff.triggersChanged).toBe(false);
  });
});

describe('estimateImpact', () => {
  const history = summarizeHistory({
    runsLast7Days: 70,
    runs: [
      {
        run_started_at: at(0),
        updated_at: at(10),
        jobs: [
          job('lint', 0, 2),
          job('build (1/2)', 0, 4),
          job('build (2/2)', 0, 4),
          job('old', 0, 1),
        ],
      },
      {
        run_started_at: at(0),
        updated_at: at(12),
        jobs: [
          job('lint', 0, 2),
          job('build (1/2)', 0, 4),
          job('build (2/2)', 0, 4),
          job('old', 0, 1, 'skipped'),
        ],
      },
    ],
  });

  it('keeps unchanged jobs at their history and uses this run for changed ones', () => {
    expect(history.jobMinutes).toEqual({lint: 2, build: 8, old: 0.5});
    expect(history.runsPerDay).toBe(10);
    const impact = estimateImpact({
      diff: {
        changes: [
          {
            name: 'build',
            change: 'changed',
            before: runnerClass('ubuntu-latest'),
            after: runnerClass('ubuntu-latest'),
          },
          {
            name: 'old',
            change: 'removed',
            before: runnerClass('ubuntu-latest'),
            after: null,
          },
        ],
        triggersChanged: false,
        names: {before: ['lint', 'build', 'old'], after: ['lint', 'build']},
      },
      history,
      currentJobs: [
        job('lint', 0, 9),
        job('build (1/2)', 0, 5),
        job('build (2/2)', 0, 5),
      ],
      currentWallMinutes: 11.5,
    });
    // lint keeps its 2-minute history despite this run's 9; build uses this run's 10.
    expect(impact.jobMinutes).toEqual({before: 10.5, after: 12});
    expect(impact.pool.before).toBe(105);
    expect(impact.pool.after).toBe(120);
    expect(impact.wall).toEqual({before: 11, after: 11.5, delta: 0.5});
    expect(impact.flags).toEqual(['runner-pool usage +14%']);
  });

  it('flags a move onto a non-standard runner, a slower time to green, and new triggers', () => {
    const impact = estimateImpact({
      diff: {
        changes: [
          {
            name: 'build',
            change: 'changed',
            before: runnerClass('ubuntu-latest'),
            after: runnerClass('4-core-ubuntu'),
          },
        ],
        triggersChanged: true,
        names: {before: ['build'], after: ['build']},
      },
      history,
      currentJobs: [job('build', 0, 8)],
      currentWallMinutes: 14,
    });
    expect(impact.flags).toEqual([
      '`build` moves onto a non-standard runner',
      'time to green +3.0 min',
      'the workflow triggers changed, so runs a day may change too',
    ]);
  });
});

describe('renderCiImpact', () => {
  const impact = {
    jobMinutes: {before: 52, after: 53},
    pool: {before: 4160, after: 4240, percent: 1.9},
    concurrent: {before: 2.9, after: 2.94},
    wall: {before: 14.2, after: 15, delta: 0.8},
    runsPerDay: 80,
    sampled: 20,
    changes: [
      {
        name: 'size-base',
        change: 'removed',
        before: runnerClass('ubuntu-latest'),
        after: null,
      },
    ],
    flags: [],
  };

  it('collapses the table under a one-line summary, and names no price', () => {
    const section = renderCiImpact(impact);
    expect(section).toMatch(
      /^<details>\n<summary>CI impact: \+1 job-min per update · pool \+1\.9% · time to green \+0\.8 min · standard runners on pull requests<\/summary>/,
    );
    expect(section).toContain(
      '| Runner pool, runner-minutes a day | 4,160 | 4,240 | +80 (+1.9%) |',
    );
    expect(section).toContain('Changed jobs: `size-base` removed: standard');
    expect(section).not.toMatch(/\$|cost|price|budget/i);
  });

  it('marks a section with flags', () => {
    const section = renderCiImpact({
      ...impact,
      flags: ['runner-pool usage +14%'],
    });
    expect(section).toContain(' ⚠️</summary>');
    expect(section).toContain('**Flags:** runner-pool usage +14%.');
  });

  it('renders nothing for a pull request that does not change CI', () => {
    expect(renderCiImpact(null)).toBe('');
  });
});
