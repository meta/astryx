// Copyright (c) Meta Platforms, Inc. and affiliates.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {
  createRepository,
  importCommits,
  workingTreeFiles,
} from './git-fixture.mjs';

/** @type {string[]} */
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, {recursive: true, force: true});
});

function tempDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'git-fixture-'));
  roots.push(root);
  return root;
}

/** @param {string} root @param {string[]} args */
const git = (root, ...args) =>
  execFileSync('git', ['-C', root, ...args], {encoding: 'utf8'}).trim();

describe('fixture repositories', () => {
  it('writes branches, parents, files and refs, and returns each named hash', () => {
    const root = path.join(tempDir(), 'repo');
    const hashes = createRepository(
      root,
      [
        {
          ref: 'refs/heads/main',
          name: 'base',
          message: 'base',
          files: {'a.txt': 'one\n', 'my dir/b.txt': 'two\n'},
        },
        {
          ref: 'refs/heads/topic',
          name: 'topic',
          parent: 'base',
          files: {'a.txt': 'topic\n'},
        },
        {
          ref: 'refs/heads/main',
          name: 'main',
          files: {'my dir/b.txt': null, 'c.txt': 'three\n'},
        },
      ],
      {refs: {'refs/remotes/origin/main': 'base'}},
    );

    expect(git(root, 'symbolic-ref', 'HEAD')).toBe('refs/heads/main');
    expect(git(root, 'rev-parse', 'main', 'topic', 'origin/main')).toBe(
      [hashes.main, hashes.topic, hashes.base].join('\n'),
    );
    expect(git(root, 'rev-parse', 'main^', 'topic^')).toBe(
      [hashes.base, hashes.base].join('\n'),
    );
    expect(git(root, 'ls-tree', '-r', '--name-only', 'main')).toBe(
      'a.txt\nc.txt',
    );
    expect(git(root, 'show', 'topic:a.txt')).toBe('topic');
    expect(git(root, 'show', `${hashes.base}:my dir/b.txt`)).toBe('two');
    expect(git(root, 'log', '-1', '--format=%s', hashes.base)).toBe('base');
  });

  it("writes a merge commit from its first parent's tree and its other parents", () => {
    const root = path.join(tempDir(), 'repo');
    const hashes = createRepository(root, [
      {ref: 'refs/heads/main', name: 'base', files: {'a.txt': 'a\n'}},
      {
        ref: 'refs/heads/topic',
        name: 'topic',
        parent: 'base',
        files: {'t.txt': 't\n'},
      },
      {ref: 'refs/heads/main', name: 'main', files: {'m.txt': 'm\n'}},
      {
        ref: 'refs/pull/1/merge',
        name: 'merge',
        parent: 'main',
        merges: ['topic'],
        files: {'t.txt': 't\n'},
      },
    ]);

    expect(
      git(root, 'rev-parse', 'refs/pull/1/merge^1', 'refs/pull/1/merge^2'),
    ).toBe([hashes.main, hashes.topic].join('\n'));
    expect(git(root, 'ls-tree', '--name-only', hashes.merge)).toBe(
      ['a.txt', 'm.txt', 't.txt'].join('\n'),
    );
  });

  it('records a working tree exactly as a snapshot, and continues from a ref', () => {
    const root = tempDir();
    fs.mkdirSync(path.join(root, 'docs'));
    fs.writeFileSync(path.join(root, 'docs/x.md'), 'x\n');
    const {first} = createRepository(root, [
      {
        ref: 'refs/heads/main',
        name: 'first',
        snapshot: true,
        files: workingTreeFiles(root),
      },
    ]);
    fs.rmSync(path.join(root, 'docs/x.md'));
    fs.writeFileSync(path.join(root, 'y.md'), 'y\n');
    const {second} = importCommits(root, [
      {
        ref: 'refs/heads/main',
        name: 'second',
        parent: 'refs/heads/main',
        snapshot: true,
        files: workingTreeFiles(root),
      },
    ]);

    expect(git(root, 'rev-parse', `${second}^`)).toBe(first);
    expect(git(root, 'ls-tree', '-r', '--name-only', second)).toBe('y.md');
  });

  it('creates a bare repository on another branch', () => {
    const root = path.join(tempDir(), 'wiki.git');
    const {seed} = createRepository(
      root,
      [
        {
          ref: 'refs/heads/master',
          name: 'seed',
          files: {'ledger.json': '{}\n'},
        },
      ],
      {bare: true, branch: 'master'},
    );

    expect(git(root, 'rev-parse', '--is-bare-repository')).toBe('true');
    expect(git(root, 'rev-parse', 'HEAD')).toBe(seed);
  });
});
