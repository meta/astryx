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

  it('deepens a shallow clone, base and HEAD, up to the times it is given', () => {
    const {root, git} = repo();
    git('config', 'uploadpack.allowAnySHA1InWant', 'true');
    // The head branches here, then main moves 250 commits on.
    git('checkout', '-q', '-b', 'feature');
    git('commit', '-q', '--allow-empty', '-m', 'change');
    const head = git('rev-parse', 'HEAD');
    git('checkout', '-q', 'main');
    const base = git('rev-parse', 'HEAD');
    // 250 empty commits in one fast-import stream, dated after the base as
    // real history is: git's merge base search trusts commit dates.
    const now = Math.floor(Date.now() / 1000) + 60;
    let stream = '';
    for (let i = 1; i <= 250; i++) {
      const message = `main ${i}`;
      stream += `commit refs/heads/main\ncommitter t <t@t> ${now + i} +0000\ndata ${message.length}\n${message}\n${i === 1 ? `from ${base}\n` : ''}\n`;
    }
    execFileSync('git', ['fast-import', '--quiet'], {cwd: root, input: stream});
    git('reset', '-q', '--hard', 'main');
    // A shallow clone of the head and main, as CI's checkout is.
    function shallowClone() {
      const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-base-clone-'));
      roots.push(clone);
      const cg = (...args) =>
        execFileSync('git', args, {cwd: clone, encoding: 'utf8'}).trim();
      cg('init', '-q');
      cg('remote', 'add', 'origin', `file://${root}`);
      cg(
        'fetch',
        '-q',
        '--depth=1',
        'origin',
        head,
        'main:refs/remotes/origin/main',
      );
      cg('checkout', '-q', head);
      return {clone, cg};
    }
    const one = shallowClone();
    const once = spawnSync('bash', [SCRIPT, 'main', 'the check'], {
      cwd: one.clone,
      encoding: 'utf8',
    });
    expect(once.stdout).toBe('');
    expect(once.stderr).toContain('no merge base within the fetched history');
    const three = shallowClone();
    const thrice = spawnSync('bash', [SCRIPT, 'main', 'the check', '3'], {
      cwd: three.clone,
      encoding: 'utf8',
    });
    const fetched = `${thrice.stderr} (origin/main: ${three.cg('rev-list', '--count', 'origin/main')} commits; HEAD: ${three.cg('rev-list', '--count', 'HEAD')})`;
    expect(thrice.stdout.trim(), fetched).toBe(base);
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
