// Copyright (c) Meta Platforms, Inc. and affiliates.

import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, describe, expect, it} from 'vitest';
import YAML from 'yaml';

import {
  addedLines,
  check,
  digest,
  findKinds,
  tokens,
} from './check-public-text.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const SCRIPT = path.join(here, 'check-public-text.mjs');

// A made-up internal name and host, hashed here, so no test names a real one.
const FAKE_NAME = ['zebra', 'frob'].join('');
const FAKE_HOST = `${FAKE_NAME}.dev`;
const digests = new Set([digest(FAKE_NAME), digest(FAKE_HOST)]);

// Identifier shapes, assembled so this file holds no complete one.
const changeId = ['D', '12345678'].join('');
const taskId = ['T', '1234567'].join('');
const pasteId = ['P', '123456789'].join('');
const issueId = ['kt', 'ab12'].join('-');
const internalHost = ['internalexample', 'com'].join('.');

describe('findKinds', () => {
  it.each([
    [`see ${changeId} for it`, 'an internal change or task id'],
    [`tracked in ${taskId}.`, 'an internal change or task id'],
    [`paste ${pasteId}`, 'an internal paste id'],
    [`issue ${issueId}`, 'an internal issue id'],
    [`https://${internalHost}/x`, 'an internal host'],
  ])('finds %j as %s', (text, kind) => {
    expect(findKinds(text, digests)).toEqual([kind]);
  });

  it('finds a hashed name in any case, and a hashed host by its last two labels', () => {
    expect(findKinds(`uses ${FAKE_NAME.toUpperCase()} here`, digests)).toEqual([
      'an internal name',
    ]);
    expect(findKinds(`https://build.${FAKE_HOST}/job`, digests)).toEqual([
      'an internal name',
    ]);
  });

  it('passes ordinary text, short ids, timestamps and other hosts', () => {
    for (const text of [
      'Fix the Drawer focus order (#9785).',
      'D123 and T42 are short; P12345678 is too short for a paste.',
      '2026-11-03T120000Z',
      'https://tinyurl.com/abc and https://example.com',
      `${FAKE_NAME}s is a different word`,
    ])
      expect(findKinds(text, digests), text).toEqual([]);
  });

  it('reads words and two-label hosts as tokens', () => {
    expect([...tokens('A b-c a.b.example.com')]).toEqual(
      expect.arrayContaining(['a', 'b-c', 'example.com']),
    );
  });
});

describe('addedLines', () => {
  it('reads only added lines, with their file and line', () => {
    const diff = [
      'diff --git a/x.md b/x.md',
      '--- a/x.md',
      '+++ b/x.md',
      '@@ -3,0 +4,2 @@',
      '+one',
      '+two',
      '@@ -9 +11 @@',
      '-old',
      '+new',
      'diff --git a/gone.md b/gone.md',
      '--- a/gone.md',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-removed',
    ].join('\n');
    expect(addedLines(diff)).toEqual([
      {file: 'x.md', line: 4, text: 'one'},
      {file: 'x.md', line: 5, text: 'two'},
      {file: 'x.md', line: 11, text: 'new'},
    ]);
  });
});

describe('check', () => {
  const diff = (file, text) => `+++ b/${file}\n@@ -0,0 +1 @@\n+${text}\n`;

  it('reports where each finding is and its kind, never the text', () => {
    const findings = check({
      commits: [{sha: 'abcdef1234', message: `fix: per ${changeId}`}],
      diff: diff('docs/a.md', `see ${FAKE_NAME}`),
      title: 'A clean title',
      body: `Body names ${internalHost}`,
      digests,
    });
    expect(findings.map(({where, kind}) => `${where}: ${kind}`)).toEqual([
      'commit abcdef1 message: an internal change or task id',
      'pull request description: an internal host',
      'docs/a.md:1: an internal name',
    ]);
    expect(JSON.stringify(findings)).not.toContain(FAKE_NAME);
    expect(JSON.stringify(findings)).not.toContain(changeId);
  });

  it('skips the files it is told to skip', () => {
    expect(
      check({
        commits: [{sha: 'a'.repeat(40), message: 'chore: deps'}],
        diff: diff('pnpm-lock.yaml', `integrity: sha512-x+${changeId}/y`),
        digests,
        skipFiles: ['pnpm-lock.yaml'],
      }),
    ).toEqual([]);
  });
});

