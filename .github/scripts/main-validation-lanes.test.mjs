// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Main's post-merge Vitest lanes skip what a pull request's skip
 * (spec:AST-030 FR13, DEC-13).
 *
 * @input  deploy.yml's lane decision and join, the repository's classifier,
 *   and a stubbed GitHub API
 * @output proofs that the change is measured from main's last passing
 *   validation, that each lane skips exactly as on a pull request, that
 *   anything unclassifiable runs every lane, and that the join accepts only a
 *   decided skip
 * @position Node contract for deploy.yml's main-commit and test jobs
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';

import {afterAll, describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const workflow = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/deploy.yml'), 'utf8'),
);
const resolveJob = workflow.jobs['main-commit'];
const lanesStep = resolveJob.steps.find(step => step.id === 'lanes');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

// The job's sparse checkout of the classifier, as `.main-scope`.
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'main-lanes-'));
for (const file of resolveJob.steps
  .find(step => step.with?.path === '.main-scope')
  .with['sparse-checkout'].trim()
  .split('\n')) {
  const target = path.join(workspace, '.main-scope', file);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.copyFileSync(path.join(root, file), target);
}
afterAll(() => fs.rmSync(workspace, {recursive: true, force: true}));

const SHA = 'a'.repeat(40);
const LAST = 'b'.repeat(40);
const passed = (headSha, id = 2) => ({id, head_sha: headSha});
const changed = (...names) =>
  names.map(filename => ({filename, status: 'modified'}));

async function decide({
  eventName = 'push',
  runs = [passed(LAST)],
  files = [],
  status = 'ahead',
  compareError,
} = {}) {
  const outputs = {};
  const messages = {info: [], notice: [], warning: []};
  const calls = [];
  const core = {
    setOutput: (key, value) => {
      outputs[key] = value;
    },
    info: message => messages.info.push(message),
    notice: message => messages.notice.push(message),
    warning: message => messages.warning.push(message),
  };
  const github = {
    rest: {
      actions: {
        listWorkflowRuns: async params => {
          calls.push(params);
          return {data: {workflow_runs: runs}};
        },
      },
      repos: {
        compareCommitsWithBasehead: async params => {
          calls.push(params);
          if (compareError) throw compareError;
          return {data: {status, files}};
        },
      },
    },
  };
  const saved = {...process.env};
  Object.assign(process.env, {SHA, GITHUB_WORKSPACE: workspace});
  try {
    await new AsyncFunction(
      'require',
      'github',
      'context',
      'core',
      lanesStep.with.script,
    )(
      createRequire(import.meta.url),
      github,
      {eventName, runId: 1, repo: {owner: 'o', repo: 'r'}},
      core,
    );
  } finally {
    process.env = saved;
  }
  return {outputs, messages, calls};
}

