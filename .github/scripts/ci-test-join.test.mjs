// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file Mutation-sensitive scope/status matrix for the pull-request test join. */

import {execFileSync} from 'node:child_process';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

const script = path.join(import.meta.dirname, 'ci-test-join.mjs');
const broad = {
  CHECK_SCOPE_RESULT: 'success',
  DOCSITE_ONLY: 'false',
  SPEC_ONLY: 'false',
  TOOLING_ONLY: 'false',
  TEST_UI_RESULT: 'success',
  TEST_NODE_RESULT: 'success',
  TEST_BUILD_RESULT: 'success',
  REGISTRY_CONTRACT_RESULT: 'success',
  TEST_NATIVE_SWIFT_RESULT: 'success',
  PR_INTERACTION_RESULT: 'success',
};

// An override of `null` removes the variable, as a missing `needs` result would.
function run(overrides = {}) {
  const env = {...process.env, ...broad, ...overrides};
  for (const [name, value] of Object.entries(env)) {
    if (value === null) delete env[name];
  }
  try {
    const stdout = execFileSync(process.execPath, [script], {
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {status: 0, output: stdout};
  } catch (error) {
    return {
      status: error.status ?? 1,
      output: `${error.stdout ?? ''}${error.stderr ?? ''}`,
    };
  }
}

describe('pull-request test join', () => {
  it('requires every owner on broad scope', () => {
    expect(run()).toMatchObject({status: 0});
    for (const [name, value] of [
      ['TEST_UI_RESULT', 'failure'],
      ['TEST_NODE_RESULT', 'cancelled'],
      ['TEST_BUILD_RESULT', 'skipped'],
      ['REGISTRY_CONTRACT_RESULT', 'failure'],
      ['TEST_NATIVE_SWIFT_RESULT', 'failure'],
      ['TEST_NATIVE_SWIFT_RESULT', 'skipped'],
      ['PR_INTERACTION_RESULT', 'failure'],
      ['PR_INTERACTION_RESULT', 'skipped'],
      ['PR_INTERACTION_RESULT', 'cancelled'],
      ['PR_INTERACTION_RESULT', null],
    ]) {
      expect(run({[name]: value}), name).toMatchObject({status: 1});
    }
  });

  it.each(['DOCSITE_ONLY', 'SPEC_ONLY', 'TOOLING_ONLY'])(
    'accepts a skipped Build owner only for %s',
    scope => {
      expect(
        run({[scope]: 'true', TEST_BUILD_RESULT: 'skipped'}),
      ).toMatchObject({status: 0});
      expect(
        run({[scope]: 'true', TEST_BUILD_RESULT: 'success'}),
      ).toMatchObject({status: 1});
    },
  );

  it('fails closed when classification failed or omitted', () => {
    expect(
      run({CHECK_SCOPE_RESULT: 'failure', TEST_BUILD_RESULT: 'skipped'}),
    ).toMatchObject({status: 1});
    expect(
      run({CHECK_SCOPE_RESULT: '', TEST_BUILD_RESULT: 'skipped'}),
    ).toMatchObject({status: 1});
  });

  it('rejects missing or invalid scope decisions', () => {
    expect(run({SPEC_ONLY: ''})).toMatchObject({status: 1});
    expect(run({TOOLING_ONLY: 'unknown'})).toMatchObject({status: 1});
  });
});
