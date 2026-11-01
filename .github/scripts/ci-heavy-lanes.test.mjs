// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Full visual, accessibility and RTL suites run on main; pull request
 *   updates check only touched components.
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

  it('runs pr-visual on every pull request: its full check only with ci:run-visual, otherwise the default touched check', () => {
    const visual = ci.jobs['pr-visual'];
    const condition = ungated(visual.if);
    expect(condition).toContain(
      "(github.event_name == 'pull_request' &&\n  needs.build-storybook.result == 'success')",
    );
    expect(visual.needs).toContain('run-labels');
    const step = name =>
      visual.steps.find(candidate => candidate.name === name);
    expect(step('Run the visual gate for the touched components').if).toContain(
      "needs.run-labels.outputs.visual == 'true'",
    );
    expect(step('Decide the default touched visual check').if).toContain(
      "needs.run-labels.outputs.visual != 'true'",
    );
    const touched = step('Visual check for the default touched components');
    expect(touched.if).toBe(
      "steps.touched.outputs.has_components == 'true' && steps.touched.outputs.visual_components != ''",
    );
    expect(touched.run).toContain('gate.mjs check');
    expect(touched.run).toContain('--tiers component');
    expect(touched.run).toContain('--no-scout');
    expect(touched.run).not.toContain('--dependents');
    expect(touched.run).not.toContain('gate.mjs release');
  });

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
