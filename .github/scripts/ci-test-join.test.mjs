// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file Mutation-sensitive scope/status matrix for the pull-request test join. */

import {execFileSync} from 'node:child_process';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

const script = path.join(import.meta.dirname, 'ci-test-join.mjs');
const broad = {
  DOCSITE_ONLY: 'false',
  SPEC_ONLY: 'false',
  TOOLING_ONLY: 'false',
  RELEASE_BUMP: 'false',
  RELEASE_BUMP_RESULT: 'skipped',
  TEST_UI_RESULT: 'success',
  TEST_NODE_RESULT: 'success',
  TEST_BUILD_RESULT: 'success',
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
    'still requires every owner to report success for %s, since each skips its own work',
    scope => {
      expect(run({[scope]: 'true'})).toMatchObject({status: 0});
      expect(
        run({[scope]: 'true', TEST_BUILD_RESULT: 'skipped'}),
      ).toMatchObject({status: 1});
    },
  );

  it('requires the release bump only on a release-branch pull request', () => {
    const release = {
      RELEASE_BUMP: 'true',
      SPEC_ONLY: 'true',
      TOOLING_ONLY: 'true',
    };
    expect(run({...release, RELEASE_BUMP_RESULT: 'success'})).toMatchObject({
      status: 0,
    });
    for (const result of ['failure', 'skipped', 'cancelled', null]) {
      expect(
        run({...release, RELEASE_BUMP_RESULT: result}),
        String(result),
      ).toMatchObject({status: 1});
    }
    expect(run({RELEASE_BUMP_RESULT: 'success'})).toMatchObject({status: 1});
  });

  it('rejects missing or invalid scope decisions', () => {
    expect(run({SPEC_ONLY: ''})).toMatchObject({status: 1});
    expect(run({TOOLING_ONLY: 'unknown'})).toMatchObject({status: 1});
  });
});
