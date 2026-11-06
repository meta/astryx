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

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import yaml from 'yaml';

import {touchesBaseline} from './provenance-baseline-scope.mjs';

import {
  createRepository,
  importCommits,
} from '../../scripts/lib/git-fixture.mjs';

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

// The base repository: the trusted classifier on main, and main moving on
// after the pull requests below branch. Each pull request adds its own commit
// and the merge commit GitHub builds for it. fast-import writes them, so a
// pull request costs one git launch, not one per step.
let origin = '';
let base = '';
let mainTip = '';
let pullRequests = 0;
beforeAll(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-scope-'));
  scratch.push(dir);
  origin = path.join(dir, 'origin.git');
  const classifier = Object.fromEntries(
    CLASSIFIER_FILES.map(file => [
      file,
      fs.readFileSync(path.join(root, file), 'utf8'),
    ]),
  );
  const hashes = createRepository(
    origin,
    [
      {
        ref: 'refs/heads/main',
        name: 'base',
        message: 'base',
        files: {
          ...classifier,
          'docs/specs/AST-999-example/spec.md': '# Example\n',
          'packages/core/src/Example/Example.tsx': 'export {};\n',
        },
      },
      ...[0, 1, 2].map(i => ({
        ref: 'refs/heads/main',
        name: `main ${i}`,
        message: `main ${i}`,
        files: {'README.md': `${i}\n`},
      })),
    ],
    {bare: true},
  );
  base = hashes.base;
  mainTip = hashes['main 2'];
});

/**
 * A pull request that changes `prFiles`, branched from main's base before main
 * moved on. Returns the scope outputs the lint step writes when checked out
 * the way lint.yml checks out.
 */
function classifyPullRequest(prFiles) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-scope-'));
  scratch.push(dir);
  pullRequests += 1;
  const merge = `refs/pull/${pullRequests}/merge`;
  importCommits(origin, [
    {
      ref: `refs/heads/pr-${pullRequests}`,
      name: 'pr',
      parent: base,
      message: 'the pull request',
      files: prFiles,
    },
    {
      ref: merge,
      parent: mainTip,
      merges: ['pr'],
      message: 'Merge the pull request',
      files: prFiles,
    },
  ]);

  const workspace = path.join(dir, 'ws');
  fs.mkdirSync(workspace);
  git(workspace, 'init', '-q');
  git(workspace, 'remote', 'add', 'origin', `file://${origin}`);
  const depth = checkout.with?.['fetch-depth'] ?? 1;
  git(workspace, 'fetch', '-q', `--depth=${depth}`, 'origin', merge);
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

  it('checks the comment-provenance baseline in full lint, and a baseline-only change runs it', () => {
    const check = steps.find(
      step => step.name === 'Check the comment-provenance baseline',
    );
    expect(check.run).toContain(
      'node internal/eslint-plugin-astryx/no-comment-provenance.baseline.mjs --check',
    );
    expect(check.run).toContain(
      'node .github/scripts/provenance-baseline-scope.mjs "$RUNNER_TEMP/changed-files"',
    );
    expect(check.env.NODE_OPTIONS).toBe(
      steps.find(step => step.name === 'Run ESLint').env.NODE_OPTIONS,
    );
    // The same lanes as ESLint: everything but the docs and spec fast paths.
    expect(check.if).toBe(steps.find(step => step.name === 'Run ESLint').if);
    expect(steps.indexOf(check)).toBeGreaterThan(
      steps.findIndex(step => step.uses === './.github/actions/setup'),
    );
    expect(
      classifyPullRequest({
        'internal/eslint-plugin-astryx/no-comment-provenance.baseline.json':
          '{}\n',
      }),
    ).toMatchObject({spec_only: 'false', docsite_only: 'false'});
  });

  it('runs the baseline check for a change that can make the baseline stale, and skips it otherwise', () => {
    const baseline = {'packages/core/src/Button/Button.tsx': []};
    for (const file of [
      'packages/core/src/Button/Button.tsx',
      'internal/eslint-plugin-astryx/no-comment-provenance.baseline.json',
      'internal/eslint-plugin-astryx/no-comment-provenance.js',
      'internal/eslint-plugin-astryx/rule-baseline.mjs',
    ]) {
      expect(touchesBaseline([file], baseline), file).toBe(true);
    }
    expect(
      touchesBaseline(['packages/core/src/Badge/Badge.tsx'], baseline),
    ).toBe(false);
    // The repository's own baseline lists real files.
    const repoBaseline = JSON.parse(
      fs.readFileSync(
        path.join(
          root,
          'internal/eslint-plugin-astryx/no-comment-provenance.baseline.json',
        ),
        'utf8',
      ),
    );
    expect(touchesBaseline([Object.keys(repoBaseline)[0]], repoBaseline)).toBe(
      true,
    );
  });
});
