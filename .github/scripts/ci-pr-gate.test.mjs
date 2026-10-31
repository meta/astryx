// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A pull request runs CI when it is ready and its branch lives in this
 * repository or a maintainer labelled it `ci:run` (spec:AST-030 FR17).
 */

import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

import {PR_CI_GATE, PR_HELD, PR_REPORT_GATE, ungated} from './ci-pr-gate.mjs';

/**
 * Whether a workflow starts when a pull request is opened or updated: any
 * `pull_request` trigger (bare, in a list, or a map) except one that lists
 * only `closed`. A trigger with no `types` takes GitHub's default ones.
 */
function startsOnPullRequest(workflow) {
  const on = workflow.on ?? workflow[true];
  if (on === 'pull_request') return true;
  if (Array.isArray(on)) return on.includes('pull_request');
  if (on == null || typeof on !== 'object' || !('pull_request' in on))
    return false;
  const types = on.pull_request?.types;
  return !(types?.length && types.every(type => type === 'closed'));
}

const dir = path.resolve(import.meta.dirname, '../workflows');
const workflows = fs
  .readdirSync(dir)
  .filter(name => name.endsWith('.yml'))
  .map(name => [
    name,
    yaml.parse(fs.readFileSync(path.join(dir, name), 'utf8')),
  ])
  .filter(([, value]) => startsOnPullRequest(value));
// The jobs that report a required context (build, test, docsite-test, lint).
const REQUIRED = {
  'ci.yml': ['build', 'docsite-test', 'test'],
  'lint.yml': ['lint'],
};

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const startsWithGate = gate => new RegExp(`^(\\$\\{\\{ )?${escape(gate)}`);

function pullRequest({draft = false, fork = false, labels = []}) {
  return {
    draft,
    head: {repo: {full_name: fork ? 'someone/astryx' : 'meta/astryx'}},
    labels: labels.map(name => ({name})),
  };
}

/** Evaluates a gate expression as Actions would, for one event. */
function evaluate(expression, {event = 'pull_request', ...pr}) {
  const github = {
    event_name: event,
    repository: 'meta/astryx',
    event: {pull_request: event === 'pull_request' ? pullRequest(pr) : null},
  };
  const js = expression.replace(
    /\.labels\.\*\.name/g,
    '.labels.map(l => l.name)',
  );
  return Function(
    'github',
    'contains',
    `return Boolean(${js});`,
  )(github, (list, item) => list.includes(item));
}

/**
 * Whether a job's condition starts it for an unlabelled fork with every job it
 * needs skipped, under Actions' rule: a condition with no status-check function
 * (`always()`, `cancelled()`, `failure()`, `success()`) also needs `success()`,
 * which is false once a needed job skipped.
 */
function startsWithNeedsSkipped(condition, needs, pr = {fork: true}) {
  const expression = ungated(condition)
    .replace(`${PR_REPORT_GATE} && (`, '(')
    .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
    .replace(/\.labels\.\*\.name/g, '.labels.map(l => l.name)');
  const hasStatusCheck = /\b(always|cancelled|failure|success)\(\)/.test(
    expression,
  );
  const succeeded = Object.values(needs).every(
    need => need.result === 'success',
  );
  return Function(
    'github',
    'needs',
    'always',
    'cancelled',
    'failure',
    'success',
    'startsWith',
    'contains',
    `return Boolean(${hasStatusCheck ? '' : 'success() && '}(${expression.replace(/needs\.([a-z][a-z0-9-]*)/g, 'needs["$1"]')}));`,
  )(
    {
      event_name: 'pull_request',
      base_ref: 'main',
      repository: 'meta/astryx',
      event: {pull_request: pullRequest(pr)},
    },
    needs,
    () => true,
    () => false,
    () => !succeeded,
    () => succeeded,
    (value, prefix) => String(value ?? '').startsWith(prefix),
    (list, item) => list.includes(item),
  );
}

const runs = event => evaluate(PR_CI_GATE, event);
const held = event => evaluate(PR_HELD, event);