describe('the script on a real repository', () => {
  const dirs = [];
  afterEach(() => {
    for (const dir of dirs.splice(0))
      fs.rmSync(dir, {recursive: true, force: true});
  });

  const repo = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'public-text-'));
    dirs.push(dir);
    const git = (...args) =>
      execFileSync('git', args, {
        cwd: dir,
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 't',
          GIT_AUTHOR_EMAIL: 't@example.com',
          GIT_COMMITTER_NAME: 't',
          GIT_COMMITTER_EMAIL: 't@example.com',
        },
      }).trim();
    git('init', '-q', '-b', 'main');
    const commit = (file, text, message) => {
      fs.writeFileSync(path.join(dir, file), text);
      git('add', file);
      git('commit', '-q', '-m', message);
      return git('rev-parse', 'HEAD');
    };
    const hashes = path.join(dir, 'hashes.json');
    fs.writeFileSync(hashes, JSON.stringify([...digests]));
    const run = (base, head, env = {}) =>
      spawnSync(
        process.execPath,
        [SCRIPT, '--base', base, '--head', head, '--hashes', hashes],
        {cwd: dir, encoding: 'utf8', env: {...process.env, ...env}},
      );
    return {commit, run, hashes};
  };

  it('fails on a finding and prints no matched text', () => {
    const {commit, run} = repo();
    const base = commit('a.md', 'a\n', 'base');
    const head = commit('b.md', `uses ${FAKE_NAME}\n`, `add b (${changeId})`);
    const result = run(base, head, {PR_BODY: `see ${FAKE_HOST}`});
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      'message has an internal change or task id',
    );
    expect(result.stdout).toContain('file=b.md,line=1,');
    expect(result.stdout).toContain(
      'pull request description has an internal name',
    );
    for (const value of [FAKE_NAME, changeId]) {
      expect(result.stdout).not.toContain(value);
      expect(result.stderr).not.toContain(value);
    }
  });

  it('passes clean commits', () => {
    const {commit, run} = repo();
    const base = commit('a.md', 'a\n', 'base');
    const head = commit('b.md', 'b\n', 'add b');
    expect(run(base, head).status).toBe(0);
  });

  it('ignores a match already on the base branch before the merge base', () => {
    const {commit, run} = repo();
    commit('old.md', `old ${FAKE_NAME}\n`, `old (${changeId})`);
    const base = commit('a.md', 'a\n', 'base');
    const head = commit('b.md', 'b\n', 'add b');
    expect(run(base, head).status).toBe(0);
  });

  it('fails closed when the range is empty, unreadable or not a sha', () => {
    const {commit, run, hashes} = repo();
    const base = commit('a.md', 'a\n', 'base');
    expect(run(base, base).status).toBe(2);
    expect(run(base, 'f'.repeat(40)).status).toBe(2);
    expect(run('main', base).status).toBe(2);
    fs.rmSync(hashes);
    const head = commit('b.md', 'b\n', 'add b');
    expect(run(base, head).status).toBe(2);
  });
});

describe('the committed digests', () => {
  it('hold only salted SHA-256 hex digests', () => {
    const list = JSON.parse(
      fs.readFileSync(
        path.join(root, '.github/public-text-hashes.json'),
        'utf8',
      ),
    );
    expect(list.length).toBeGreaterThan(0);
    for (const entry of list) expect(entry).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('Lint runs the check (spec:AST-030 FR27)', () => {
  const workflow = YAML.parse(
    fs.readFileSync(path.join(root, '.github/workflows/lint.yml'), 'utf8'),
  );
  const steps = workflow.jobs.lint.steps;
  const index = steps.findIndex(step => step.name === 'Check public text');
  const step = steps[index];

  it('runs on every pull request, before the slower checks', () => {
    expect(step.if).toBe("github.event_name == 'pull_request'");
    expect(index).toBeLessThan(
      steps.findIndex(s => s.name === 'Lint changed workflows (actionlint)'),
    );
  });

  it("runs the base branch's copy of the check and digests", () => {
    expect(step.run).toContain(
      'git show "origin/$BASE_REF:.github/scripts/check-public-text.mjs"',
    );
    expect(step.run).toContain(
      'git show "origin/$BASE_REF:.github/public-text-hashes.json"',
    );
    expect(step.run).not.toMatch(/node \.github\/scripts\/check-public-text/);
  });

  it('checks the pull request head from its merge base, and fails without one', () => {
    expect(step.run).toContain('HEAD_SHA=$(git rev-parse HEAD^2)');
    expect(step.run).toContain('git merge-base "$BASE_TIP" "$HEAD_SHA"');
    expect(step.run).toContain('--base "$MERGE_BASE" --head "$HEAD_SHA"');
    expect(step.run).toMatch(/merge base was not found[^\n]*\n\s*exit 1/);
  });

  it('reads the title and description from the environment and never prints them', () => {
    expect(step.env.PR_TITLE).toBe('${{ github.event.pull_request.title }}');
    expect(step.env.PR_BODY).toBe('${{ github.event.pull_request.body }}');
    expect(step.run).not.toContain('github.event.pull_request');
    expect(step.run).not.toMatch(/echo[^\n]*\$PR_(TITLE|BODY)/);
  });
});
