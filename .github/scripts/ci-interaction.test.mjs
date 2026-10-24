// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Routing contract for the touch interaction proofs in the broad CI lane.
 *
 * The proofs are coverage inside the shared surface (AST-030 FR11), so the
 * `test` join requires pr-interaction, and a failing proof fails `test` (FR7).
 * A Linux job decides whether the change touches the harness, a component,
 * Storybook, or the proofs' own setup; only then does pr-interaction take a
 * 4-core runner, and otherwise it passes on Linux without work.
 */

import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const ci = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
);
const scope = ci.jobs['interaction-scope'];
const proofs = ci.jobs['pr-interaction'];
const step = (job, name) =>
  job.steps.find(candidate => candidate.name === name);
const decide = () => step(scope, 'Decide whether the interaction proofs apply');
const applies = "needs.interaction-scope.outputs.applies == 'true'";

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
    expect(proofs.if).toBe(ci.jobs['test-native-swift'].if);
    expect(scope.if).toBe(ci.jobs['native-swift-scope'].if);
  });

  it('decides scope on Linux and takes four cores only when the proofs apply', () => {
    expect(scope['runs-on']).toBe('ubuntu-slim');
    expect(proofs.needs).toEqual([
      'check-scope',
      'interaction-scope',
      'build-storybook',
    ]);
    expect(proofs['runs-on']).toBe(
      "${{ needs.interaction-scope.outputs.applies == 'true' && '4-core-ubuntu' || 'ubuntu-slim' }}",
    );
    const guards = new Set([
      'Require a decided interaction scope',
      "Require this pull request's Storybook build",
      'Skip the proofs outside their scope',
    ]);
    for (const candidate of proofs.steps) {
      if (guards.has(candidate.name)) continue;
      expect(candidate.if, candidate.name ?? candidate.uses).toMatch(
        new RegExp(
          `^(always\\(\\) && )?${applies.replace(/[.()|]/g, '\\$&')}$`,
        ),
      );
    }
  });

  it('fails closed when the scope cannot be decided or Storybook did not build', () => {
    expect(step(scope, 'Require successful scope classification').if).toBe(
      "needs.check-scope.result != 'success'",
    );
    expect(step(proofs, 'Require a decided interaction scope').if).toBe(
      "needs.interaction-scope.result != 'success'",
    );
    expect(step(proofs, "Require this pull request's Storybook build").if).toBe(
      `${applies} && needs.build-storybook.result != 'success'`,
    );
    expect(decide().run).toContain(
      'git show "$BASE_SHA:.github/scripts/pr-scope-touches.sh"',
    );
    // Only "out of scope" (exit 1) skips; unknown (2) runs the proofs.
    expect(decide().run).toContain('if [ "$scope" = 1 ]; then');
  });

  it('keeps the harness, components, Storybook and its own setup in scope', () => {
    const pattern = new RegExp(
      decide().run.match(/bash "\$helper" "\$BASE_SHA" '([^']+)'/)[1],
    );
    for (const touched of [
      'internal/interaction-harness/src/scripts.ts',
      'internal/a11y-spec/src/storybook.ts',
      'playwright.interaction.config.ts',
      'packages/core/src/BottomSheet/BottomSheet.tsx',
      'apps/storybook/.storybook/preview.tsx',
      '.github/workflows/ci.yml',
      'package.json',
      'pnpm-lock.yaml',
    ]) {
      expect(pattern.test(touched), touched).toBe(true);
    }
    for (const untouched of [
      'docs/specs/AST-030/spec.md',
      'apps/docsite/src/app/page.tsx',
      'packages/core/package.json',
      '.github/scripts/native-swift.sh',
    ]) {
      expect(pattern.test(untouched), untouched).toBe(false);
    }
  });

  it('passes without work on docsite-only, tooling-only and merge-group runs', () => {
    expect(decide().env).toMatchObject({
      EVENT_NAME: '${{ github.event_name }}',
      DOCSITE_ONLY: '${{ needs.check-scope.outputs.docsite_only }}',
      TOOLING_ONLY: '${{ needs.check-scope.outputs.tooling_only }}',
    });
    expect(decide().run).toContain(
      'if [ "$DOCSITE_ONLY" = true ] || [ "$TOOLING_ONLY" = true ]; then',
    );
    expect(decide().run).toContain(
      'if [ "$EVENT_NAME" != pull_request ]; then',
    );
  });
});
