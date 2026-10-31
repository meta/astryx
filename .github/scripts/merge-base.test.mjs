// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file merge-base.test.mjs
 * Pins merge-base.sh: it prints the merge base with origin/<base>, and
 * prints nothing but a workflow warning naming what the caller skips when the
 * history has none.
 */

import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, describe, expect, it} from 'vitest';

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'merge-base.sh',
);
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, {recursive: true, force: true});
});

function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-base-'));
  roots.push(root);
  const git = (...args) =>
    execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@test.co');
  git('config', 'user.name', 'Test');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  return {root, git};
}

describe('merge-base.sh', () => {
  it('prints the merge base with origin/<base>', () => {
    const {root, git} = repo();
    const base = git('rev-parse', 'HEAD');
    git('update-ref', 'refs/remotes/origin/main', base);
    git('checkout', '-q', '-b', 'feature');
    git('commit', '-q', '--allow-empty', '-m', 'change');
    const result = spawnSync('bash', [SCRIPT, 'main', 'the check'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(base);
  });

  it('prints nothing and warns when there is no merge base', () => {
    const {root} = repo();
    const result = spawnSync(
      'bash',
      [SCRIPT, 'main', 'the package-size comparison'],
      {
        cwd: root,
        encoding: 'utf8',
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      '::warning::no merge base within the fetched history; skipping the package-size comparison',
    );
  });
});
