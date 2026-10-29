// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: the interaction and native Swift scope jobs measure the pull
 *   request's own diff.
 *
 * Both jobs run `.github/scripts/pr-scope-touches.sh`, which diffs HEAD
 * against its merge base with the PR's base. Checked out at the PR merge
 * commit, HEAD would carry main's own changes since that (often old) base, so
 * a CLI-only pull request cut before the interaction proofs existed read as
 * changing their config and ran proofs its head cannot run. Both jobs check out
 * the PR head instead. These cases run the real step script and helper with
 * real git, against a local origin, checked out the way the workflow checks
 * out; anything undecided still runs the proofs.
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

const scratch = [];
afterAll(() => {
  for (const dir of scratch) {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

function git(cwd, ...args) {
  return execFileSync('git', args, {
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
function scenario({baseFiles, mainFiles, prFiles}) {
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
 * interaction-scope job checks out: the PR head when its checkout names
 * `pull_request.head.sha`, else the merge commit. Returns the outputs.
 */
function decide(repo, {headSha = repo.head} = {}) {
  const ref = checkoutOf('interaction-scope').with?.ref ?? '';
  const checkedOut = ref.includes('pull_request.head.sha')
    ? repo.head
    : repo.merge;
  const workspace = fs.mkdtempSync(path.join(repo.dir, 'ws-'));
  git(workspace, 'init', '-q');
  git(workspace, 'remote', 'add', 'origin', repo.url);
  git(workspace, 'fetch', '-q', '--depth=1', 'origin', checkedOut);
  git(workspace, 'checkout', '-q', '--detach', checkedOut);
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
  };
}

const CONFIG = 'playwright.interaction.config.ts';

describe('scope jobs measure the pull request’s own diff', () => {
  it('check out the PR head, not the merge commit', () => {
    expect(checkoutOf('interaction-scope').with).toEqual({
      ref: '${{ github.event.pull_request.head.sha }}',
    });
    expect(checkoutOf('native-swift-scope').with).toEqual({
      ref: '${{ github.event.pull_request.head.sha || github.sha }}',
    });
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
