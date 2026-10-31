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

const LABEL = 'ci:heavy-lanes';
const HEAVY = [
  'pr-a11y-guards',
  'pr-a11y-specs',
  'pr-a11y',
  'visual-scout',
  'pr-visual',
  'pr-rtl-shard',
  'pr-rtl-merge',
  'pr-rtl',
];
const PR_CLAUSE = `(github.event_name == 'pull_request' && contains(github.event.pull_request.labels.*.name, '${LABEL}'))`;

describe('visual, accessibility and RTL owners', () => {
  // release-check-workflow.test.mjs evaluates them for release-check and
  // visual-maintenance-workflow.test.mjs for labelled and unlabelled pull
  // requests; this pins the shape on every owner.
  it.each(HEAVY)(
    '%s runs on a pull request only with the ci:heavy-lanes label',
    name => {
      const condition = ungated(ci.jobs[name].if);
      expect(condition).toContain(PR_CLAUSE);
      expect(condition.replaceAll(PR_CLAUSE, '')).not.toContain(
        "'pull_request'",
      );
    },
  );

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

describe('the release-check on every push to main', () => {
  const job = heavy.jobs.dispatch;
  const script = job.steps[0].with.script;

  it('runs on a push to main and may dispatch workflows', () => {
    expect(heavy.on).toEqual({push: {branches: ['main']}});
    expect(job.permissions).toEqual({actions: 'write', contents: 'read'});
    expect(job.steps[0].env.SHA).toBe('${{ github.sha }}');
  });

  it('throttles in ci.yml: the dispatched checks share one group that never cancels a running check', () => {
    // GitHub keeps one running and one pending run per group, and a newer
    // dispatch replaces the pending one, so a burst of merges is checked once.
    expect(ci.concurrency.group).toContain(
      "(github.event_name == 'workflow_dispatch' && github.triggering_actor == 'github-actions[bot]' && 'main-heavy-lanes')",
    );
    expect(ci.concurrency['cancel-in-progress']).toBe(
      "${{ github.event_name != 'workflow_dispatch' }}",
    );
    expect(heavy.concurrency).toBeUndefined();
  });

  it("leaves Main's fast checks running for every push", () => {
    expect(Object.keys(main.jobs)).not.toContain('release-check');
    expect(JSON.stringify(main)).not.toContain('createWorkflowDispatch');
  });

  /** Runs the step's script against a fake GitHub API with main at `tip`. */
  async function run(tip) {
    const calls = {dispatch: [], notices: []};
    const github = {
      rest: {
        repos: {getBranch: async () => ({data: {commit: {sha: tip}}})},
        actions: {
          createWorkflowDispatch: async args => calls.dispatch.push(args),
        },
      },
    };
    const body = new Function(
      'github',
      'context',
      'core',
      'process',
      `return (async () => {${script}})();`,
    );
    await body(
      github,
      {repo: {owner: 'meta', repo: 'astryx'}},
      {notice: m => calls.notices.push(m)},
      {env: {SHA: sha}},
    );
    return calls;
  }

  const sha = 'a'.repeat(40);

  it('dispatches release-check on main for the exact pushed commit', async () => {
    expect((await run(sha)).dispatch).toEqual([
      {
        owner: 'meta',
        repo: 'astryx',
        workflow_id: 'ci.yml',
        ref: 'main',
        inputs: {
          operation: 'release-check',
          'release-branch': 'main',
          'expected-head': sha,
        },
      },
    ]);
  });

  it('leaves a commit main has moved past to the newer push', async () => {
    const calls = await run('b'.repeat(40));
    expect(calls.dispatch).toEqual([]);
    expect(calls.notices[0]).toMatch(/newer push/);
  });
});