describe('pull-request CI gate (spec:AST-030 FR17)', () => {
  it('selects every workflow a pull request update starts, with or without listed types', () => {
    expect(
      startsOnPullRequest({on: {pull_request: {branches: ['main']}}}),
    ).toBe(true);
    expect(startsOnPullRequest({on: {pull_request: null}})).toBe(true);
    expect(startsOnPullRequest({on: 'pull_request'})).toBe(true);
    expect(startsOnPullRequest({on: ['push', 'pull_request']})).toBe(true);
    expect(startsOnPullRequest({on: {pull_request: {types: ['opened']}}})).toBe(
      true,
    );
    expect(startsOnPullRequest({on: {pull_request: {types: ['closed']}}})).toBe(
      false,
    );
    expect(startsOnPullRequest({on: {push: {branches: ['main']}}})).toBe(false);
    expect(startsOnPullRequest({on: 'push'})).toBe(false);
  });

  it('finds the pull-request workflows', () => {
    expect(workflows.map(([name]) => name).sort()).toEqual([
      'ci.yml',
      'cli-smoke-test.yml',
      'codemod-verify.yml',
      'crowdin-download.yml',
      'internal-registry.yml',
      'lint.yml',
    ]);
  });

  it.each(workflows)(
    '%s starts when a draft is marked ready, never on a label, and gates every job that can start',
    (name, value) => {
      expect((value.on ?? value[true]).pull_request.types).toEqual([
        'opened',
        'synchronize',
        'reopened',
        'ready_for_review',
      ]);
      for (const [id, job] of Object.entries(value.jobs)) {
        const condition = String(job.if ?? '');
        if (REQUIRED[name]?.includes(id)) {
          // Skips only a draft. For an unlabelled fork it starts even when every
          // job it needs skipped, and its first step fails with the reason.
          expect(condition, `${name}/${id}`).toMatch(
            startsWithGate(PR_REPORT_GATE),
          );
          const needs = Object.fromEntries(
            [job.needs ?? []]
              .flat()
              .map(need => [need, {result: 'skipped', outputs: {}}]),
          );
          expect(
            startsWithNeedsSkipped(condition, needs),
            `${name}/${id}`,
          ).toBe(true);
          // A pull request that may run CI keeps the job's own rule: a build
          // join whose Storybook build skipped (spec-only, release bump) skips.
          if (id === 'build') {
            expect(startsWithNeedsSkipped(condition, needs, {}), id).toBe(
              false,
            );
          }
          expect(job.steps[0], `${name}/${id}`).toMatchObject({
            if: `\${{ ${PR_HELD} }}`,
          });
          expect(job.steps[0].run).toContain('exit 1');
          continue;
        }
        // A job that needs others is skipped with them, unless it asks to run
        // anyway; a dispatch-only job never starts on a pull request.
        if (
          job.needs &&
          !/always\(\)|cancelled\(\)|failure\(\)/.test(condition)
        )
          continue;
        if (
          /^(\$\{\{\s*)?(always\(\) && )?github\.event_name == 'workflow_dispatch' &&/.test(
            condition,
          )
        )
          continue;
        expect(condition, `${name}/${id}`).toMatch(startsWithGate(PR_CI_GATE));
      }
    },
  );

  it('models the implicit success() a condition without a status check gets', () => {
    const skipped = {a: {result: 'skipped'}};
    // Without a status-check function, a skipped need skips the job, so a
    // required join that dropped its !cancelled() would pass as skipped.
    expect(
      startsWithNeedsSkipped(
        "${{ github.event_name == 'pull_request' }}",
        skipped,
      ),
    ).toBe(false);
    expect(
      startsWithNeedsSkipped(
        "${{ !cancelled() && github.event_name == 'pull_request' }}",
        skipped,
      ),
    ).toBe(true);
    expect(startsWithNeedsSkipped('${{ always() }}', skipped)).toBe(true);
  });

  it('runs a pull request from a branch here, or from a fork once labelled; never a draft', () => {
    expect(runs({})).toBe(true);
    expect(runs({fork: true})).toBe(false);
    expect(runs({fork: true, labels: ['ci:run']})).toBe(true);
    expect(runs({fork: true, labels: ['ci:heavy-lanes']})).toBe(false);
    expect(runs({draft: true})).toBe(false);
    expect(runs({draft: true, fork: true, labels: ['ci:run']})).toBe(false);
  });

  it('skips the required checks of a draft and fails those of an unlabelled fork', () => {
    const reports = event => evaluate(PR_REPORT_GATE, event) && !held(event);
    expect(reports({})).toBe(true);
    expect(reports({fork: true, labels: ['ci:run']})).toBe(true);
    expect(evaluate(PR_REPORT_GATE, {fork: true})).toBe(true);
    expect(held({fork: true})).toBe(true);
    expect(evaluate(PR_REPORT_GATE, {draft: true})).toBe(false);
  });

  it('passes every event that is not a pull request', () => {
    for (const event of ['push', 'merge_group', 'workflow_dispatch']) {
      expect(runs({event}), event).toBe(true);
      expect(evaluate(PR_REPORT_GATE, {event}) && !held({event}), event).toBe(
        true,
      );
    }
  });
});
