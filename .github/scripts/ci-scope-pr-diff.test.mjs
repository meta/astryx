// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: the interaction and native Swift scope jobs measure the pull
 *   request's own diff.
 *
 * Both jobs run `.github/scripts/pr-scope-touches.sh`, which diffs HEAD
 * against its merge base with a base commit. From the PR's recorded (often
 * old) base, the merge commit carries main's own changes since then, so a
 * CLI-only pull request cut before the interaction proofs existed read as
 * changing their config. From the PR head, the helper deepens history back to
 * an old fork point, which can outlast the job's timeout. Both jobs check out
 * the merge commit with its parents and diff it against its first parent: the
 * PR's own change against the base it merged into, with no deepening. These
 * cases run the real step script and helper with real git, against a local
 * origin, checked out the way the workflow checks out; anything undecided
 * still runs the proofs.
 */

import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterAll, describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const ci = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
);
const HELPER = fs.readFileSync(
  path.join(root, '.github/scripts/pr-scope-touches.sh'),
  'utf8',
);

const checkoutOf = job =>
  ci.jobs[job].steps.find(step => step.uses?.startsWith('actions/checkout'));
const decideStep = () =>
  ci.jobs['interaction-scope'].steps.find(
    step => step.name === 'Decide whether the interaction proofs apply',
  );

const REAL_GIT = execFileSync('which', ['git'], {encoding: 'utf8'}).trim();
const scratch = [];
afterAll(() => {
  for (const dir of scratch) {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

function git(cwd, ...args) {
  return execFileSync(REAL_GIT, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'ci',
      GIT_AUTHOR_EMAIL: 'ci@example.com',
      GIT_COMMITTER_NAME: 'ci',
      GIT_COMMITTER_EMAIL: 'ci@example.com',
    },
  }).trim();
}

function write(dir, file, text) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
  fs.writeFileSync(path.join(dir, file), text);
}

/**
 * A repository whose main moved on after a pull request branched from `base`:
 * `baseFiles` at the base, `mainFiles` added on main afterwards, and the PR's
 * own `prFiles` (a null value deletes the file). Returns the origin URL and
 * the base, head and merge-commit SHAs.
 */
function scenario({
  baseFiles,
  mainFiles,
  prFiles,
  mainCommits = 1,
  prMergesMain = 0,
}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-scope-'));
  scratch.push(dir);
  const work = path.join(dir, 'work');
  fs.mkdirSync(work);
  git(work, 'init', '-q', '-b', 'main');
  write(work, '.github/scripts/pr-scope-touches.sh', HELPER);
  for (const [file, text] of Object.entries(baseFiles)) {
    write(work, file, text);
  }
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'base');
  const base = git(work, 'rev-parse', 'HEAD');

  for (const [file, text] of Object.entries(mainFiles)) {
    write(work, file, text);
  }
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'main moves on');
  for (let i = 1; i < mainCommits; i++) {
    write(work, 'docs/history.md', `${i}\n`);
    git(work, 'add', '-A');
    git(work, 'commit', '-q', '-m', `main commit ${i}`);
  }

  git(work, 'checkout', '-q', '-b', 'pr', base);
  for (const [file, text] of Object.entries(prFiles)) {
    if (text === null) {
      fs.rmSync(path.join(work, file));
    } else {
      write(work, file, text);
    }
  }
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'the pull request');
  // A long-lived branch that merges main now and then, which buries the PR's
  // recorded base deep in its history.
  for (let round = 0; round < prMergesMain; round++) {
    git(work, 'checkout', '-q', 'main');
    for (let i = 0; i < 3; i++) {
      write(work, 'docs/history.md', `${round}.${i}\n`);
      git(work, 'add', '-A');
      git(work, 'commit', '-q', '-m', `main ${round}.${i}`);
    }
    git(work, 'checkout', '-q', 'pr');
    git(work, 'merge', '-q', '--no-ff', '--no-edit', 'main');
  }
  const head = git(work, 'rev-parse', 'HEAD');

  git(work, 'checkout', '-q', 'main');
  git(work, 'merge', '-q', '--no-ff', '--no-edit', 'pr');
  const merge = git(work, 'rev-parse', 'HEAD');

  const origin = path.join(dir, 'origin.git');
  git(dir, 'clone', '-q', '--bare', work, origin);
  return {url: `file://${origin}`, base, head, merge, dir};
}

/**
 * Runs the decide step as Actions does, in a checkout made the way the
 * interaction-scope job checks out (its `ref`, else the merge commit, at its
 * `fetch-depth`). Every git call is logged. Returns the outputs and the log.
 */
