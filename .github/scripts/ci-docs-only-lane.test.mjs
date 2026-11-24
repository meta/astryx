// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: a change that touches no package or docsite code (root
 *   Markdown, the license, docs/, Changesets) resolves `build`, `test` and
 *   `docsite-test` green at once, with "not affected", and is never deferred.
 *
 * The trusted classifier puts a docs-only change in the spec-only lane
 * (change-scope.cjs `--github-output`), so every heavy job skips its work and
 * only the tests that read a changed document run. The three required joins
 * say why they pass. Lint keeps the repository guardrails for such a change.
 */

import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const load = file => yaml.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const ci = load('.github/workflows/ci.yml');
const lint = load('.github/workflows/lint.yml');
const action = load('.github/actions/test-scope/action.yml');
const actionSource = fs.readFileSync(
  path.join(root, '.github/actions/test-scope/action.yml'),
  'utf8',
);
const step = (job, name) => job.steps.find(each => each.name === name);
const NOT_AFFECTED = 'Not affected: no package or docsite changes';

describe('the docs-only lane', () => {
  it('is an output of the scope action, false unless the classifier says so', () => {
    expect(action.outputs.docs_only.value).toBe(
      '${{ steps.scope.outputs.docs_only }}',
    );
    expect(actionSource).toMatch(
      /const everything = \{[^}]*docs_only: 'false',/,
    );
  });

  it('reaches each required join from a job that runs in every attempt, and is never deferred', () => {
    for (const name of ['build-storybook', 'docsite-build'])
      expect(ci.jobs[name].outputs.docs_only, name).toBe(
        '${{ steps.scope.outputs.docs_only }}',
      );
    // A docs-only change comes in as spec_only, which the decision exempts.
    const decide = step(
      ci.jobs['heavy-ci'],
      'Defer the heavy suites unless the change is spec-only, docs-only or Lab-only',
    );
    expect(decide.env.SPEC_ONLY).toBe('${{ steps.scope.outputs.spec_only }}');
    expect(decide.run).toContain(
      'if [ "$SPEC_ONLY" = true ] || [ "$LAB_ONLY" = true ]',
    );
  });

  it.each([
    ['build', "needs.build-storybook.outputs.docs_only == 'true'"],
    ['docsite-test', "needs.docsite-build.outputs.docs_only == 'true'"],
    ['test', "steps.scope.outputs.docs_only == 'true'"],
  ])('lets %s pass at once and say why', (name, condition) => {
    const job = ci.jobs[name];
    const notice = step(job, NOT_AFFECTED);
    expect(notice, name).toBeDefined();
    expect(notice.if).toBe(condition);
    expect(notice.run).toContain(
      `::notice title=Not affected::${NOT_AFFECTED}: this change touches only documentation, records or release notes, so there is nothing to build or test.`,
    );
    expect(notice.run).toContain('>> "$GITHUB_STEP_SUMMARY"');
    // It reports on its own, never through the deferral path.
    expect(notice.run).not.toContain('exit 1');
    if (name === 'test') {
      // The test join reads its own scope, so the notice follows it.
      expect(job.steps.indexOf(notice)).toBeGreaterThan(
        job.steps.indexOf(step(job, "Decide this job's scope")),
      );
    } else {
      expect(job.steps.indexOf(notice)).toBeLessThan(
        job.steps.indexOf(step(job, 'Heavy CI deferred')),
      );
    }
  });

  it('still fails the test join when a test that reads a changed document fails', () => {
    const join = step(ci.jobs.test, 'Require expected test-owner outcomes');
    expect(join.if).toContain("steps.scope.outputs.docs_only == 'true'");
  });

  it('reads docs-only as the spec-only lane wherever the JSON result is read', () => {
    expect(
      fs.readFileSync(
        path.join(root, '.github/workflows/pr-comment.yml'),
        'utf8',
      ),
    ).toContain(
      "core.setOutput('spec_only', String(changeScope.specOnly || changeScope.docsOnly === true));",
    );
    const preflight = fs.readFileSync(
      path.join(root, 'scripts/preflight.mjs'),
      'utf8',
    );
    expect(
      preflight.split(
        'const specOnly = scope.specOnly || scope.timesOnly || scope.docsOnly === true;',
      ),
    ).toHaveLength(3);
  });

  it('keeps the repository guardrails in lint for a docs-only change', () => {
    const lane =
      "steps.scope.outputs.docsite_only != 'true' && (steps.scope.outputs.spec_only != 'true' || steps.scope.outputs.docs_only == 'true')";
    const steps = lint.jobs.lint.steps;
    expect(steps.find(each => each.id === 'setup').if).toBe(lane);
    expect(step(lint.jobs.lint, 'Check repository guardrails').if).toBe(lane);
    // ESLint itself still skips: no code changed.
    expect(step(lint.jobs.lint, 'Run ESLint').if).toBe(
      "steps.scope.outputs.docsite_only != 'true' && steps.scope.outputs.spec_only != 'true'",
    );
  });
});
