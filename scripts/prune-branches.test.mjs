// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file prune-branches.test.mjs
 * Pins that the daily branch pruner deletes a PR's `assets/pr-<n>` branch
 * once PR #<n> is merged or closed, and keeps it while the PR is open.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, describe, expect, it} from 'vitest';

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'prune-branches.sh',
);
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, {recursive: true, force: true});
});

function setup(prStates) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-'));
  roots.push(root);
  const git = (cwd, ...args) =>
    execFileSync('git', args, {cwd, encoding: 'utf8'});
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  git(root, 'init', '-q', '--bare', origin);
  git(root, 'init', '-q', '-b', 'main', work);
  git(work, 'config', 'user.email', 'test@test.co');
  git(work, 'config', 'user.name', 'Test');
  git(work, 'commit', '-q', '--allow-empty', '-m', 'base');
  git(work, 'remote', 'add', 'origin', origin);
  git(
    work,
    'push',
    '-q',
    'origin',
    'main',
    'main:assets/pr-1',
    'main:assets/pr-2',
  );
  // A stand-in for gh: `pr view <n>` answers from prStates; `pr list` finds no PR.
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(
    path.join(bin, 'gh'),
    `#!/usr/bin/env bash\nif [ "$1 $2" = "pr view" ]; then\n  case "$3" in\n${Object.entries(
      prStates,
    )
      .map(([n, state]) => `    ${n}) echo ${state} ;;`)
      .join('\n')}\n  esac\nelse\n  echo none\nfi\n`,
    {mode: 0o755},
  );
  return {work, bin};
}

describe('prune-branches.sh', () => {
  it("lists a merged or closed PR's assets branch for deletion and keeps an open PR's", () => {
    const {work, bin} = setup({1: 'MERGED', 2: 'OPEN'});
    const out = execFileSync('bash', [SCRIPT], {
      cwd: work,
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`},
    }).replace(/\u001b\[[0-9;]*m/g, '');
    const willDelete = out.slice(
      out.indexOf('Merged/closed PR (will delete):'),
    );
    expect(willDelete).toContain('assets/pr-1');
    expect(willDelete).not.toContain('assets/pr-2');
  });
});
