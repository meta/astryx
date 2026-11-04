// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file prune-branches.test.mjs
 * Pins that the daily branch pruner deletes an `assets/pr-<n>` branch the PR
 * report created (it carries `.pr-report-frames`) once PR #<n> is merged or
 * closed, keeps it while the PR is open, and does not delete an assets branch
 * without the marker, such as screenshots pushed by hand, for its PR closing.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, describe, expect, it} from 'vitest';
import {createRepository} from './lib/git-fixture.mjs';

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
  const origin = path.join(root, 'origin.git');
  const work = path.join(root, 'work');
  createRepository(
    origin,
    [
      {ref: 'refs/heads/main', name: 'base'},
      {
        ref: 'refs/heads/assets/pr-1',
        name: 'frames',
        parent: 'base',
        files: {'.pr-report-frames': 'marker\n'},
      },
    ],
    {
      bare: true,
      // assets/pr-3 is pushed by hand: no marker.
      refs: {
        'refs/heads/assets/pr-2': 'frames',
        'refs/heads/assets/pr-3': 'base',
      },
    },
  );
  execFileSync('git', ['clone', '-q', origin, work]);
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
  it("deletes a closed PR's marked assets branch, keeps an open PR's, and never an unmarked one", () => {
    const {work, bin} = setup({1: 'MERGED', 2: 'OPEN', 3: 'CLOSED'});
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
    // assets/pr-3 has no marker: its PR is closed, yet it is not deleted.
    expect(out).not.toMatch(/^\s+assets\/pr-3$/m);
    expect(out).toContain('0 branches (no PR');
  });
});
