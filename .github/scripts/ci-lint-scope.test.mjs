// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: required lint takes its documentation and spec fast paths.
 *
 * lint.yml classifies a pull request's files with the trusted classifier from
 * the base branch and skips full ESLint for a spec-only or docsite-only change;
 * a tooling-only change still runs it (spec:AST-030 FR8). Its checkout was
 * depth 1, where the merge commit never reaches its merge base with the base
 * branch, so the classifier was never fed and every pull request ran full lint.
 * These cases run the real step script
 * and the real classifier with real git, checked out the way the workflow
 * checks out.
 */

import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterAll, describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const lint = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/lint.yml'), 'utf8'),
);
const steps = lint.jobs.lint.steps;
const checkout = steps.find(step => step.uses?.startsWith('actions/checkout'));
const classify = steps.find(step => step.name === 'Classify changed files');
const CLASSIFIER_FILES = [
  '.github/scripts/change-scope.cjs',
  '.github/scripts/knowledge-paths.cjs',
  'scripts/component-packages.cjs',
];

const scratch = [];
afterAll(() => {
  for (const dir of scratch) fs.rmSync(dir, {recursive: true, force: true});
});

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'ci',
      GIT_AUTHOR_EMAIL: 'ci@example.com',
      GIT_COMMITTER_NAME: 'ci',
      GIT_COMMITTER_EMAIL: 'ci@example.com',
    },
  }).trim();
}

function write(dir, file, text) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
  fs.writeFileSync(path.join(dir, file), text);
}

/**
 * A repository with the trusted classifier on main, a pull request that
 * changes `prFiles`, and main moving on after it branched. Returns the scope
 * outputs the lint step writes when checked out the way lint.yml checks out.
 */
function classifyPullRequest(prFiles) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-scope-'));
  scratch.push(dir);
  const work = path.join(dir, 'work');
  fs.mkdirSync(work);
  git(work, 'init', '-q', '-b', 'main');
  for (const file of CLASSIFIER_FILES) {
    write(work, file, fs.readFileSync(path.join(root, file), 'utf8'));
  }
  write(work, 'docs/specs/AST-999-example/spec.md', '# Example\n');
  write(work, 'packages/core/src/Example/Example.tsx', 'export {};\n');
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'base');
  git(work, 'checkout', '-q', '-b', 'pr');
  for (const [file, text] of Object.entries(prFiles)) write(work, file, text);
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'the pull request');
  git(work, 'checkout', '-q', 'main');
  for (let i = 0; i < 3; i++) {
    write(work, 'README.md', `${i}\n`);
    git(work, 'add', '-A');
    git(work, 'commit', '-q', '-m', `main ${i}`);
  }
  git(work, 'merge', '-q', '--no-ff', '--no-edit', 'pr');
  const merge = git(work, 'rev-parse', 'HEAD');
  git(work, 'reset', '-q', '--hard', 'HEAD^1');
  const origin = path.join(dir, 'origin.git');
  git(dir, 'clone', '-q', '--bare', work, origin);
  git(origin, 'update-ref', 'refs/pull/1/merge', merge);

  const workspace = path.join(dir, 'ws');
  fs.mkdirSync(workspace);
  git(workspace, 'init', '-q');
  git(workspace, 'remote', 'add', 'origin', `file://${origin}`);
  const depth = checkout.with?.['fetch-depth'] ?? 1;
  git(
    workspace,
    'fetch',
    '-q',
    `--depth=${depth}`,
    'origin',
    'refs/pull/1/merge',
  );
  git(workspace, 'checkout', '-q', '--detach', 'FETCH_HEAD');
  const output = path.join(dir, 'output');
  fs.writeFileSync(output, '');
  const result = spawnSync(
    'bash',
    [
      '--noprofile',
      '--norc',
      '-eo',
      'pipefail',
      '-c',
      classify.run.replaceAll('${{ github.base_ref }}', 'main'),
    ],
    {
      cwd: workspace,
      encoding: 'utf8',
      env: {...process.env, GITHUB_OUTPUT: output, RUNNER_TEMP: dir},
    },
  );
  expect(result.status, result.stderr).toBe(0);
  return Object.fromEntries(
    fs
      .readFileSync(output, 'utf8')
      .trim()
      .split('\n')
      .map(line => line.split('=')),
  );
}

describe('required lint routing', () => {
  it('checks out enough history for the merge commit to reach its merge base, as check-scope does', () => {
    expect(checkout.with?.['fetch-depth']).toBe(50);
  });

  it('takes the spec fast path for a spec-only pull request', () => {
    expect(
      classifyPullRequest({
        'docs/specs/AST-999-example/spec.md': '# Changed\n',
      }),
    ).toMatchObject({spec_only: 'true', docsite_only: 'false'});
  });

  it('runs full lint when a component file changes beside the spec', () => {
    expect(
      classifyPullRequest({
        'docs/specs/AST-999-example/spec.md': '# Changed\n',
        'packages/core/src/Example/Example.tsx': 'export const a = 1;\n',
      }),
    ).toMatchObject({
      spec_only: 'false',
      docsite_only: 'false',
      tooling_only: 'false',
      // Only the classifier writes full_suite, so the classifier answered.
      full_suite: 'false',
    });
  });
});
