// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contracts for the committed API report step in CI's build-storybook job.
 * @input `.github/workflows/ci.yml` and fixture api-changes.json files
 * @output The step's place after the API changes it reads, its scope, and its
 *   exit: fail with the fix on a stale report, pass on a matching one
 * @position Workflow regression tests for `.github/scripts/api-report-gate.mjs`
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import yaml from 'yaml';

const ROOT = path.resolve(import.meta.dirname, '../..');
const ci = yaml.parse(
  fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8'),
);
const steps = ci.jobs['build-storybook'].steps;
const index = name => steps.findIndex(entry => entry.name === name);
const STEP = 'Check committed API reports';
const step = steps[index(STEP)];

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, {recursive: true, force: true});
});

/**
 * Runs the step's script in a fresh folder that links the repository's
 * scripts, with the given api-changes.json and changed-file list.
 */
function runStep({changes, changedFiles, withScript = true}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'api-report-step-'));
  roots.push(root);
  if (withScript)
    for (const entry of [
      '.github',
      'scripts',
      'packages',
      'node_modules',
      'package.json',
      'pnpm-workspace.yaml',
    ])
      fs.symlinkSync(path.join(ROOT, entry), path.join(root, entry));
  if (changes)
    fs.writeFileSync(
      path.join(root, 'api-changes.json'),
      JSON.stringify(changes),
    );
  const files = path.join(root, 'changed-files.txt');
  fs.writeFileSync(files, `${changedFiles.join('\n')}\n`);
  const summary = path.join(root, 'summary.md');
  fs.writeFileSync(summary, '');
  const result = spawnSync('bash', ['-e', '-c', step.run], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      CHANGED_FILES: files,
      SCOPE_DECIDED: 'true',
      SCOPE_TRUNCATED: 'false',
      GITHUB_STEP_SUMMARY: summary,
    },
  });
  return {...result, summary: fs.readFileSync(summary, 'utf8')};
}

const richtext = fields => ({
  version: 2,
  packages: [
    {
      pkg: '@astryxdesign/richtext',
      stale: false,
      missing: false,
      staleRows: 0,
      staleOwnRows: 0,
      rows: [],
      ...fields,
    },
  ],
});

describe('committed API report step', () => {
  it('runs right after the API changes it reads, in the same job, and can fail', () => {
    expect(step).toBeDefined();
    expect(index(STEP)).toBe(index('Report API changes') + 1);
    expect(step.if).toBe(steps[index('Report API changes')].if);
    expect(step['continue-on-error']).toBeUndefined();
  });

  it("takes its scope from the job's scope step, with the changed-file list", () => {
    const scope = steps.find(entry => entry.id === 'scope');
    expect(scope.with['component-audit']).toBe('true');
    expect(step.env).toEqual({
      CHANGED_FILES: '${{ steps.scope.outputs.changed_files_path }}',
      SCOPE_DECIDED: '${{ steps.scope.outputs.decided }}',
      SCOPE_TRUNCATED: '${{ steps.scope.outputs.truncated }}',
    });
  });

  it('parses as bash', () => {
    const result = spawnSync('bash', ['-n', '-c', step.run], {
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
  });

  it('fails with the fix when a report in scope is behind the build', () => {
    const result = runStep({
      changes: richtext({stale: true, staleRows: 2, staleOwnRows: 2}),
      changedFiles: ['packages/richtext/src/Editor.tsx'],
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      "The committed API report for @astryxdesign/richtext is behind this pull request's build. Run `pnpm api:report` and commit packages/richtext/api-report.md.",
    );
    expect(result.summary).toContain('`@astryxdesign/richtext`');
  });

  it('passes when the report in scope matches the build', () => {
    const result = runStep({
      changes: richtext({}),
      changedFiles: ['packages/richtext/src/Editor.tsx'],
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  it('passes when the stale report belongs to a package outside the scope', () => {
    const result = runStep({
      changes: richtext({stale: true, staleRows: 2}),
      changedFiles: ['packages/themes/butter/src/butterTheme.ts'],
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  it('skips on a head that has no check script', () => {
    const result = runStep({
      changes: null,
      changedFiles: [],
      withScript: false,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('no committed API report check');
  });
});
