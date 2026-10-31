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

import {ungated} from './ci-pr-gate.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const load = relative => yaml.parse(read(relative));
const ci = load('.github/workflows/ci.yml');
const lint = load('.github/workflows/lint.yml');
const prComment = load('.github/workflows/pr-comment.yml');
const scopeAction = read('.github/actions/test-scope/action.yml');
const TOOLING_FALSE = "steps.scope.outputs.tooling_only != 'true'";
const TOOLING_TRUE = "steps.scope.outputs.tooling_only == 'true'";
const BROAD_ONLY =
  "steps.scope.outputs.docsite_only != 'true' && steps.scope.outputs.spec_only != 'true' && steps.scope.outputs.tooling_only != 'true'";

function step(job, name) {
  return job.steps.find(candidate => candidate.name === name);
}

describe('Node-tooling CI routing', () => {
  it('publishes the tooling output from the trusted-base classifier', () => {
    // ci.yml jobs each run the scope action, which reads the classifier and
    // both dependencies from the PR's base commit.
    expect(scopeAction).toContain('ref: pr.base.sha');
    for (const file of [
      '.github/scripts/change-scope.cjs',
      '.github/scripts/knowledge-paths.cjs',
      'scripts/component-packages.cjs',
    ]) {
      expect(scopeAction).toContain(`'${file}'`);
    }
    expect(read('.github/workflows/ci.yml')).not.toContain(
      'node .github/scripts/change-scope.cjs',
    );
    for (const workflow of ['.github/workflows/lint.yml']) {
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
    for (const key of ['spec_only', 'docsite_only', 'tooling_only']) {
      expect(scopeAction).toContain(`${key}: 'false',`);
    }
    expect(scopeAction).toContain("full_suite: 'true',");
    for (const workflow of ['.github/workflows/lint.yml']) {
      const source = read(workflow);
      expect(source).toContain(
        'docsite_only=false\\nspec_only=false\\ntooling_only=false',
      );
      expect(source).not.toContain('NON_DOCSITE=');
    }
  });

  it('runs the Node project and required lint owners for tooling', () => {
    const nodeSuite = ci.jobs['test-node'].steps.find(candidate =>
      /\bpnpm test:node\b/.test(candidate.run ?? ''),
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
      /^pnpm test:ui\b/.test(candidate.run ?? ''),
    );
    expect(uiSuite.if).toContain(TOOLING_FALSE);
    expect(ungated(ci.jobs['test-build'].if)).toBe(
      "github.event_name != 'workflow_dispatch'",
    );
    expect(
      step(ci.jobs['test-build'], 'Run Build package contracts'),
    ).toMatchObject({
      if: BROAD_ONLY,
      run: 'pnpm test:build',
    });
    // The Build package's owner keeps its contracts, in order: the plugin is
    // built before the cascade guard imports it.
    const rootScripts = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
    ).scripts;
    const buildCommands = rootScripts['test:build'].split(' && ');
    expect(buildCommands).toEqual([
      'vitest run packages/build/src/packed-consumer.test.mjs --project node --maxWorkers=1',
      'pnpm -F @astryxdesign/build build',
      'node .github/scripts/theme-layer-cascade.js',
      'ASTRYX_STYLEX_BROWSER=1 vitest run scripts/stylex-module-resolution.browser.test.mjs --project node --maxWorkers=1',
    ]);
    // The vibe-tests fixtures share test-build's Playwright runner.
    for (const name of [
      'Verify canonical setup compositions',
      'Verify guest fixture contrast',
    ]) {
      expect(step(ci.jobs['test-build'], name).if).toBe(BROAD_ONLY);
    }
    // The merge-base size build is heavy build work and stays off the
    // Node-tooling, docsite, and spec lanes.
    expect(step(ci.jobs['size-base'], 'Setup Node and pnpm').if).toContain(
      BROAD_ONLY,
    );
    expect(rootScripts['test:theme-family'].split(' && ')).toEqual([
      'pnpm -F @astryxdesign/core build',
      'pnpm -F @astryxdesign/sandbox generate:theme-family',
      'node .github/scripts/theme-family-cascade.js',
    ]);
    const familyCommands = new Map([
      [
        'Install Playwright for theme-family contract',
        'npx playwright install chromium',
      ],
      ['Run the theme-family contract', 'pnpm test:theme-family'],
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
    for (const name of [
      'Build docsite workspace dependencies',
      'Build the docsite',
      'test-docsite (start the data tests)',
      'test-docsite-e2e (browser contracts)',
    ]) {
      expect(step(ci.jobs['docsite-test'], name).if).toContain(TOOLING_FALSE);
    }

    for (const candidate of [
      ...ci.jobs['build-storybook'].steps,
      ...ci.jobs.typecheck.steps,
    ]) {
      if (
        candidate.id === 'scope' ||
        candidate.with?.path === '.test-scope' ||
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
      'release-bump',
      'test-ui',
      'test-node',
      'test-build',
      'test-native-swift',
      'pr-interaction',
    ]);
    expect(ci.jobs.build.needs).toEqual(['build-storybook', 'typecheck']);
    const testJoin = step(ci.jobs.test, 'Require expected test-owner outcomes');
    expect(testJoin.run).toBe('node .github/scripts/ci-test-join.mjs');
    expect(ci.jobs.test.permissions).toEqual({
      contents: 'read',
      'pull-requests': 'read',
    });
    // A release-branch pull request is spec-only, but its join still runs to
    // require the release bump's own validation.
    expect(testJoin.if).toBe(
      "steps.scope.outputs.spec_only != 'true' || steps.scope.outputs.release_bump == 'true'",
    );
    expect(testJoin.env).toMatchObject({
      RELEASE_BUMP: '${{ steps.scope.outputs.release_bump }}',
      RELEASE_BUMP_RESULT: '${{ needs.release-bump.result }}',
      DOCSITE_ONLY: '${{ steps.scope.outputs.docsite_only }}',
      SPEC_ONLY: '${{ steps.scope.outputs.spec_only }}',
      TOOLING_ONLY: '${{ steps.scope.outputs.tooling_only }}',
      TEST_UI_RESULT: '${{ needs.test-ui.result }}',
      TEST_NODE_RESULT: '${{ needs.test-node.result }}',
      TEST_BUILD_RESULT: '${{ needs.test-build.result }}',
      TEST_NATIVE_SWIFT_RESULT: '${{ needs.test-native-swift.result }}',
      PR_INTERACTION_RESULT: '${{ needs.pr-interaction.result }}',
    });
    const buildJoin = step(
      ci.jobs.build,
      'Assert parallel builds succeeded',
    ).run;
    expect(buildJoin).toContain(
      '[ "${{ needs.build-storybook.result }}" = "success" ] || exit 1',
    );
    expect(buildJoin).not.toContain('build-sandbox');
    expect(buildJoin).toContain(
      '[ "${{ needs.typecheck.result }}" = "success" ] || exit 1',
    );
  });

  it("measures the merge base from main's kept build, building it only without one", () => {
    const main = load('.github/workflows/deploy.yml');
    const keep = step(
      main.jobs.typecheck,
      "Keep this commit's package builds for PR size reports",
    );
    expect(keep.with.name).toBe(
      'dists-main-${{ needs.main-commit.outputs.sha }}',
    );
    const job = ci.jobs['size-base'];
    expect(job.permissions.actions).toBe('read');
    expect(
      step(job, "Find main's build of the merge base")['continue-on-error'],
    ).toBe(true);
    const download = step(job, "Download main's build of the merge base");
    expect(download['continue-on-error']).toBe(true);
    expect(download.with.name).toBe(
      'dists-main-${{ steps.merge-base.outputs.sha }}',
    );
    const build = step(job, "Build the merge base's component packages");
    expect(build.if).toContain("steps.download.outcome != 'success'");
    expect(build.run).not.toContain('pnpm install');
    // Measuring needs the base's dependencies on both paths.
    const install = step(job, "Install the merge base's dependencies");
    expect(install.run).toBe('pnpm install --frozen-lockfile');
    expect(install.if).not.toContain('steps.download');
    // Only Main's own run on main for the merge-base commit counts.
    const find = step(job, "Find main's build of the merge base").with.script;
    expect(find).toContain("candidate.workflow_run?.head_branch === 'main'");
    expect(find).toContain(
      'candidate.workflow_run?.head_sha === process.env.BASE_SHA',
    );
    expect(find).toContain(
      'candidate.workflow_run?.head_repository_id === candidate.workflow_run?.repository_id',
    );
  });

  it('builds no Sandbox and builds Storybook once per pull-request run', () => {
    // Vercel builds the Sandbox preview; nothing downloaded CI's copy.
    expect(ci.jobs['build-sandbox']).toBeUndefined();
    expect(ci.jobs['build-storybook'].outputs).not.toHaveProperty(
      'sandbox_url',
    );
    const storybookBuilders = Object.entries(ci.jobs).flatMap(([name, job]) =>
      (job.steps ?? [])
        .filter(s =>
          /storybook build|build-packages-and-storybook/.test(s.run ?? ''),
        )
        .filter(
          s => !/^github\.event_name == 'workflow_dispatch'/.test(s.if ?? ''),
        )
        .map(() => name),
    );
    expect(storybookBuilders).toEqual(['build-storybook']);
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
