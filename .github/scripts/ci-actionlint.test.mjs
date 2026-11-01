// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ci-actionlint.test.mjs
 * @input .github/workflows/lint.yml, .github/actionlint.yaml and every workflow
 * @output Contract for the Lint workflow's actionlint step: it runs only when a
 *   pull request changes a workflow, a composite action or the actionlint
 *   configuration; it pins actionlint by version and checksum; shellcheck
 *   reports errors only; a finding fails the step; and every non-GitHub-hosted
 *   runner label a workflow names is declared in the configuration
 * @position Contract test for the repository's GitHub Actions workflows
 *   (spec:AST-030 FR11)
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const lint = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/lint.yml'), 'utf8'),
);
const job = lint.jobs.lint;
const step = job.steps.find(
  candidate => candidate.name === 'Lint changed workflows (actionlint)',
);
const config = yaml.parse(
  fs.readFileSync(path.join(root, '.github/actionlint.yaml'), 'utf8'),
);

/** GitHub-hosted labels actionlint already knows. */
const HOSTED = /^(ubuntu|windows|macos)-/;

describe('Lint: actionlint on workflow changes', () => {
  it('runs on pull requests and skips unless a workflow, action or the config changed', () => {
    expect(step).toBeDefined();
    expect(step.if).toBe("github.event_name == 'pull_request'");
    expect(step.run).toContain(
      'git diff --quiet "$MERGE_BASE"...HEAD -- .github/workflows .github/actions .github/actionlint.yaml',
    );
    // An unknown merge base runs it rather than skipping.
    expect(step.run).toContain('if [ -n "$MERGE_BASE" ] && git diff --quiet');
    // It comes after the classifier step that fetches the base branch.
    const names = job.steps.map(candidate => candidate.name);
    expect(names.indexOf('Classify changed files')).toBeLessThan(
      names.indexOf(step.name),
    );
  });

  it('pins actionlint by version and checksum for the arm64 runner', () => {
    expect(job['runs-on']).toBe('ubuntu-24.04-arm');
    expect(step.env.ACTIONLINT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(step.env.ACTIONLINT_SHA256).toMatch(/^[0-9a-f]{64}$/);
    expect(step.run).toContain('linux_arm64.tar.gz');
    expect(step.run).toContain('sha256sum -c -');
  });

  it('runs shellcheck at error severity and fails the step on a finding', () => {
    expect(step.run).toContain(
      'SHELLCHECK_OPTS=--severity=error "$RUNNER_TEMP/actionlint" -color -shellcheck=shellcheck -pyflakes=',
    );
    // shellcheck must be present, or actionlint would skip it silently.
    expect(step.run).toContain('command -v shellcheck >/dev/null || {');
    expect(step['continue-on-error']).toBeUndefined();
  });

  it('declares every non-GitHub-hosted runner label a workflow names', () => {
    const declared = new Set(config['self-hosted-runner'].labels);
    const used = new Set();
    for (const name of fs.readdirSync(path.join(root, '.github/workflows'))) {
      if (!/\.ya?ml$/.test(name)) continue;
      const source = fs.readFileSync(
        path.join(root, '.github/workflows', name),
        'utf8',
      );
      for (const match of source.matchAll(
        /\b(\d+-core-[a-z0-9-]+|[a-z0-9-]+-release-pool)\b/g,
      )) {
        used.add(match[1]);
      }
      for (const match of source.matchAll(
        /^\s*runs-on:\s*([^\s$'"{]+)\s*$/gm,
      )) {
        if (!HOSTED.test(match[1])) used.add(match[1]);
      }
    }
    const missing = [...used].filter(label => !declared.has(label)).sort();
    expect(missing).toEqual([]);
  });
});
