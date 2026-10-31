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
  describeWorkflow,
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

describe('runnerClass for an expression without labels', () => {
  it('is unknown, never standard', () => {
    expect(runnerClass('${{ matrix.os }}').kind).toBe('unknown');
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

describe('describeWorkflow', () => {
  it('says when an added workflow runs and on which runners', () => {
    const workflow = describeWorkflow('perf-nightly.yml', null, {
      on: {schedule: [{cron: '17 9 * * *'}], workflow_dispatch: {}},
      jobs: {perf: {'runs-on': 'ubuntu-latest'}},
    });
    expect(workflow).toMatchObject({
      file: 'perf-nightly.yml',
      change: 'added',
      triggers: 'schedule (17 9 \\* \\* \\*), workflow\\_dispatch',
      nonStandard: false,
    });
  });

  it('flags a workflow that moves onto a non-standard runner', () => {
    expect(
      describeWorkflow(
        'nightly.yml',
        {on: 'push', jobs: {a: {'runs-on': 'ubuntu-latest'}}},
        {on: 'push', jobs: {a: {'runs-on': '4-core-ubuntu'}}},
      ).nonStandard,
    ).toBe(true);
  });
});

describe('non-standard moves', () => {
  it('are decided per job id, before variants share a name', () => {
    const diff = diffWorkflow(
      {
        on: 'pull_request',
        jobs: {
          a11y_browser: {name: 'pr-a11y (browser)', 'runs-on': 'ubuntu-latest'},
          a11y_full: {name: 'pr-a11y (full)', 'runs-on': 'ubuntu-latest'},
        },
      },
      {
        on: 'pull_request',
        jobs: {
          a11y_browser: {
            name: 'pr-a11y (browser)',
            'runs-on': 'ubuntu-latest',
            steps: [1],
          },
          a11y_full: {name: 'pr-a11y (full)', 'runs-on': '4-core-ubuntu'},
        },
      },
    );
    expect(diff.changes).toHaveLength(1);
    expect(diff.movedOntoNonStandard).toEqual(['pr-a11y']);
  });

  it('compare another workflow job by job', () => {
    const base = {
      on: 'schedule',
      jobs: {a: {'runs-on': '4-core-ubuntu'}, b: {'runs-on': 'ubuntu-latest'}},
    };
    const head = {
      on: 'schedule',
      jobs: {a: {'runs-on': '4-core-ubuntu'}, b: {'runs-on': '4-core-ubuntu'}},
    };
    expect(describeWorkflow('nightly.yml', base, head).nonStandard).toBe(true);
    expect(describeWorkflow('nightly.yml', base, base).nonStandard).toBe(false);
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
        movedOntoNonStandard: ['build'],
        names: {before: ['build'], after: ['build']},
      },
      history,
      currentJobs: [job('build', 0, 8)],
      currentWallMinutes: 14,
    });
    expect(impact.flags).toEqual([
      'build moves onto a non-standard runner',
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
      /^<details>\n<summary>CI impact: \+1 job-min per update · pool \+1\.9% · time to green \+0\.8 min · standard runners<\/summary>/,
    );
    expect(section).toContain(
      '| Runner pool, runner-minutes a day | 4,160 | 4,240 | +80 (+1.9%) |',
    );
    expect(section).toContain('Changed jobs: size-base removed: standard');
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

  it('lists other changed workflows and counts added ones in the summary', () => {
    const section = renderCiImpact({
      ...impact,
      otherWorkflows: [
        describeWorkflow('perf-nightly.yml', null, {
          on: {schedule: [{cron: '17 9 * * *'}]},
          jobs: {perf: {'runs-on': 'ubuntu-latest'}},
        }),
      ],
    });
    expect(section).toContain('· 1 workflow added</summary>');
    expect(section).toContain(
      'Other workflows: perf-nightly.yml added: runs on schedule (17 9 \\* \\* \\*); standard runners; its minutes are not measured here',
    );
  });

  it('renders job and workflow names from the pull request as literal text', () => {
    const section = renderCiImpact({
      ...impact,
      changes: [
        {
          name: '<img src=x>',
          change: 'added',
          before: null,
          after: runnerClass('ubuntu-latest'),
        },
      ],
      otherWorkflows: [
        describeWorkflow('[evil](https://x.example).yml', null, {
          on: 'push',
          jobs: {},
        }),
      ],
    });
    expect(section).toContain('&lt;img src=x&gt; added: standard');
    expect(section).toContain('\\[evil\\](https://x.example).yml added');
    expect(section).not.toContain('<img');
  });

  it('says so when a CI change could not be measured', () => {
    expect(renderCiImpact({unavailable: true})).toBe(
      '**CI impact:** not measured on this run; the run history or the workflow files could not be read.\n\n',
    );
  });

  it('renders nothing for a pull request that does not change CI', () => {
    expect(renderCiImpact(null)).toBe('');
  });
});
