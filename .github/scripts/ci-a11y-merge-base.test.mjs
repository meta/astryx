// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: the opt-in accessibility specs plan from the pull request's
 * own changes after the base is merged into its head.
 *
 * The event's base SHA stays at the base the pull request was opened on. A
 * head that later merges the base in has that old base as its merge base, so
 * a plan from it counts every change the merge brought in. The step takes the
 * base from the merge commit's first parent instead.
 */

import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

import {afterAll, describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const ci = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
);
const step = Object.values(ci.jobs)
  .flatMap(job => job.steps ?? [])
  .find(s => s.name === "Count this run's accessibility legs");
const scratch = [];
afterAll(() => {
  for (const dir of scratch) fs.rmSync(dir, {recursive: true, force: true});
});

function tmp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

// A base that moves after the pull request opens, a head that merges it in,
// and the merge commit CI builds. Returns the SHAs and a checkout of the head.
function repository() {
  const origin = tmp('a11y-base-origin-');
  const git = (dir, ...args) =>
    execFileSync(
      'git',
      ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
      {encoding: 'utf8'},
    ).trim();
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(origin, file)), {recursive: true});
    fs.writeFileSync(path.join(origin, file), text);
  };
  git(origin, 'init', '-q', '-b', 'main');
  // CI fetches the merge commit by its SHA.
  git(origin, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
  write('packages/core/src/Button/Button.tsx', 'base\n');
  // The runner prints the files the real planner reads for this base.
  const planner = path.join(root, '.github/scripts/a11y-pr-contracts.mjs');
  write(
    '.github/scripts/a11y-pr-contracts.mjs',
    [
      `import {changedSinceMergeBase} from ${JSON.stringify(pathToFileURL(planner).href)};`,
      "console.log((changedSinceMergeBase(process.env.BASE_SHA) ?? ['no merge base']).join('\\n'));",
      '',
    ].join('\n'),
  );
  // The runner's shared duration split, which the step copies beside it.
  write('scripts/lib/duration-split.mjs', '');
  git(origin, 'add', '-A');
  git(origin, 'commit', '-qm', 'opened on', '--no-verify');
  const openedOn = git(origin, 'rev-parse', 'HEAD');
  git(origin, 'checkout', '-q', '-b', 'feature');
  write('packages/core/src/Button/Button.tsx', 'feature\n');
  git(origin, 'commit', '-qam', 'own change', '--no-verify');
  git(origin, 'checkout', '-q', 'main');
  write('packages/core/src/Selector/Listbox.tsx', 'main moved\n');
  git(origin, 'add', '-A');
  git(origin, 'commit', '-qm', 'main moves', '--no-verify');
  const baseTip = git(origin, 'rev-parse', 'HEAD');
  git(origin, 'checkout', '-q', 'feature');
  git(origin, 'merge', '-q', '--no-edit', 'main');
  const head = git(origin, 'rev-parse', 'HEAD');
  // The merge commit: the base tip first, the head second.
  git(origin, 'checkout', '-q', '--detach', baseTip);
  git(origin, 'merge', '-q', '--no-ff', '--no-edit', head);
  const workflow = git(origin, 'rev-parse', 'HEAD');
  git(origin, 'update-ref', 'refs/pull/1/merge', workflow);
  // The head checkout, shallow as CI's.
  const checkout = tmp('a11y-base-head-');
  git(checkout, 'init', '-q');
  git(checkout, 'remote', 'add', 'origin', pathToFileURL(origin).href);
  git(checkout, 'fetch', '-q', '--depth=1', 'origin', head);
  git(checkout, 'checkout', '-q', '--detach', 'FETCH_HEAD');
  return {checkout, openedOn, head, workflow};
}

describe('the opt-in accessibility specs plan from the pull request’s own changes', () => {
  it('takes the base from the merge commit, never from the event', () => {
    expect(step).toBeDefined();
    expect(step.env.BASE_SHA).toBeUndefined();
    expect(JSON.stringify(step)).not.toContain('pull_request.base.sha');
    expect(step.run).toContain('BASE_SHA=$(git rev-parse "$WORKFLOW_SHA^1")');
  });

  it('plans only the head’s own change after the base is merged into it', () => {
    const {checkout, openedOn, workflow} = repository();
    const result = spawnSync(
      'bash',
      // The leg's expressions, as GitHub fills them in for a first leg.
      ['-e', '-c', step.run.replace(/\$\{\{[^}]*\}\}/g, '1')],
      {
        cwd: checkout,
        encoding: 'utf8',
        env: {
          ...process.env,
          ...step.env,
          // The event's stale base, which the step must not use.
          BASE_SHA: openedOn,
          WORKFLOW_SHA: workflow,
          RUNNER_TEMP: tmp('a11y-base-temp-'),
        },
      },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().split('\n')).toEqual([
      'packages/core/src/Button/Button.tsx',
    ]);
  });
});
