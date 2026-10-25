#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Fail-closed contract for the pull-request `test` join.
 *
 * The Build test owner is intentionally skipped for the admitted lightweight
 * scopes. Every other scope must execute it successfully. Keeping this decision
 * in an executable program lets tests prove every status/scope combination
 * instead of matching shell fragments in the workflow.
 */

const requiredSuccess = [
  ['test-ui', process.env.TEST_UI_RESULT],
  ['test-node', process.env.TEST_NODE_RESULT],
  ['registry-contract', process.env.REGISTRY_CONTRACT_RESULT],
  ['test-native-swift', process.env.TEST_NATIVE_SWIFT_RESULT],
  ['pr-interaction', process.env.PR_INTERACTION_RESULT],
];

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

if (process.env.CHECK_SCOPE_RESULT !== 'success') {
  fail(`check-scope: ${process.env.CHECK_SCOPE_RESULT ?? 'missing'}`);
}

for (const [name, result] of requiredSuccess) {
  if (result !== 'success') fail(`${name}: ${result ?? 'missing'}`);
}

const scopes = [
  ['docsite_only', process.env.DOCSITE_ONLY],
  ['spec_only', process.env.SPEC_ONLY],
  ['tooling_only', process.env.TOOLING_ONLY],
];
for (const [name, value] of scopes) {
  if (value !== 'true' && value !== 'false') {
    fail(`${name}: ${value ?? 'missing'}`);
  }
}

const isSpecialized = scopes.some(([, value]) => value === 'true');
const expectedBuild = isSpecialized ? 'skipped' : 'success';
if (process.env.TEST_BUILD_RESULT !== expectedBuild) {
  fail(
    `test-build: ${process.env.TEST_BUILD_RESULT ?? 'missing'} ` +
      `(expected ${expectedBuild} for this scope)`,
  );
}

if (process.exitCode !== 1) {
  console.log(
    'All required test owners reached their expected terminal state.',
  );
}
