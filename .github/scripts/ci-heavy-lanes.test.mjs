// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Visual, accessibility and RTL run on main, not on pull request updates.
 * @input CI, Main and Main heavy lanes workflows, and a mocked GitHub API
 * @output Routing for the heavy owners, the required joins, and Main's
 *   release-check dispatch
 * @position Node contracts for AST-030 FR12 and DEC-7
 */

import fs from 'node:fs';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';
import {ungated} from './ci-pr-gate.mjs';

const read = name =>
  yaml.parse(
    fs.readFileSync(new URL(`../workflows/${name}`, import.meta.url), 'utf8'),
  );
const ci = read('ci.yml');
const heavy = read('main-heavy-lanes.yml');
const main = read('deploy.yml');

const SUITE = {
  'pr-a11y-guards': 'a11y',
  'pr-a11y-specs': 'a11y',
  'pr-a11y': 'a11y',
  'visual-scout': 'visual',
  'pr-visual': 'visual',
  'pr-rtl-shard': 'rtl',
  'pr-rtl-merge': 'rtl',
  'pr-rtl': 'rtl',
};
const HEAVY = Object.keys(SUITE);
const prClause = suite =>
  `(github.event_name == 'pull_request' && needs.run-labels.outputs.${suite} == 'true')`;

describe('visual, accessibility and RTL owners', () => {
  // release-check-workflow.test.mjs evaluates them for release-check and
  // visual-maintenance-workflow.test.mjs for opted-in and other pull
  // requests; this pins the shape on every owner.
  it.each(HEAVY)(
    '%s runs on a pull request only when run-labels opts in its own suite',
    name => {
      const condition = ungated(ci.jobs[name].if);
      expect(condition).toContain(prClause(SUITE[name]));
      expect(condition.replaceAll(prClause(SUITE[name]), '')).not.toContain(
        "'pull_request'",
      );
      // No other suite's decision, and no label read directly.
      for (const other of ['visual', 'a11y', 'rtl']) {
        if (other !== SUITE[name])
          expect(condition).not.toContain(`outputs.${other}`);
      }
      expect(condition).not.toMatch(/labels\.\*\.name, 'ci:(heavy|run-)/);
      expect([ci.jobs[name].needs].flat()).toContain('run-labels');
    },
  );

  it('decides the suites in one gate job from the trusted decision script', () => {
    const gate = ci.jobs['run-labels'];
    expect(gate['runs-on']).toBe('ubuntu-slim');
    expect(gate.permissions).toEqual({
      contents: 'read',
      'pull-requests': 'read',
    });
    expect(gate.outputs).toEqual({
      visual: '${{ steps.decide.outputs.visual }}',
      a11y: '${{ steps.decide.outputs.a11y }}',
      rtl: '${{ steps.decide.outputs.rtl }}',
    });
    expect(gate.steps[0].with).toMatchObject({
      'sparse-checkout':
        '.github/scripts/run-labels.cjs\n.github/scripts/review-signal-decision.cjs\n',
      path: '.run-labels',
      'persist-credentials': false,
    });
    expect(gate.steps[0].with.ref).toBeUndefined();
    expect(gate.steps[1].with.script).toContain(
      '.run-labels/.github/scripts/run-labels.cjs',
    );
    // It runs for the release check too, so its owners' needs succeed there.
    expect(ungated(gate.if)).toBe(
      "github.event_name != 'workflow_dispatch' || inputs.operation == 'release-check'",
    );
  });

  it('names no catch-all heavy label anywhere in the workflows', () => {
    for (const name of fs.readdirSync(
      new URL('../workflows/', import.meta.url),
    ))
      expect(
        fs.readFileSync(
          new URL(`../workflows/${name}`, import.meta.url),
          'utf8',
        ),
        name,
      ).not.toContain('ci:heavy-lanes');
  });

  it('leaves the required joins without a heavy owner, so they still report on every pull request', () => {
    for (const join of ['test', 'build', 'docsite-test']) {
      const needs = [ci.jobs[join].needs].flat();
      for (const owner of HEAVY)
        expect(needs, `${join} needs ${owner}`).not.toContain(owner);
    }
  });

  it('adds no trigger: a label takes effect on the next push or reopen', () => {
    expect(ci.on.pull_request.types).not.toContain('labeled');
  });
});

describe("main's release-check, about once an hour (DEC-10)", () => {
  const job = heavy.jobs.dispatch;
  const script = job.steps[0].with.script;

  it('runs on a push to main and on a quarter-hourly schedule, and may dispatch workflows', () => {
    expect(heavy.on).toEqual({
      push: {branches: ['main']},
      schedule: [{cron: '7,22,37,52 * * * *'}],
    });
    expect(job.permissions).toEqual({actions: 'write', contents: 'read'});
    expect(job.steps[0].env.SHA).toBe('${{ github.sha }}');
  });

  it('decides one push or tick at a time, and ci.yml never cancels a running check', () => {
    // Two pushes deciding at once could both see no recent check.
    expect(heavy.concurrency).toEqual({
      group: 'main-heavy-lanes-dispatch',
      'cancel-in-progress': false,
    });
    // GitHub keeps one running and one pending run per group, and a newer
    // dispatch replaces the pending one.
    expect(ci.concurrency.group).toContain(
      "(github.event_name == 'workflow_dispatch' && github.triggering_actor == 'github-actions[bot]' && 'main-heavy-lanes')",
    );
    expect(ci.concurrency['cancel-in-progress']).toBe(
      "${{ github.event_name != 'workflow_dispatch' }}",
    );
  });

  it("leaves Main's fast checks running for every push", () => {
    expect(Object.keys(main.jobs)).not.toContain('release-check');
    expect(JSON.stringify(main)).not.toContain('createWorkflowDispatch');
  });

  const sha = 'a'.repeat(40);
  const NOW = Date.parse('2026-10-31T12:00:00Z');
  const minutesAgo = minutes => new Date(NOW - minutes * 60000).toISOString();
  const check = (minutes, overrides = {}) => ({
    head_sha: 'c'.repeat(40),
    created_at: minutesAgo(minutes),
    conclusion: 'success',
    triggering_actor: {login: 'github-actions[bot]'},
    ...overrides,
  });

  /**
   * Runs the step's script against a fake GitHub API with main at `tip` and
   * `runs` as ci.yml's dispatched runs on main, newest first.
   */
  async function run({tip = sha, runs = [], eventName = 'push'} = {}) {
    const calls = {dispatch: [], notices: [], listed: []};
    const github = {
      rest: {
        repos: {getBranch: async () => ({data: {commit: {sha: tip}}})},
        actions: {
          listWorkflowRuns: async args => {
            calls.listed.push(args);
            return {data: {workflow_runs: runs}};
          },
          createWorkflowDispatch: async args => calls.dispatch.push(args),
        },
      },
    };
    const body = new Function(
      'github',
      'context',
      'core',
      'process',
      'Date',
      `return (async () => {${script}})();`,
    );
    const FakeDate = {now: () => NOW, parse: Date.parse};
    await body(
      github,
      {repo: {owner: 'meta', repo: 'astryx'}, eventName},
      {notice: m => calls.notices.push(m)},
      {env: {SHA: sha}},
      FakeDate,
    );
    return calls;
  }

  const dispatched = tip => [
    {
      owner: 'meta',
      repo: 'astryx',
      workflow_id: 'ci.yml',
      ref: 'main',
      inputs: {
        operation: 'release-check',
        'release-branch': 'main',
        'expected-head': tip,
      },
    },
  ];

  it("dispatches release-check for main's tip when no check started in the last 55 minutes", async () => {
    const calls = await run({runs: [check(56), check(200)]});
    expect(calls.dispatch).toEqual(dispatched(sha));
    expect(calls.listed).toEqual([
      {
        owner: 'meta',
        repo: 'astryx',
        workflow_id: 'ci.yml',
        event: 'workflow_dispatch',
        branch: 'main',
        per_page: 30,
      },
    ]);
  });

  it('dispatches for the first check there is', async () => {
    expect((await run()).dispatch).toEqual(dispatched(sha));
  });

  it('leaves a push within 55 minutes of the last check to the next one', async () => {
    const calls = await run({runs: [check(20)]});
    expect(calls.dispatch).toEqual([]);
    expect(calls.notices).toEqual([
      'A release-check started 20 minutes ago; the next one, at most 50 minutes from now, covers aaaaaaa.',
    ]);
  });

  it('counts a waiting or running check, but not one replaced while waiting or started by a person', async () => {
    expect(
      (await run({runs: [check(10, {conclusion: null})]})).dispatch,
    ).toEqual([]);
    expect(
      (
        await run({
          runs: [
            check(5, {conclusion: 'cancelled'}),
            check(10, {triggering_actor: {login: 'someone'}}),
          ],
        })
      ).dispatch,
    ).toEqual(dispatched(sha));
  });

  it('does not check a tip twice', async () => {
    const calls = await run({runs: [check(90, {head_sha: sha})]});
    expect(calls.dispatch).toEqual([]);
    expect(calls.notices[0]).toMatch(/already has a release-check/);
  });

  it("picks up the tip a burst left unchecked on the schedule's tick", async () => {
    const tip = 'b'.repeat(40);
    const calls = await run({tip, eventName: 'schedule', runs: [check(60)]});
    expect(calls.dispatch).toEqual(dispatched(tip));
  });

  it('leaves a commit main has moved past to the newer push', async () => {
    const calls = await run({tip: 'b'.repeat(40)});
    expect(calls.dispatch).toEqual([]);
    expect(calls.notices[0]).toMatch(/newer push/);
  });
});
