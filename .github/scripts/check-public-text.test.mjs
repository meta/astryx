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

  it('finds a hashed name inside a hyphenated or camel-case word', () => {
    const capital = FAKE_NAME[0].toUpperCase() + FAKE_NAME.slice(1);
    for (const text of [
      `${FAKE_NAME}-cli`,
      `tools-${FAKE_NAME}`,
      `use${capital}Session`,
      `${FAKE_NAME.toUpperCase()}_DIR`,
      `a/${FAKE_NAME}/b`,
    ])
      expect(findKinds(text, digests), text).toEqual(['an internal name']);
  });

  it('passes an upper-case hex colour that looks like an id', () => {
    // Assembled so this file holds no complete id shape.
    const colour = ['#D', '4485150'].join('');
    expect(findKinds(`color: ${colour};`, digests)).toEqual([]);
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

  it('reads an added line that starts with ++ as content, not a file header', () => {
    const diff = [
      'diff --git a/x.md b/x.md',
      '--- a/x.md',
      '+++ b/x.md',
      '@@ -1,0 +2,2 @@',
      `+++ see ${changeId}`,
      '+next',
    ].join('\n');
    expect(addedLines(diff)).toEqual([
      {file: 'x.md', line: 2, text: `++ see ${changeId}`},
      {file: 'x.md', line: 3, text: 'next'},
    ]);
    expect(findKinds(addedLines(diff)[0].text, digests)).toEqual([
      'an internal change or task id',
    ]);
  });
});

describe('check', () => {
  const diff = (file, text) =>
    `diff --git a/${file} b/${file}\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1 @@\n+${text}\n`;

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
      fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
      fs.writeFileSync(path.join(dir, file), text);
      git('add', file);
      git('commit', '-q', '-m', message);
      return git('rev-parse', 'HEAD');
    };
    const hashes = path.join(dir, 'hashes.json');
    fs.writeFileSync(hashes, JSON.stringify([...digests]));
    const run = (base, head, pr = null) => {
      const args = [SCRIPT, '--base', base, '--head', head, '--hashes', hashes];
      if (pr != null) {
        const file = path.join(dir, 'pull-request.json');
        fs.writeFileSync(file, JSON.stringify(pr));
        args.push('--pr-json', file);
      }
      return spawnSync(process.execPath, args, {cwd: dir, encoding: 'utf8'});
    };
    return {commit, run, hashes, git, dir};
  };

  it('fails on a finding and prints no matched text', () => {
    const {commit, run} = repo();
    const base = commit('a.md', 'a\n', 'base');
    const head = commit('b.md', `uses ${FAKE_NAME}\n`, `add b (${changeId})`);
    const result = run(base, head, {
      pull_request: {title: 'A clean title', body: `see ${FAKE_HOST}`},
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      'message has an internal change or task id',
    );
    expect(result.stdout).toContain('file=b.md,line=1,');
    expect(result.stdout).toContain(
      'pull request description has an internal name',
    );
    expect(result.stdout).toContain('Remove the reference there');
    expect(result.stdout).toContain('ask a maintainer');
    for (const value of [FAKE_NAME, changeId]) {
      expect(result.stdout).not.toContain(value);
      expect(result.stderr).not.toContain(value);
    }
  });

  it.each(['My notes.md', 'café.md'])(
    'reads %j when it comes first in the diff',
    name => {
      const {commit, run} = repo();
      const base = commit('z.md', 'z\n', 'base');
      const head = commit(name, `uses ${FAKE_NAME}\n`, 'add notes');
      const result = run(base, head);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(`file=${name},line=1,`);
    },
  );

  it('reads a path marked binary as text', () => {
    const {commit, run} = repo();
    commit('.gitattributes', '*.dat binary\n', 'mark dat files binary');
    const base = commit('a.md', 'a\n', 'base');
    const head = commit('notes.dat', `uses ${FAKE_NAME}\n`, 'add notes');
    const result = run(base, head);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('file=notes.dat,line=1,');
  });

  it('passes a moved file whose text was already on the base branch', () => {
    const {commit, run, git, dir} = repo();
    commit('old/notes.md', `from ${changeId} long ago\n`, 'old notes');
    const base = commit('a.md', 'a\n', 'base');
    fs.mkdirSync(path.join(dir, 'new'));
    git('mv', 'old/notes.md', 'new/notes.md');
    git('commit', '-q', '-m', 'move the notes');
    expect(run(base, git('rev-parse', 'HEAD')).status).toBe(0);
  });

  it('reads the title and description from the REST API shape too', () => {
    const {commit, run} = repo();
    const base = commit('a.md', 'a\n', 'base');
    const head = commit('b.md', 'b\n', 'add b');
    const result = run(base, head, {title: `fix ${taskId}`, body: null});
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      'pull request title has an internal change or task id',
    );
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

  it("runs the base branch's copy of the check, its diff reader and digests", () => {
    for (const file of [
      '.github/scripts/check-public-text.mjs',
      'scripts/lib/review-diff.mjs',
      '.github/public-text-hashes.json',
    ])
      expect(step.run).toContain(`git show "origin/$BASE_REF:${file}"`);
    expect(step.run).toContain(
      'node "$CHECK_DIR/.github/scripts/check-public-text.mjs"',
    );
    expect(step.run).not.toMatch(/node \.github\/scripts\/check-public-text/);
  });

  it('skips only when the base branch has no check, never for missing digests', () => {
    const exits = step.run.match(/exit 0/g) ?? [];
    expect(exits).toHaveLength(1);
    const skip = step.run.slice(0, step.run.indexOf('exit 0'));
    expect(skip).toContain('check-public-text.mjs');
    expect(skip).not.toContain('public-text-hashes.json');
    // A missing digest file is removed, so the check itself fails on it.
    expect(step.run).toContain('|| rm -f "$CHECK_DIR/public-text-hashes.json"');
  });

  it('deepens only the base branch and the pull request head before any whole fetch', () => {
    const deepen = step.run.indexOf(
      'git fetch --no-tags --deepen=500 origin "$BASE_REF" "refs/pull/$PR_NUMBER/head"',
    );
    const whole = step.run.indexOf(
      'git fetch --no-tags --unshallow origin "$BASE_REF" "refs/pull/$PR_NUMBER/head"',
    );
    expect(deepen).toBeGreaterThan(-1);
    expect(whole).toBeGreaterThan(deepen);
    expect(step.run).not.toMatch(/--unshallow origin >/);
  });

  it('checks the pull request head from its merge base, and fails without one', () => {
    expect(step.run).toContain('HEAD_SHA=$(git rev-parse HEAD^2)');
    expect(step.run).toContain('git merge-base "$BASE_TIP" "$HEAD_SHA"');
    expect(step.run).toContain('--base "$MERGE_BASE" --head "$HEAD_SHA"');
    expect(step.run).toMatch(/merge base was not found[^\n]*\n\s*exit 1/);
  });

  it('reads the current title and description through the API, and never prints them', () => {
    expect(step.run).toContain(
      'gh api "repos/$GITHUB_REPOSITORY/pulls/$PR_NUMBER" > "$CHECK_DIR/pull-request.json"',
    );
    expect(step.run).toContain('--pr-json "$CHECK_DIR/pull-request.json"');
    // A step's env is printed in the log, so the text never goes through it.
    expect(JSON.stringify(step.env)).not.toMatch(/title|body/);
    expect(step.run).not.toMatch(/cat [^\n]*pull-request\.json/);
    expect(workflow.jobs.lint.permissions['pull-requests']).toBe('read');
  });
});
