// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: the trainer-pass workflow sets one commit status on each
 *   pull request head, from a trusted context with the least permission, and
 *   the backfill gives open pull requests the same status without
 *   overwriting one a trainer set.
 */

import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

import {
  BOT,
  CONTEXT,
  backfill,
  statusFor,
} from '../../scripts/trainer-pass-backfill.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const workflow = yaml.parse(
  fs.readFileSync(
    path.join(root, '.github/workflows/trainer-pass.yml'),
    'utf8',
  ),
);
const job = workflow.jobs['trainer-pass'];
const script = job.steps.at(-1).with.script;

/** Runs the workflow's script against a pull request opened by `login`. */
async function runScript(login, sha = 'a'.repeat(40)) {
  const calls = [];
  const github = {
    rest: {repos: {createCommitStatus: async args => calls.push(args)}},
  };
  const context = {
    repo: {owner: 'meta', repo: 'astryx'},
    payload: {pull_request: {user: {login}, head: {sha}}},
  };
  const core = {info: () => {}};
  const AsyncFunction = (async () => {}).constructor;
  await new AsyncFunction('github', 'context', 'core', script)(
    github,
    context,
    core,
  );
  return calls;
}

describe('the trainer-pass workflow', () => {
  it('runs only on pull_request_target for these events', () => {
    expect(Object.keys(workflow.on)).toEqual(['pull_request_target']);
    expect(workflow.on.pull_request_target.types).toEqual([
      'opened',
      'synchronize',
      'reopened',
      'ready_for_review',
    ]);
  });

  it('checks out nothing and holds only statuses: write', () => {
    expect(workflow.permissions).toEqual({});
    expect(job.permissions).toEqual({statuses: 'write'});
    expect(job['runs-on']).toBe('ubuntu-slim');
    expect(job.steps).toHaveLength(1);
    for (const step of job.steps) {
      expect(String(step.uses ?? '')).not.toMatch(/checkout/);
      expect(step.run).toBeUndefined();
    }
    expect(job.steps[0].uses).toBe('actions/github-script@v9');
  });

  it('passes a pull request the review bot did not open', async () => {
    expect(await runScript('someone')).toEqual([
      {
        owner: 'meta',
        repo: 'astryx',
        sha: 'a'.repeat(40),
        context: CONTEXT,
        state: 'success',
        description: 'not an Astracat PR',
      },
    ]);
  });

  it("holds the review bot's pull request for the trainer at that exact head", async () => {
    const [call] = await runScript(BOT, 'b'.repeat(40));
    expect(call).toMatchObject({
      sha: 'b'.repeat(40),
      context: CONTEXT,
      state: 'pending',
      description: 'waiting for trainer review of this exact head',
    });
  });
});

/** A fake `gh api` over a list of open pull requests and their statuses. */
function fakeApi(pulls, statusesBySha = {}) {
  const posts = [];
  const api = args => {
    const target = args.find(arg => arg.startsWith('repos/'));
    if (target.includes('/pulls?')) return [pulls];
    if (target.includes('/commits/')) {
      return statusesBySha[target.split('/commits/')[1].split('/')[0]] ?? [];
    }
    if (args.includes('POST')) {
      posts.push(args);
      return {};
    }
    throw new Error(`unexpected call ${args.join(' ')}`);
  };
  return {api, posts};
}

const pr = (number, login, sha) => ({number, user: {login}, head: {sha}});

describe('the backfill', () => {
  it('matches the workflow for each author', () => {
    expect(statusFor('someone').state).toBe('success');
    expect(statusFor(BOT).state).toBe('pending');
  });

  it('is a dry run by default and posts nothing', () => {
    const {api, posts} = fakeApi([pr(1, 'someone', 'a1'), pr(2, BOT, 'b2')]);
    expect(backfill({api})).toEqual([
      {number: 1, sha: 'a1', state: 'success', action: 'would-set'},
      {number: 2, sha: 'b2', state: 'pending', action: 'would-set'},
    ]);
    expect(posts).toEqual([]);
  });

  it('posts with write, and keeps a status already on the head', () => {
    const {api, posts} = fakeApi([pr(1, 'someone', 'a1'), pr(2, BOT, 'b2')], {
      b2: [{context: CONTEXT, state: 'success'}],
    });
    expect(backfill({api, write: true})).toEqual([
      {number: 1, sha: 'a1', state: 'success', action: 'set'},
      {number: 2, sha: 'b2', state: 'success', action: 'kept'},
    ]);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toEqual(
      expect.arrayContaining([
        'repos/meta/astryx/statuses/a1',
        'state=success',
        `context=${CONTEXT}`,
      ]),
    );
  });
});
