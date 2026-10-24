// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ci-tooling-routing.test.mjs
 * @description Pins the first positive CI surface lane: admitted score-ledger
 *   tooling runs Node and lint owners while unrelated UI/browser/build work skips.
 * @input CI and lint workflow YAML.
 * @output Mutation-sensitive assertions for trusted classification, owned work,
 *   fail-closed fallbacks, and historical join jobs.
 * @position Workflow contract for spec:AST-030's first implementation slice.
 */

import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const load = relative => yaml.parse(read(relative));
const ci = load('.github/workflows/ci.yml');
const lint = load('.github/workflows/lint.yml');
const prComment = load('.github/workflows/pr-comment.yml');
const TOOLING_FALSE = "needs.check-scope.outputs.tooling_only != 'true'";
const TOOLING_TRUE = "needs.check-scope.outputs.tooling_only == 'true'";
const BROAD_ONLY =
  "needs.check-scope.outputs.docsite_only != 'true' && needs.check-scope.outputs.spec_only != 'true' && needs.check-scope.outputs.tooling_only != 'true'";

function step(job, name) {
  return job.steps.find(candidate => candidate.name === name);
}

describe('Node-tooling CI routing', () => {
  it('publishes the tooling output from the trusted-base classifier', () => {
    expect(ci.jobs['check-scope'].outputs.tooling_only).toContain(
      'steps.scope.outputs.tooling_only',
    );
    for (const workflow of [
      '.github/workflows/ci.yml',
      '.github/workflows/lint.yml',
    ]) {
      const source = read(workflow);
      expect(source).toContain(
        'git show "origin/${{ github.base_ref }}:.github/scripts/change-scope.cjs"',
      );
      expect(source).toContain(
        'git show "origin/${{ github.base_ref }}:.github/scripts/knowledge-paths.cjs"',
      );
      expect(source).toContain(
        'git show "origin/${{ github.base_ref }}:scripts/component-packages.cjs"',
      );
      expect(source).toContain('| node "$CLASSIFIER" --github-output');
      expect(source).not.toContain(
        '| node .github/scripts/change-scope.cjs --github-output',
      );
    }
  });

  it('grants no specialized lane without a merge base or trusted dependency', () => {
    for (const workflow of [
      '.github/workflows/ci.yml',
      '.github/workflows/lint.yml',
    ]) {
      const source = read(workflow);
      expect(source).toContain(
        'docsite_only=false\\nspec_only=false\\ntooling_only=false',
      );
      expect(source).not.toContain('NON_DOCSITE=');
    }
  });

  it('runs the Node project and required lint owners for tooling', () => {
    const nodeSuite = ci.jobs['test-node'].steps.find(candidate =>
      candidate.run?.includes('--project node'),
    );
    expect(nodeSuite.if).not.toContain('tooling_only');
    expect(
      ci.jobs['test-node'].steps.find(candidate =>
        candidate.uses?.includes('.github/actions/setup'),
      ).if,
    ).not.toContain('tooling_only');

    for (const name of ['Check repository guardrails', 'Run ESLint']) {
      expect(step(lint.jobs.lint, name).if).not.toContain('tooling_only');
    }
  });

  it('skips UI/browser owners but keeps an explicit component N/A reporter', () => {
    const uiSuite = ci.jobs['test-ui'].steps.find(candidate =>
      candidate.run?.includes('--project ui'),
    );
    expect(uiSuite.if).toContain(TOOLING_FALSE);
    expect(ci.jobs['check-components'].if).not.toContain(TOOLING_FALSE);
    const componentCheck = step(
      ci.jobs['check-components'],
      'Check for component changes',
    ).run;
    expect(componentCheck).toContain('needs.check-scope.outputs.tooling_only');
    expect(componentCheck).toContain('has_components=false');
    expect(ci.jobs['test-build'].if).toBe(
      `github.event_name != 'workflow_dispatch' && ${BROAD_ONLY}`,
    );
    expect(step(ci.jobs['test-build'], 'Build the Vite plugin').run).toBe(
      'pnpm -F @astryxdesign/build build',
    );
    expect(
      step(ci.jobs['test-build'], 'Run Build CSS-layer cascade guard').run,
    ).toBe('node .github/scripts/theme-layer-cascade.js');
    expect(ci.jobs['fixture-contrast'].if).toContain(TOOLING_FALSE);
    // The merge-base size build is heavy build work and stays off the
    // Node-tooling, docsite, and spec lanes.
    expect(ci.jobs['size-base'].if).toContain(BROAD_ONLY);
    const familyCommands = new Map([
      [
        'Install Playwright for theme-family contract',
        'npx playwright install chromium',
      ],
      [
        'Build theme-family compiler dependencies',
        'pnpm -F @astryxdesign/core build',
      ],
      [
        'Generate the maintained theme-family fixture',
        'pnpm -F @astryxdesign/sandbox generate:theme-family',
      ],
      [
        'Run theme family cascade guard',
        'node .github/scripts/theme-family-cascade.js',
      ],
    ]);
    for (const [name, command] of familyCommands) {
      const ownerStep = step(ci.jobs['test-node'], name);
      // One leg of the sharded Node lane owns the theme-family contract.
      expect(ownerStep.if).toBe(`matrix.shard == 1 && ${BROAD_ONLY}`);
      expect(ownerStep.run).toBe(command);
      expect(step(ci.jobs['test-build'], name)).toBeUndefined();
    }
  });

  it('keeps required build and docsite contexts green without their heavy work', () => {
    expect(
      step(ci.jobs['docsite-test'], 'Skip docsite work for Node tooling').if,
    ).toContain(TOOLING_TRUE);
    expect(ci.jobs['docsite-data'].if).toContain(TOOLING_FALSE);
    for (const name of [
      'Build core package',
      'Build canary component packages',
      'Generate and test docsite data',
    ]) {
      expect(step(ci.jobs['docsite-data'], name).if).toContain(TOOLING_FALSE);
    }

    expect(ci.jobs['build-sandbox'].if).toContain(TOOLING_FALSE);
    for (const candidate of [
      ...ci.jobs['build-storybook'].steps,
      ...ci.jobs.typecheck.steps,
    ]) {
      if (
        candidate.name === 'Require successful scope classification' ||
        candidate.name === 'Skip heavy work for a specialized lane' ||
        candidate.name === 'Skip typechecks for a specialized lane'
      ) {
        continue;
      }
      if (candidate.run || candidate.uses) {
        expect(candidate.if, candidate.name ?? candidate.run).toContain(
          TOOLING_FALSE,
        );
      }
    }
  });

  it('preserves the historical joins and fails them on owned-lane failure', () => {
    expect(ci.jobs.test.needs).toEqual([
      'check-scope',
      'test-ui',
      'test-node',
      'test-build',
      'registry-contract',
      'test-native-swift',
    ]);
    expect(ci.jobs.build.needs).toEqual([
      'build-storybook',
      'build-sandbox',
      'typecheck',
    ]);
    const testJoin = step(ci.jobs.test, 'Require expected test-owner outcomes');
    expect(testJoin.run).toBe('node .github/scripts/ci-test-join.mjs');
    expect(ci.jobs.test.permissions).toEqual({contents: 'read'});
    expect(testJoin.env).toMatchObject({
      CHECK_SCOPE_RESULT: '${{ needs.check-scope.result }}',
      DOCSITE_ONLY: '${{ needs.check-scope.outputs.docsite_only }}',
      SPEC_ONLY: '${{ needs.check-scope.outputs.spec_only }}',
      TOOLING_ONLY: '${{ needs.check-scope.outputs.tooling_only }}',
      TEST_UI_RESULT: '${{ needs.test-ui.result }}',
      TEST_NODE_RESULT: '${{ needs.test-node.result }}',
      TEST_BUILD_RESULT: '${{ needs.test-build.result }}',
      REGISTRY_CONTRACT_RESULT: '${{ needs.registry-contract.result }}',
      TEST_NATIVE_SWIFT_RESULT: '${{ needs.test-native-swift.result }}',
    });
    const buildJoin = step(
      ci.jobs.build,
      'Assert parallel builds succeeded',
    ).run;
    expect(buildJoin).toContain('needs.build-storybook.result');
    expect(buildJoin).toContain('needs.build-sandbox.result');
    expect(buildJoin).toContain(
      '[ "${{ needs.typecheck.result }}" = "success" ] || exit 1',
    );
  });

  it('keeps removed preview publication out of the tooling lane', () => {
    expect(prComment.jobs.resolve.outputs.tooling_only).toContain(
      'steps.identity.outputs.tooling_only',
    );
    expect(prComment.jobs['deploy-preview']).toBeUndefined();
    expect(prComment.jobs.comment.if).toContain(
      "needs.resolve.outputs.tooling_only != 'true'",
    );
    expect(prComment.jobs['spec-only-reconcile'].if).toContain(
      "needs.resolve.outputs.tooling_only == 'true'",
    );
    expect(
      step(prComment.jobs['spec-only-reconcile'], 'Report no visual scope').run,
    ).toContain('canonical visual checks are not applicable');
    expect(prComment.jobs.invalidate).toBeUndefined();
  });
});