describe("main's Vitest lanes (spec:AST-030 FR13, DEC-13)", () => {
  it('skips both lanes when only spec records changed since the last passing validation', async () => {
    const {outputs, messages, calls} = await decide({
      files: changed('docs/specs/AST-999-example/spec.md'),
    });
    expect(outputs).toEqual({test_ui: 'false', test_node: 'false'});
    expect(messages.notice[0]).toMatch(/only spec records changed/);
    expect(calls).toEqual([
      {
        owner: 'o',
        repo: 'r',
        workflow_id: 'deploy.yml',
        branch: 'main',
        event: 'push',
        status: 'success',
        per_page: 20,
      },
      {owner: 'o', repo: 'r', basehead: `${LAST}...${SHA}`},
    ]);
  });

  it('runs both lanes for a code change', async () => {
    const {outputs} = await decide({
      files: changed(
        'docs/specs/AST-999-example/spec.md',
        'packages/core/src/Button/Button.tsx',
      ),
    });
    expect(outputs).toEqual({test_ui: 'true', test_node: 'true'});
  });

  it('keeps test-node for a Node-tooling change, as a pull request does', async () => {
    const {outputs} = await decide({
      files: changed('scripts/score-ledger.mjs'),
    });
    expect(outputs).toEqual({test_ui: 'false', test_node: 'true'});
  });

  it('measures from the last passing validation, past this run and this commit', async () => {
    // A code commit whose run was replaced while waiting sits between the
    // last pass and this spec-only push, so the comparison includes it.
    const {calls} = await decide({
      runs: [passed(SHA, 1), passed(SHA, 3), passed(LAST, 2)],
      files: changed('docs/specs/AST-999-example/spec.md'),
    });
    expect(calls[1].basehead).toBe(`${LAST}...${SHA}`);
  });

  it.each([
    ['a dispatch', {eventName: 'workflow_dispatch'}],
    ['no passing validation', {runs: []}],
    [
      'a diverged history',
      {status: 'diverged', files: changed('docs/specs/x/spec.md')},
    ],
    ['an empty comparison', {files: []}],
    [
      'a comparison GitHub truncates',
      {
        files: changed(
          ...Array.from({length: 300}, (_, i) => `docs/specs/a${i}/spec.md`),
        ),
      },
    ],
  ])('runs every lane for %s', async (_, options) => {
    const {outputs} = await decide(options);
    expect(outputs).toEqual({test_ui: 'true', test_node: 'true'});
  });

  it('runs every lane, with a warning, when the comparison fails', async () => {
    const {outputs, messages} = await decide({
      compareError: new Error('Server Error'),
    });
    expect(outputs).toEqual({test_ui: 'true', test_node: 'true'});
    expect(messages.warning[0]).toMatch(/could not be classified/);
  });

  it('gates each lane on its own decision and reads main runs', () => {
    expect(workflow.jobs['test-ui'].if).toBe(
      "needs.main-commit.outputs.test_ui != 'false'",
    );
    expect(workflow.jobs['test-node'].if).toBe(
      "needs.main-commit.outputs.test_node != 'false'",
    );
    expect(workflow.jobs.typecheck.if).toBeUndefined();
    expect(resolveJob.permissions).toEqual({actions: 'read', contents: 'read'});
    expect(resolveJob.outputs).toMatchObject({
      test_ui: '${{ steps.lanes.outputs.test_ui }}',
      test_node: '${{ steps.lanes.outputs.test_node }}',
    });
  });
});

describe("main's validation join", () => {
  const join = workflow.jobs.test.steps.find(
    step => step.name === 'Assert every push gate succeeded',
  );
  const run = env =>
    spawnSync('bash', ['-eo', 'pipefail', '-c', join.run], {
      encoding: 'utf8',
      env: {...process.env, ...env},
    }).status;
  const all = {
    TEST_UI: 'success',
    TEST_NODE: 'success',
    TYPECHECK: 'success',
    RUN_UI: 'true',
    RUN_NODE: 'true',
  };

  it('needs the lane decision and every lane', () => {
    expect(workflow.jobs.test.needs).toEqual([
      'main-commit',
      'test-ui',
      'test-node',
      'typecheck',
    ]);
  });

  it.each([
    ['every lane passed', {}, 0],
    [
      'both test lanes skipped by decision',
      {
        TEST_UI: 'skipped',
        TEST_NODE: 'skipped',
        RUN_UI: 'false',
        RUN_NODE: 'false',
      },
      0,
    ],
    ['a lane skipped without the decision', {TEST_UI: 'skipped'}, 1],
    [
      'a decided lane failed instead of skipping',
      {TEST_NODE: 'failure', RUN_NODE: 'false'},
      1,
    ],
    ['a lane failed', {TEST_UI: 'failure'}, 1],
    ['typecheck skipped', {TYPECHECK: 'skipped'}, 1],
  ])('%s', (_, env, status) => {
    expect(run({...all, ...env})).toBe(status);
  });
});
