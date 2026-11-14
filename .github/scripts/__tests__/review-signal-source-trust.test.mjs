// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regression test: review-signal HEAD source must come from the base repo
 *
 * Validates that review-signal.yml reads HEAD source bytes from the base
 * repository's merge ref (refs/pull/<n>/merge), NOT from the fork's own
 * content API. Reading from the fork lets a malicious DESIGNOWNER craft
 * source bytes that make classifyVisualDiff() believe a backdoor is
 * appearance-only, bypassing the code review gate.
 *
 * This test statically analyses the workflow YAML to assert the fix is in
 * place and hasn't regressed.
 *
 * Run: node .github/scripts/__tests__/review-signal-source-trust.test.mjs
 */

import {strict as assert} from 'node:assert';
import {describe, it} from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Resolve the repo root from this file's location relative to the repo.
// This file lives at .github/scripts/__tests__/, so root is three dirs up.
const ROOT = path.resolve(process.cwd());
const WORKFLOW_PATH = path.join(ROOT, '.github', 'workflows', 'review-signal.yml');

describe('review-signal.yml — HEAD source trust boundary', () => {
  let workflowContent;

  it('workflow file exists', () => {
    workflowContent = fs.readFileSync(WORKFLOW_PATH, 'utf8');
    assert.ok(workflowContent.length > 0);
  });

  it('does NOT read HEAD source from pr.head.repo (fork)', () => {
    // The vulnerable pattern was:
    //   readSource(pr.head.repo.full_name, pr.head.sha, file.filename)
    // This reads from the fork, which the attacker controls.
    //
    // After the fix, the HEAD source is read from the base repo's merge ref:
    //   readSource(`${owner}/${repo}`, headRef, file.filename)
    //
    // Ensure the vulnerable pattern is NOT present in the readSource calls
    // that feed into the `sources` object for classifyVisualDiff.

    // Find the section between "readSource" and "classifyVisualDiff"
    const classifierSection = workflowContent.slice(
      workflowContent.indexOf('async function readSource'),
      workflowContent.indexOf('classifyVisualDiff'),
    );

    // The VULNERABLE pattern: readSource with pr.head.repo.full_name
    // as the first argument (reads from fork)
    const vulnerablePattern = /readSource\s*\(\s*pr\.head\.repo\.full_name/;
    const isVulnerable = vulnerablePattern.test(classifierSection);

    assert.equal(
      isVulnerable,
      false,
      'SECURITY REGRESSION: review-signal.yml must NOT read HEAD source bytes ' +
        'from pr.head.repo.full_name (fork). A fork author can forge source ' +
        'content to bypass the code review gate. Read from the base repo\'s ' +
        'merge ref instead (refs/pull/<n>/merge).',
    );
  });

  it('reads HEAD source from base repo merge ref', () => {
    // After the fix, the HEAD source should be read from the base repo
    // using the merge ref: refs/pull/${pr.number}/merge
    const hasMergeRef = /refs\/pull\/.*\/merge/.test(workflowContent);
    assert.ok(
      hasMergeRef,
      'review-signal.yml should read HEAD source from the merge ref ' +
        '(refs/pull/<n>/merge) in the base repo, not from the fork.',
    );
  });

  it('base source is still read from pr.base (trusted)', () => {
    // The base source should still come from pr.base.repo.full_name
    // (the upstream repo) — this was already correct.
    // Search the whole workflow since the readSource calls may appear
    // after the classifyVisualDiff call within the same script block.
    const hasBaseRepoRef = workflowContent.includes('pr.base.repo.full_name');
    assert.ok(
      hasBaseRepoRef,
      'Base source should still be read from pr.base.repo.full_name (trusted).',
    );

    // And verify it's NOT the HEAD source call that uses pr.base.repo
    // (the HEAD source should use owner/repo + merge ref).
    const headSourceSection = workflowContent.slice(
      workflowContent.lastIndexOf('readSource('),
    );
    const headUsesBaseRepo = /^readSource\s*\(\s*\n\s*pr\.base\.repo\.full_name/s.test(
      headSourceSection,
    );
    // The SECOND readSource call is for the HEAD side — it should NOT
    // use pr.base.repo (that would read the wrong version of the file).
    // It also shouldn't use pr.head.repo (fork, the original vuln).
    // It should use the base repo's merge ref.
    assert.equal(
      headUsesBaseRepo,
      false,
      'The HEAD readSource call should use the merge ref, not pr.base.repo.',
    );
  });

  it('classify-visual.js is loaded from trusted BASE ref, not fork', () => {
    // The classifier itself (classify-visual.js) must be loaded from
    // pr.base.sha (the base branch), NOT from the fork.
    const classifierLoad = workflowContent.match(
      /getContent\(\{[^}]*path:\s*'\.github\/scripts\/lib\/classify-visual\.js'[^}]*\}/s,
    );
    assert.ok(classifierLoad, 'Should load classify-visual.js via getContent');

    // Check that the ref is pr.base.sha (trusted)
    const loadSection = classifierLoad[0];
    assert.ok(
      /ref:\s*pr\.base\.sha/.test(loadSection),
      'classify-visual.js must be loaded from pr.base.sha (trusted base), ' +
        'not from the fork head.',
    );
  });

  it('SECURITY: documents the trust boundary in comments', () => {
    // The fix should include a security comment explaining WHY we read
    // from the merge ref instead of the fork.
    assert.ok(
      /SECURITY FIX/.test(workflowContent) ||
        /trust boundary/.test(workflowContent) ||
        /attacker.controlled/.test(workflowContent) ||
        /fork.*forge/.test(workflowContent) ||
        /malicious.*DESIGNOWNER/.test(workflowContent),
      'The fix should include a security comment explaining the trust boundary.',
    );
  });
});

describe('review-signal.yml — helper script trust', () => {
  it('rate-limit-backoff loaded from workflow SHA (trusted)', () => {
    const workflowContent = fs.readFileSync(WORKFLOW_PATH, 'utf8');
    // context.sha in pull_request_target is the base branch SHA
    const helperFetch = workflowContent.match(
      /raw\.githubusercontent\.com\/[^/]+\/[^/]+\/\$\{context\.sha\}/,
    );
    assert.ok(
      helperFetch,
      'rate-limit-backoff should be fetched using context.sha (base branch).',
    );
  });

  it('review-signal-decision loaded from workflow SHA (trusted)', () => {
    const workflowContent = fs.readFileSync(WORKFLOW_PATH, 'utf8');
    const decisionLoad = workflowContent.match(
      /getContent\(\{[^}]*ref:\s*context\.sha[^}]*path:\s*'\.github\/scripts\/review-signal-decision\.cjs'/s,
    );
    assert.ok(
      decisionLoad,
      'review-signal-decision.cjs should be loaded using context.sha (trusted).',
    );
  });
});