function decide(repo, {headSha = repo.head, env = {}} = {}) {
  const {ref = '', 'fetch-depth': depth = 1} =
    checkoutOf('interaction-scope').with ?? {};
  const checkedOut = ref.includes('pull_request.head.sha')
    ? repo.head
    : repo.merge;
  const workspace = fs.mkdtempSync(path.join(repo.dir, 'ws-'));
  git(workspace, 'init', '-q');
  git(workspace, 'remote', 'add', 'origin', repo.url);
  git(workspace, 'fetch', '-q', `--depth=${depth}`, 'origin', checkedOut);
  git(workspace, 'checkout', '-q', '--detach', checkedOut);
  const bin = fs.mkdtempSync(path.join(repo.dir, 'bin-'));
  const log = path.join(bin, 'git.log');
  fs.writeFileSync(
    path.join(bin, 'git'),
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(log)}\nexec ${JSON.stringify(REAL_GIT)} "$@"\n`,
    {mode: 0o755},
  );
  fs.writeFileSync(log, '');
  const output = path.join(workspace, '.output');
  fs.writeFileSync(output, '');
  const result = spawnSync(
    'bash',
    ['--noprofile', '--norc', '-eo', 'pipefail', '-c', decideStep().run],
    {
      cwd: workspace,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        ...env,
        GITHUB_OUTPUT: output,
        EVENT_NAME: 'pull_request',
        DOCSITE_ONLY: 'false',
        TOOLING_ONLY: 'false',
        BASE_SHA: repo.base,
        HEAD_SHA: headSha,
      },
    },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    applies: /applies=(\w+)/.exec(fs.readFileSync(output, 'utf8'))?.[1],
    gitCalls: fs.readFileSync(log, 'utf8'),
  };
}

const CONFIG = 'playwright.interaction.config.ts';

describe('scope jobs measure the pull request’s own diff', () => {
  it('check out the merge commit with its parents', () => {
    expect(checkoutOf('interaction-scope').with).toEqual({'fetch-depth': 2});
    expect(checkoutOf('native-swift-scope').with).toEqual({'fetch-depth': 2});
    const swift = ci.jobs['native-swift-scope'].steps.find(
      step => step.name === 'Decide whether native Swift changed',
    );
    expect(swift.env.BASE_SHA).toContain('merge_group.base_sha');
    expect(swift.run).toContain('[ "$EVENT_NAME" = pull_request ]');
    expect(swift.run).toContain('BASE_SHA="$(git rev-parse HEAD^1)"');
  });

  it('decides without deepening history, however far main moved on', () => {
    const repo = scenario({
      baseFiles: {'packages/cli/scripts/a.mjs': 'a\n'},
      mainFiles: {[CONFIG]: 'config\n'},
      prFiles: {'packages/cli/scripts/a.mjs': 'a2\n'},
      mainCommits: 6,
      prMergesMain: 4,
    });
    const result = decide(repo, {env: {PR_SCOPE_FETCH_DEPTH: '2'}});
    expect(result).toMatchObject({status: 0, applies: 'false'});
    expect(result.gitCalls).not.toContain('--deepen');
  });

  it('a CLI-only pull request on a base older than the proofs does not run them', () => {
    const repo = scenario({
      baseFiles: {'packages/cli/scripts/a.mjs': 'a\n'},
      mainFiles: {[CONFIG]: 'config\n', 'packages/core/src/b.ts': 'b\n'},
      prFiles: {'packages/cli/scripts/a.mjs': 'a2\n'},
    });
    expect(decide(repo)).toMatchObject({status: 0, applies: 'false'});
  });

  it('a component pull request on a base older than the proofs skips them with the notice', () => {
    const repo = scenario({
      baseFiles: {'packages/core/src/a.ts': 'a\n'},
      mainFiles: {[CONFIG]: 'config\n'},
      prFiles: {'packages/core/src/a.ts': 'a2\n'},
    });
    const result = decide(repo);
    expect(result).toMatchObject({status: 0, applies: 'false'});
    expect(result.stdout).toContain('Interaction proofs predate this branch');
  });

  it('a pull request that really changes the interaction config runs the proofs', () => {
    const repo = scenario({
      baseFiles: {[CONFIG]: 'config\n', 'packages/core/src/a.ts': 'a\n'},
      mainFiles: {'packages/core/src/b.ts': 'b\n'},
      prFiles: {[CONFIG]: null},
    });
    expect(decide(repo)).toMatchObject({status: 0, applies: 'true'});
  });

  it('an unfetchable head runs the proofs (fail safe)', () => {
    const repo = scenario({
      baseFiles: {'packages/core/src/a.ts': 'a\n'},
      mainFiles: {[CONFIG]: 'config\n'},
      prFiles: {'packages/core/src/a.ts': 'a2\n'},
    });
    expect(decide(repo, {headSha: 'f'.repeat(40)})).toMatchObject({
      status: 0,
      applies: 'true',
    });
  });
});
