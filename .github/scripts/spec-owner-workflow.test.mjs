// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);

const root = path.resolve(import.meta.dirname, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

describe('spec-only workflow contract', () => {
  it('keeps classification in one tested helper', () => {
    for (const workflow of [
      '.github/workflows/ci.yml',
      '.github/workflows/lint.yml',
      '.github/workflows/cli-smoke-test.yml',
      '.github/workflows/internal-registry.yml',
      '.github/workflows/pr-comment.yml',
    ]) {
      expect(read(workflow), workflow).toContain(
        '.github/scripts/change-scope.cjs',
      );
    }
    expect(read('.github/scripts/spec-owner-reconcile.cjs')).toContain(
      "require('./change-scope.cjs')",
    );
  });

  it('packages every dependency for trusted-base isolated classification', () => {
    for (const workflow of [
      '.github/workflows/ci.yml',
      '.github/workflows/lint.yml',
      '.github/workflows/cli-smoke-test.yml',
      '.github/workflows/internal-registry.yml',
    ]) {
      const source = read(workflow);
      expect(source, workflow).toContain(
        'git show "origin/${{ github.base_ref }}:.github/scripts/change-scope.cjs"',
      );
      expect(source, workflow).toContain(
        'git show "origin/${{ github.base_ref }}:.github/scripts/knowledge-paths.cjs"',
      );
      expect(source, workflow).toContain(
        'git show "origin/${{ github.base_ref }}:scripts/component-packages.cjs"',
      );
      expect(source, workflow).toContain(
        'CLASSIFIER_ROOT="$RUNNER_TEMP/change-scope"',
      );
    }

    const isolated = fs.mkdtempSync(
      path.join(os.tmpdir(), 'astryx-change-scope-'),
    );
    try {
      const classifierDir = path.join(isolated, '.github/scripts');
      const registryDir = path.join(isolated, 'scripts');
      fs.mkdirSync(classifierDir, {recursive: true});
      fs.mkdirSync(registryDir, {recursive: true});
      for (const file of ['change-scope.cjs', 'knowledge-paths.cjs']) {
        fs.copyFileSync(
          path.join(root, '.github/scripts', file),
          path.join(classifierDir, file),
        );
      }
      fs.copyFileSync(
        path.join(root, 'scripts/component-packages.cjs'),
        path.join(registryDir, 'component-packages.cjs'),
      );
      const output = path.join(isolated, 'github-output');
      const result = spawnSync(
        process.execPath,
        [path.join(classifierDir, 'change-scope.cjs'), '--github-output'],
        {
          encoding: 'utf8',
          env: {...process.env, GITHUB_OUTPUT: output},
          input:
            'A\tpackages/core/src/Table/plugins/rowStatus/useTableRowStatus.spec.md\n',
        },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(fs.readFileSync(output, 'utf8')).toBe(
        'spec_only=true\ndocsite_only=false\ntooling_only=false\nfull_suite=false\n',
      );

      fs.rmSync(path.join(classifierDir, 'knowledge-paths.cjs'));
      const missingDependency = spawnSync(
        process.execPath,
        [path.join(classifierDir, 'change-scope.cjs')],
        {
          encoding: 'utf8',
          input: 'A\tpackages/core/src/Button/Button.spec.md\n',
        },
      );
      expect(missingDependency.status).not.toBe(0);
      expect(missingDependency.stderr).toContain('knowledge-paths.cjs');
    } finally {
      fs.rmSync(isolated, {recursive: true, force: true});
    }
  });

  it('routes spec-only changes without unrelated CI commands', () => {
    const ci = read('.github/workflows/ci.yml');
    expect(ci).toContain(
      'git show "origin/${{ github.base_ref }}:.github/scripts/change-scope.cjs"',
    );
    expect(ci).toContain('spec_only: ${{ steps.scope.outputs.spec_only }}');

    const jobBlock = name => {
      const start = ci.indexOf(`  ${name}:`);
      expect(start, name).toBeGreaterThanOrEqual(0);
      const next = ci.slice(start + 1).search(/^  [a-zA-Z0-9_-]+:\s*$/m);
      return next < 0 ? ci.slice(start) : ci.slice(start, start + 1 + next);
    };
    const unrelatedJobs = [
      'check-components',
      'test-ui',
      'test-node',
      'registry-contract',
      'test',
      'build-storybook',
      'pr-rtl',
    ];
    for (const job of unrelatedJobs) {
      expect(jobBlock(job), job).toContain(
        "needs.check-scope.outputs.spec_only != 'true'",
      );
    }
    expect(jobBlock('build')).toContain(
      "needs.build-storybook.result != 'skipped'",
    );

    const docsite = jobBlock('docsite-test');
    expect(docsite).toContain("needs.check-scope.outputs.spec_only == 'true'");
    expect(docsite).toContain('node scripts/check-knowledge.mjs');

    const lint = read('.github/workflows/lint.yml');
    expect(lint).toContain('.github/scripts/change-scope.cjs');
    expect(lint).not.toContain('node scripts/check-knowledge.mjs');

    for (const workflow of [
      '.github/workflows/cli-smoke-test.yml',
      '.github/workflows/internal-registry.yml',
    ]) {
      const source = read(workflow);
      expect(source, workflow).toContain(
        "if: steps.scope.outputs.spec_only == 'true'",
      );
      const expensiveSteps = source
        .split(/\n      - /)
        .slice(1)
        .filter(step =>
          /(?:github\/actions\/setup|pnpm|playwright|cli-smoke-test|dependency-check)/.test(
            step,
          ),
        );
      expect(expensiveSteps.length, workflow).toBeGreaterThan(0);
      for (const step of expensiveSteps) {
        expect(step, `${workflow}: ${step.slice(0, 60)}`).toContain(
          "steps.scope.outputs.spec_only != 'true'",
        );
      }
    }
  });

  it('sets up dependencies before spec validation and skips heavy spec-only work', () => {
    const ci = read('.github/workflows/ci.yml');
    const block = (start, end) => {
      const from = ci.indexOf(`  ${start}:`);
      expect(from, start).toBeGreaterThanOrEqual(0);
      return ci.slice(from, ci.indexOf(`\n  ${end}:`, from));
    };
    // docsite-test validates spec records itself; the heavy generation lives
    // in docsite-data, which the spec-only lane never starts.
    const docsiteJob = block('docsite-test', 'docsite-data');
    const dataJob = block('docsite-data', 'docsite-browser');

    const checkout = docsiteJob.indexOf('- uses: actions/checkout@v7');
    const setup = docsiteJob.indexOf('- uses: ./.github/actions/setup');
    const validate = docsiteJob.indexOf('- name: Validate spec records');

    expect(checkout).toBeGreaterThanOrEqual(0);
    expect(setup).toBeGreaterThan(checkout);
    expect(validate).toBeGreaterThan(setup);
    expect(docsiteJob.slice(setup, validate)).toContain(
      "if: needs.check-scope.outputs.spec_only == 'true'",
    );
    expect(docsiteJob).not.toContain('- name: Build core package');
    expect(docsiteJob).not.toContain('- name: Generate and test docsite data');

    const header = dataJob.slice(0, dataJob.indexOf('steps:'));
    expect(header).toContain("needs.check-scope.outputs.spec_only != 'true'");
    const build = dataJob.indexOf('- name: Build core package');
    const generate = dataJob.indexOf('- name: Generate and test docsite data');
    expect(build).toBeGreaterThanOrEqual(0);
    expect(generate).toBeGreaterThan(build);
    expect(dataJob.slice(build, generate)).toContain(
      "if: needs.check-scope.outputs.spec_only != 'true'",
    );
    expect(dataJob.slice(generate)).toContain(
      "if: needs.check-scope.outputs.spec_only != 'true'",
    );
  });

  it('skips every Storybook build command for spec-only changes', () => {
    const ci = read('.github/workflows/ci.yml');
    const jobStart = ci.indexOf('  build-storybook:');
    const jobEnd = ci.indexOf('\n  build-sandbox:', jobStart);
    const buildJob = ci.slice(jobStart, jobEnd);
    const steps = buildJob.split(/\n      - name: /).slice(1);
    const commandSteps = steps.filter(step =>
      /\n        run: (?:pnpm|node)/.test(step),
    );

    expect(commandSteps.length).toBeGreaterThan(0);
    for (const step of commandSteps) {
      expect(step).toContain("needs.check-scope.outputs.spec_only != 'true'");
    }
  });

  it('fails closed when file APIs are truncated or scope classification fails', () => {
    const ci = read('.github/workflows/ci.yml');
    expect(ci).toContain(
      "if: ${{ github.event_name != 'workflow_dispatch' && needs.check-scope.outputs.release_bump != 'true' && always() && !cancelled() }}",
    );
    expect(ci).toContain("if: needs.check-scope.result != 'success'");

    const reviewSignal = read('.github/workflows/review-signal.yml');
    expect(reviewSignal).toContain('allFiles.length !== pr.changed_files');

    const prComment = read('.github/workflows/pr-comment.yml');
    expect(prComment).toContain('expectedCount: pull.changed_files');
  });

  it('keeps the schema approval roster within the ENGOWNERS set', () => {
    const {parseOwnerFile} = require('./knowledge-frontmatter.cjs');
    const latestSchema = JSON.parse(read('docs/schemas/knowledge/v4.json'));
    const engineeringOwners = parseOwnerFile(read('.github/ENGOWNERS'));

    for (const owner of latestSchema.approvalOwners) {
      expect(engineeringOwners).toContain(owner);
    }
  });

  it('runs the tested exact-head reconciler from the trusted default branch', () => {
    const workflow = read('.github/workflows/spec-owner-gate.yml');
    const reconciler = read('.github/scripts/spec-owner-reconcile.cjs');
    expect(workflow).toContain(
      'ref: ${{ github.event.repository.default_branch }}',
    );
    expect(workflow).toContain(
      'reconcileSpecOwnerGate({github, context, core})',
    );
    expect(workflow).not.toContain('concurrency:');
    const reconcileCondition = workflow
      .slice(
        workflow.indexOf('    if: >-', workflow.indexOf('  reconcile:')),
        workflow.indexOf('    runs-on:', workflow.indexOf('  reconcile:')),
      )
      .replace(/^    if: >-\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();
    expect(reconcileCondition).toBe(
      "(github.event_name != 'pull_request_review' || github.event.pull_request.head.repo.full_name == github.repository) && (github.event_name != 'issue_comment' || (github.event.issue.pull_request != null && (startsWith(github.event.comment.body, '/approve-spec') || startsWith(github.event.comment.body, '/revoke-spec'))))",
    );
    expect(workflow).toContain('pull_request_review:');
    expect(workflow).toContain('issue_comment:');
    expect(workflow).toContain('permissions: {}');
    expect(workflow).not.toContain('pull_request_review_target');
    // The filter must admit a command that omits the head SHA so the
    // reconciler can answer it; a trailing space would drop it silently.
    expect(workflow).toContain(
      "startsWith(github.event.comment.body, '/approve-spec')",
    );
    expect(workflow).toContain(
      "startsWith(github.event.comment.body, '/revoke-spec')",
    );
    expect(workflow).not.toContain(
      "startsWith(github.event.comment.body, '/approve-spec ')",
    );
    expect(reconciler).toContain('expectedCount: after.changed_files');
    expect(reconciler).toContain('scope.touchesKnowledgeRecords');
    expect(reconciler).toContain('scope.touchesDesignAssets');
    expect(reconciler).toContain('requiredApprovalGroups(records');
    expect(read('.github/scripts/spec-owner-decision.cjs')).toContain(
      "require('./component-design-decisions.cjs')",
    );
    expect(reconciler).toContain("'.github/DESIGNOWNERS'");
    expect(reconciler).toContain("'.github/ENGOWNERS'");
    expect(workflow).not.toContain('SPEC_OWNERS:');
    expect(reconciler).not.toContain('env.SPEC_OWNERS');
    expect(reconciler).toContain(
      'resolveOwnerDecision({...decisionInput, owners: engineeringOwners})',
    );
    expect(reconciler).toContain(
      '...new Set([...engineeringOwners, ...designOwners])',
    );
    expect(reconciler).not.toContain(
      '...new Set([...specOwners, ...engineeringOwners, ...designOwners])',
    );
    // Only a DESIGNOWNER author self-attests, and only the design group
    // reads that attestation.
    expect(reconciler).toContain('designOwners.includes(actor)');
    expect(reconciler).not.toContain('allOwners.has(actor)');
    expect(reconciler).toContain(
      'readyAttestations,\n        owners: designApprovers',
    );
    expect(reconciler).toContain('isSettled(initialPr)');
    expect(reconciler).toContain('isPublishable(headSha)');
    expect(reconciler).toContain('specDecision.approved');
    expect(reconciler).toContain('designDecision.approved');
    expect(reconciler).toContain('themeDecision.approved');
    expect(reconciler).toContain('context: GATE_STATUS_CONTEXT');
    expect(reconciler).toContain('expectedHeadOid: $oid');
    expect(reconciler).toContain('mergeMethod: SQUASH');
    expect(reconciler).toContain('disablePullRequestAutoMerge');
  });

  it('derives the comment trigger from the parser\u2019s own prefixes', () => {
    const workflow = read('.github/workflows/spec-owner-gate.yml');
    const {OWNER_COMMAND_PREFIXES} = require(
      path.join(root, '.github/scripts/spec-owner-decision.cjs'),
    );

    // Every prefix the parser accepts must appear in the trigger, and the
    // trigger must name no prefix the parser does not accept. A mismatch is
    // the silent failure mode: a comment that parses but never dispatches.
    const triggerPrefixes = [
      ...workflow.matchAll(
        /startsWith\(github\.event\.comment\.body, '([^']+)'\)/g,
      ),
    ].map(match => match[1]);
    expect(new Set(triggerPrefixes)).toEqual(new Set(OWNER_COMMAND_PREFIXES));
    for (const prefix of triggerPrefixes) {
      expect(prefix.trimEnd(), prefix).toBe(prefix);
    }
  });

  it('accepts relayed owner decisions only from the configured review app', () => {
    const workflow = read('.github/workflows/spec-owner-gate.yml');
    const reconciler = read('.github/scripts/spec-owner-reconcile.cjs');

    expect(workflow).toContain(
      'repository_dispatch:\n    types: [spec-owner-decision]',
    );
    expect(workflow).toContain(
      'SPEC_DECISION_APP: ${{ vars.SPEC_DECISION_APP }}',
    );
    expect(reconciler).toContain('appLogin: env.SPEC_DECISION_APP');
  });

  it('offers a backfill dispatch that publishes status without landing', () => {
    const workflow = read('.github/workflows/spec-owner-gate.yml');
    const reconciler = read('.github/scripts/spec-owner-reconcile.cjs');

    expect(workflow).toContain('backfill:');
    expect(workflow).toContain('type: boolean');
    expect(reconciler).toContain("context.eventName === 'workflow_dispatch'");
    expect(reconciler).toContain('backfillOnly');
    // The guard must sit after the terminal status and before enablement.
    const publish = reconciler.indexOf(
      "setFinalStatus(initialHead, 'success', successDescription)",
    );
    const guard = reconciler.indexOf('if (backfillOnly) {');
    const enable = reconciler.indexOf('enablePullRequestAutoMerge');
    expect(publish).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(publish);
    expect(enable).toBeGreaterThan(guard);
  });

  it('keeps the last read before a terminal write on the live pull request', () => {
    const reconciler = read('.github/scripts/spec-owner-reconcile.cjs');
    const guard = reconciler.slice(
      reconciler.indexOf('async function isLiveHeadWritable('),
      reconciler.indexOf('async function restoreNewerStatus('),
    );

    expect(guard).toContain('isSettled(live)');
    expect(guard).toContain('live.head.sha !== headSha');
    // isPublishable checks run currency first, then delegates the live read,
    // so the freshest fact at the moment of the write is the pull request.
    const publishable = reconciler.slice(
      reconciler.indexOf('async function isPublishable('),
      reconciler.indexOf('async function restoreNewerStatus('),
    );
    expect(publishable.indexOf('await isCurrentRun(headSha)')).toBeLessThan(
      publishable.indexOf('isLiveHeadWritable(headSha)'),
    );
    expect(reconciler).toContain('treat that status as unverified');

    // Every gate-status write goes through a live guard, restores included.
    const restore = reconciler.slice(
      reconciler.indexOf('async function restoreNewerStatus('),
      reconciler.indexOf('async function isCurrentRun('),
    );
    expect(restore).toContain('await isLiveHeadWritable(headSha)');
    expect(restore.indexOf('await isLiveHeadWritable(headSha)')).toBeLessThan(
      restore.indexOf('createStatus('),
    );
  });

  it('reads a ready attestation back only for a current design owner', () => {
    const reconciler = read('.github/scripts/spec-owner-reconcile.cjs');
    const decision = read('.github/scripts/spec-owner-decision.cjs');

    expect(reconciler).toContain('owners: designOwners');
    expect(decision).toContain('!allowed.has(owner)');
  });

  it('does not run the privileged visual-report path for spec-only PRs', () => {
    const workflow = read('.github/workflows/pr-comment.yml');
    expect(workflow).toContain("needs.resolve.outputs.spec_only != 'true'");
    expect(workflow).toContain("needs.resolve.outputs.spec_only == 'true'");
    expect(workflow).not.toContain("context: 'visual-acceptance'");
  });
});
