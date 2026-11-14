#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Fail-closed contract for the pull-request `test` join.
 *
 * Every test owner the join waits on decides its own scope and reports
 * success whether it ran its work or skipped it, so each must have succeeded.
 * The join's own scope outputs must be decided (true or false), never missing,
 * and a release-branch pull request must pass its release-bump validation.
 * Keeping this decision in an executable program lets tests prove every
 * status/scope combination instead of matching shell fragments in the
 * workflow.
 */

const requiredSuccess = [
  ['test-ui', process.env.TEST_UI_RESULT],
  ['test-node', process.env.TEST_NODE_RESULT],
  ['node-browser-contracts', process.env.NODE_BROWSER_CONTRACTS_RESULT],
  ['swizzle-proof-scope', process.env.SWIZZLE_PROOF_SCOPE_RESULT],
  ['test-build', process.env.TEST_BUILD_RESULT],
  ['test-native-swift', process.env.TEST_NATIVE_SWIFT_RESULT],
  ['pr-interaction', process.env.PR_INTERACTION_RESULT],
  ['pr-interaction-webkit', process.env.PR_INTERACTION_WEBKIT_RESULT],
  [
    'pr-component-a11y-contracts',
    process.env.PR_COMPONENT_A11Y_CONTRACTS_RESULT,
  ],
  ['pr-a11y-dependent-audits', process.env.PR_A11Y_DEPENDENT_AUDITS_RESULT],
];

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

for (const [name, result] of requiredSuccess) {
  if (result !== 'success') fail(`${name}: ${result ?? 'missing'}`);
}

// The swizzle proof's legs run exactly when its scope proves a target: they
// must succeed then, and must not have run when it proves none.
const proofMode = process.env.SWIZZLE_PROOF_MODE;
if (!['none', 'affected', 'all'].includes(proofMode)) {
  fail(`swizzle-proof scope: ${proofMode || 'missing'}`);
} else {
  const expectedProof = proofMode === 'none' ? 'skipped' : 'success';
  if (process.env.SWIZZLE_PROOF_RESULT !== expectedProof) {
    fail(
      `swizzle-proof: ${process.env.SWIZZLE_PROOF_RESULT ?? 'missing'} ` +
        `(expected ${expectedProof} for scope ${proofMode})`,
    );
  }
}

// A release-branch pull request must pass its bump validation; any other
// pull request must not have run it.
const expectedBump =
  process.env.RELEASE_BUMP === 'true' ? 'success' : 'skipped';
if (process.env.RELEASE_BUMP_RESULT !== expectedBump) {
  fail(
    `release-bump: ${process.env.RELEASE_BUMP_RESULT ?? 'missing'} ` +
      `(expected ${expectedBump})`,
  );
}

const scopes = [
  ['docsite_only', process.env.DOCSITE_ONLY],
  ['spec_only', process.env.SPEC_ONLY],
  ['tooling_only', process.env.TOOLING_ONLY],
  ['lab_only', process.env.LAB_ONLY],
];
for (const [name, value] of scopes) {
  if (value !== 'true' && value !== 'false') {
    fail(`${name}: ${value ?? 'missing'}`);
  }
}

if (process.exitCode !== 1) {
  console.log(
    'All required test owners reached their expected terminal state.',
  );
}
