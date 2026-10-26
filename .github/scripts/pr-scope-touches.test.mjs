// Copyright (c) Meta Platforms, Inc. and affiliates.

import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'pr-scope-touches.sh',
);
const LINK =
  '^(internal/a11y-spec/src/patterns/link\\.|packages/core/src/Link/)';

let root;
let origin;
let clone;

const git = (cwd, ...args) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@example.com',
    },
  }).trim();

function commit(cwd, file, message) {
  fs.mkdirSync(path.dirname(path.join(cwd, file)), {recursive: true});
  fs.writeFileSync(path.join(cwd, file), `${message}\n`);
  git(cwd, 'add', file);
  git(cwd, 'commit', '-q', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

/** A depth-1 checkout of `sha`, as actions/checkout leaves it. */
function checkout(sha) {
  clone = path.join(root, `clone-${sha.slice(0, 7)}`);
  fs.mkdirSync(clone);
  git(clone, 'init', '-q');
  git(clone, 'remote', 'add', 'origin', `file://${origin}`);
  git(clone, 'fetch', '-q', '--depth=1', 'origin', sha);
  git(clone, 'checkout', '-q', '--detach', sha);
}

function touches(base, pattern = LINK) {
  return spawnSync('bash', [SCRIPT, base, pattern], {
    cwd: clone,
    encoding: 'utf8',
  }).status;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-scope-'));
  origin = path.join(root, 'origin');
  fs.mkdirSync(origin);
  git(origin, 'init', '-q', '-b', 'main');
  git(origin, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
  commit(origin, 'README.md', 'root');
});

afterEach(() => {
  fs.rmSync(root, {recursive: true, force: true});
});

describe('pr-scope-touches', () => {
  it('ignores files the base added after a stale branch was cut', () => {
    git(origin, 'checkout', '-q', '-b', 'feature');
    const head = commit(origin, 'packages/core/src/Markdown/x.ts', 'unrelated');
    git(origin, 'checkout', '-q', 'main');
    const base = commit(
      origin,
      'packages/core/src/Link/__tests__/Link.a11y.chromium.spec.ts',
      'link contract',
    );
    checkout(head);
    // A two-dot diff from the base tip lists the Link spec as deleted.
    expect(git(clone, 'fetch', '-q', '--depth=1', 'origin', base)).toBe('');
    expect(git(clone, 'diff', '--name-only', base, 'HEAD')).toContain(
      'packages/core/src/Link/',
    );
    expect(touches(base)).toBe(1);
  });

  it('reports a branch that changes a matching path', () => {
    git(origin, 'checkout', '-q', '-b', 'feature');
    const head = commit(
      origin,
      'packages/core/src/Link/Link.tsx',
      'link change',
    );
    git(origin, 'checkout', '-q', 'main');
    const base = commit(origin, 'docs/other.md', 'base moved');
    checkout(head);
    expect(touches(base)).toBe(0);
  });

  it('reports a branch that deletes a matching path', () => {
    const shared = commit(origin, 'packages/core/src/Link/Link.tsx', 'link');
    git(origin, 'checkout', '-q', '-b', 'feature');
    git(origin, 'rm', '-q', 'packages/core/src/Link/Link.tsx');
    git(origin, 'commit', '-q', '-m', 'delete link');
    const head = git(origin, 'rev-parse', 'HEAD');
    checkout(head);
    expect(touches(shared)).toBe(0);
  });

  it('deepens until it finds a merge base far behind the base tip', () => {
    git(origin, 'checkout', '-q', '-b', 'feature');
    const head = commit(origin, 'a.md', 'a');
    git(origin, 'checkout', '-q', 'main');
    let base = '';
    for (let i = 0; i < 7; i++) base = commit(origin, `b${i}.md`, `b${i}`);
    base = commit(
      origin,
      'packages/core/src/Link/__tests__/Link.a11y.chromium.spec.ts',
      'link contract',
    );
    checkout(head);
    const status = spawnSync('bash', [SCRIPT, base, LINK], {
      cwd: clone,
      encoding: 'utf8',
      env: {...process.env, PR_SCOPE_FETCH_DEPTH: '2'},
    }).status;
    expect(status).toBe(1);
  });

  it('is unknown for unrelated histories', () => {
    const base = commit(origin, 'a.md', 'a');
    git(origin, 'checkout', '-q', '--orphan', 'other');
    git(origin, 'rm', '-rqf', '.');
    const head = commit(origin, 'packages/x.md', 'unrelated root');
    checkout(head);
    expect(touches(base)).toBe(2);
  });

  it('counts moving a matching file out of the pattern', () => {
    commit(origin, 'apps/storybook/stories/LinkA11y.stories.tsx', 'story');
    const shared = git(origin, 'rev-parse', 'HEAD');
    git(origin, 'checkout', '-q', '-b', 'feature');
    git(
      origin,
      'mv',
      'apps/storybook/stories/LinkA11y.stories.tsx',
      'apps/storybook/stories/Moved.stories.tsx',
    );
    git(origin, 'commit', '-q', '-m', 'move');
    checkout(git(origin, 'rev-parse', 'HEAD'));
    expect(
      touches(
        shared,
        '^(packages/core/src/Link/|apps/storybook/stories/LinkA11y)',
      ),
    ).toBe(0);
  });

  it('is unknown, not out of scope, for unusable arguments', () => {
    const head = commit(origin, 'a.md', 'a');
    checkout(head);
    expect(touches(head, '(')).toBe(2);
    expect(
      spawnSync('bash', [SCRIPT, head], {cwd: clone, encoding: 'utf8'}).status,
    ).toBe(2);
  });

  it('is loaded from the base by every workflow step that uses it', () => {
    const workflow = fs.readFileSync(
      path.join(path.dirname(SCRIPT), '../workflows/ci.yml'),
      'utf8',
    );
    const uses = workflow.match(/pr-scope-touches\.sh/g) ?? [];
    const fromBase =
      workflow.match(
        /git show "\$BASE_SHA:\.github\/scripts\/pr-scope-touches\.sh" > "\$helper"/g,
      ) ?? [];
    // Every consumer loads the helper from the base; the count is a floor,
    // not an exact tally.
    expect(uses.length).toBeGreaterThanOrEqual(1);
    expect(fromBase.length).toBe(uses.length);
    expect(workflow).not.toMatch(/bash \.github\/scripts\/pr-scope-touches/);
  });

  it('is unknown when the base cannot be fetched', () => {
    const head = commit(origin, 'a.md', 'a');
    checkout(head);
    expect(touches('f'.repeat(40))).toBe(2);
  });
});
