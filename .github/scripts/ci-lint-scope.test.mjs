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

import {canSkipBaselineCheck} from './provenance-baseline-scope.mjs';

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

  it('skips the baseline check only for a known change that cannot make the baseline stale', () => {
    const baseline = {'packages/core/src/Button/Button.tsx': []};
    for (const file of [
      'packages/core/src/Button/Button.tsx',
      'internal/eslint-plugin-astryx/no-comment-provenance.baseline.json',
      'internal/eslint-plugin-astryx/no-comment-provenance.js',
      'internal/eslint-plugin-astryx/no-comment-provenance.baseline.mjs',
      'internal/eslint-plugin-astryx/rule-baseline.mjs',
      'eslint.config.js',
    ]) {
      expect(canSkipBaselineCheck([file], baseline), file).toBe(false);
    }
    expect(
      canSkipBaselineCheck(['packages/core/src/Badge/Badge.tsx'], baseline),
    ).toBe(true);
    // A rename lists both paths, so moving a baselined file runs the check.
    expect(
      canSkipBaselineCheck(
        [
          'packages/core/src/Button/Button.tsx',
          'packages/core/src/Button/BaseButton.tsx',
        ],
        baseline,
      ),
    ).toBe(false);
    // An empty list is not a known change.
    expect(canSkipBaselineCheck([], baseline)).toBe(false);
    // ESLint skips what an ignore file names, and reads the rule from the
    // plugin entry.
    for (const file of [
      '.gitignore',
      'packages/core/.gitignore',
      'internal/eslint-plugin-astryx/index.js',
    ]) {
      expect(canSkipBaselineCheck([file], baseline), file).toBe(false);
    }
  });

  // Runs the step's own script in a scratch repository whose merge commit
  // changes `files`, with a stub baseline script that prints a marker.
  function runBaselineStep({event = 'pull_request', files, baseline = '{}'}) {
    const check = steps.find(
      step => step.name === 'Check the comment-provenance baseline',
    );
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'provenance-step-'));
    scratch.push(repo);
    const write = (file, text) => {
      fs.mkdirSync(path.dirname(path.join(repo, file)), {recursive: true});
      fs.writeFileSync(path.join(repo, file), text);
    };
    write(
      '.github/scripts/provenance-baseline-scope.mjs',
      fs.readFileSync(
        path.join(root, '.github/scripts/provenance-baseline-scope.mjs'),
        'utf8',
      ),
    );
    write(
      'internal/eslint-plugin-astryx/no-comment-provenance.baseline.json',
      baseline,
    );
    write(
      'internal/eslint-plugin-astryx/no-comment-provenance.baseline.mjs',
      "console.log('BASELINE CHECK RAN');\n",
    );
    write('docs/README.md', 'base\n');
    write('packages/core/src/Button/Button.tsx', 'base\n');
    const g = (...args) =>
      execFileSync(
        'git',
        ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
        {
          encoding: 'utf8',
        },
      );
    g('init', '-q');
    g('add', '-A');
    g('commit', '-qm', 'base', '--no-verify');
    for (const file of files) write(file, 'changed\n');
    g('add', '-A');
    g('commit', '-qm', 'change', '--allow-empty', '--no-verify');
    const merge = g('rev-parse', 'HEAD').trim();
    const runnerTemp = fs.mkdtempSync(
      path.join(os.tmpdir(), 'provenance-tmp-'),
    );
    scratch.push(runnerTemp);
    return execFileSync('bash', ['-e', '-c', check.run], {
      cwd: repo,
      encoding: 'utf8',
      env: {
        ...process.env,
        EVENT_NAME: event,
        MERGE_SHA: merge,
        RUNNER_TEMP: runnerTemp,
      },
    });
  }

  it('runs the baseline check for a push, a baselined change, a helper failure and an empty list, and skips an unrelated change', () => {
    const baseline = JSON.stringify({
      'packages/core/src/Button/Button.tsx': [],
    });
    const ran = options =>
      runBaselineStep(options).includes('BASELINE CHECK RAN');
    expect(ran({event: 'push', files: ['docs/README.md'], baseline})).toBe(
      true,
    );
    expect(
      ran({files: ['packages/core/src/Button/Button.tsx'], baseline}),
    ).toBe(true);
    expect(ran({files: ['.gitignore'], baseline})).toBe(true);
    // A baseline the helper cannot parse: the helper fails, the check runs.
    expect(ran({files: ['docs/README.md'], baseline: '{not json'})).toBe(true);
    // A merge commit that changes nothing: an empty list runs the check.
    expect(ran({files: [], baseline})).toBe(true);
    expect(ran({files: ['docs/README.md'], baseline})).toBe(false);
  });

  it('runs the baseline check when the helper fails or the file list is empty', () => {
    const check = steps.find(
      step => step.name === 'Check the comment-provenance baseline',
    );
    expect(check.run).toContain('git diff --name-only --no-renames');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'provenance-scope-'));
    scratch.push(dir);
    const helper = path.join(
      root,
      '.github/scripts/provenance-baseline-scope.mjs',
    );
    const exitOf = (list, baseline) => {
      fs.writeFileSync(path.join(dir, 'changed'), list);
      fs.writeFileSync(path.join(dir, 'baseline.json'), baseline);
      return spawnSync(
        'node',
        [
          helper,
          path.join(dir, 'changed'),
          '--baseline',
          path.join(dir, 'baseline.json'),
        ],
        {encoding: 'utf8'},
      ).status;
    };
    // Exit 0, the only answer that skips: a known list that touches nothing.
    expect(exitOf('docs/README.md\n', '{}')).toBe(0);
    expect(exitOf('', '{}')).not.toBe(0);
    expect(exitOf('docs/README.md\n', '{not json')).not.toBe(0);
    expect(
      spawnSync('node', [helper, path.join(dir, 'missing')], {
        encoding: 'utf8',
      }).status,
    ).not.toBe(0);
  });
});
