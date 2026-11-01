// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Routing contract for the touch interaction proofs in the broad CI lane.
 *
 * The proofs are coverage inside the shared surface (AST-030 FR11), so the
 * `test` join requires pr-interaction, and a failing proof fails `test` (FR7).
 * The job decides its own scope in its first steps (no separate scope job):
 * the proofs apply when the change touches the harness, a component,
 * Storybook, or the proofs' own setup; otherwise every later step skips and
 * the job reports success. A head cut before the proofs existed (no
 * playwright.interaction.config.ts) passes with a notice, and a pull request
 * that deletes the config still runs them, and fails (the scope step's own
 * behavior is in test-scope-action.test.mjs).
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

import {ungated} from './ci-pr-gate.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const ci = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
);
const proofs = ci.jobs['pr-interaction'];
const step = (job, name) =>
  job.steps.find(candidate => candidate.name === name);
const decide = () => proofs.steps.find(candidate => candidate.id === 'scope');
const applies = "steps.scope.outputs.applies == 'true'";

describe('interaction proof routing', () => {
  it('is joined by test', () => {
    expect(ci.jobs.test.needs).toContain('pr-interaction');
    expect(
      step(ci.jobs.test, 'Require expected test-owner outcomes').env,
    ).toMatchObject({
      PR_INTERACTION_RESULT: '${{ needs.pr-interaction.result }}',
    });
  });

  it('always reports, so the join never reads a missing result', () => {
    // Behind the pull-request gate (spec:AST-030 FR17).
    expect(proofs.if).toMatch(/^\$\{\{ \(github\.event_name != 'pull_request'/);
    expect(ungated(proofs.if)).toBe(
      "github.event_name != 'workflow_dispatch' && always() && !cancelled()",
    );
    expect(proofs.needs).toEqual(['build-storybook']);
  });

  it('decides its own scope first, and gates every later step on it', () => {
    expect(proofs.steps[0].with['sparse-checkout']).toBe(
      '.github/actions/test-scope',
    );
    expect(decide().uses).toBe('./.test-scope/.github/actions/test-scope');
    expect(proofs.steps.indexOf(decide())).toBe(1);
    const guards = new Set([
      "Require this pull request's Storybook build",
      'Skip the proofs outside their scope',
    ]);
    for (const candidate of proofs.steps.slice(2)) {
      if (guards.has(candidate.name)) continue;
      expect(candidate.if, candidate.name ?? candidate.uses).toMatch(
        new RegExp(
          `^(always\\(\\) && )?${applies.replace(/[.()|]/g, '\\$&')}$`,
        ),
      );
    }
  });

  it('fails closed when Storybook did not build for proofs that apply', () => {
    expect(step(proofs, "Require this pull request's Storybook build").if).toBe(
      `${applies} && needs.build-storybook.result != 'success'`,
    );
    expect(step(proofs, 'Skip the proofs outside their scope').if).toBe(
      "steps.scope.outputs.applies != 'true'",
    );
    // When it runs, the guard fails the job.
    const guard = spawnSync(
      'bash',
      ['-c', step(proofs, "Require this pull request's Storybook build").run],
      {encoding: 'utf8'},
    );
    expect(guard.status).toBe(1);
  });

  it('skips merge-group runs and heads cut before the proofs existed', () => {
    expect(decide().with).toMatchObject({
      'outside-pull-request': 'skip',
      'requires-head-file': 'playwright.interaction.config.ts',
    });
  });

  it('keeps the harness, components, themes, Storybook and its own setup in scope', () => {
    const pattern = new RegExp(decide().with.paths);
    for (const touched of [
      'internal/interaction-harness/src/scripts.ts',
      'internal/a11y-spec/src/storybook.ts',
      'playwright.interaction.config.ts',
      'packages/core/src/BottomSheet/BottomSheet.tsx',
      // Themes set the motion durations components animate with.
      'packages/themes/neutral/src/neutralTheme.ts',
      'apps/storybook/.storybook/preview.tsx',
      '.github/workflows/ci.yml',
      'package.json',
      'pnpm-lock.yaml',
      // The scope action decides whether the proofs run, so changing it runs them.
      '.github/actions/test-scope/action.yml',
    ]) {
      expect(pattern.test(touched), touched).toBe(true);
    }
    for (const untouched of [
      'docs/specs/AST-030/spec.md',
      'apps/docsite/src/app/page.tsx',
      'packages/core/package.json',
      'packages/themes/neutral/package.json',
      '.github/scripts/native-swift.sh',
    ]) {
      expect(pattern.test(untouched), untouched).toBe(false);
    }
  });
});
