// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The shared rate-limit wait (lib/rate-limit-backoff.cjs).
 *
 * @input  a fake client whose `hook.wrap` installs the hook, and requests that
 *   fail with GitHub's rate-limit responses
 * @output proofs that a rate-limited request waits for the reset with jitter
 *   and is retried, that a wait past the bound fails at once and says when to
 *   re-run, and that every other error passes through unchanged
 * @position focused suite for .github/scripts/lib/rate-limit-backoff.cjs
 */

import {createRequire} from 'node:module';

import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {
  installRateLimitBackoff,
  rateLimitWaitMs,
} = require('./rate-limit-backoff.cjs');

const NOW = 1_800_000_000_000;

function rateLimited({status = 403, headers = {}, message} = {}) {
  return Object.assign(
    new Error(message ?? 'API rate limit exceeded for installation.'),
    {status, response: {headers}},
  );
}

/** A client whose requests answer from `responses` in order. */
function client(responses, {maxWaitMs} = {}) {
  let wrapped;
  const github = {hook: {wrap: (_, fn) => (wrapped = fn)}};
  const log = {warnings: [], sleeps: [], info: []};
  let clock = NOW;
  const counter = installRateLimitBackoff({
    github,
    core: {
      warning: message => log.warnings.push(message),
      info: message => log.info.push(message),
    },
    maxWaitMs,
    now: () => clock,
    sleep: async ms => {
      log.sleeps.push(ms);
      clock += ms;
    },
    random: () => 0.5,
    logOnExit: false,
  });
  const queue = [...responses];
  const request = async () => {
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  const call = () =>
    wrapped(request, {method: 'GET', url: '/repos/{owner}/{repo}/pulls/{n}'});
  return {github, call, log, counter};
}

describe('rateLimitWaitMs', () => {
  it('waits until the reset of an exhausted limit', () => {
    const error = rateLimited({
      headers: {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(NOW / 1000 + 90),
      },
    });
    expect(rateLimitWaitMs(error, NOW)).toBe(90_000);
  });

  it('honours retry-after on a 429 or a secondary limit', () => {
    expect(
      rateLimitWaitMs(
        rateLimited({status: 429, headers: {'retry-after': '30'}}),
        NOW,
      ),
    ).toBe(30_000);
  });

  it('waits a minute for a rate-limit message without a reset time', () => {
    expect(
      rateLimitWaitMs(
        rateLimited({message: 'You have exceeded a secondary rate limit.'}),
        NOW,
      ),
    ).toBe(60_000);
  });

  it('is not a rate limit for a permission 403 or another status', () => {
    expect(
      rateLimitWaitMs(
        Object.assign(new Error('Resource not accessible by integration'), {
          status: 403,
          response: {headers: {'x-ratelimit-remaining': '4999'}},
        }),
        NOW,
      ),
    ).toBeNull();
    expect(
      rateLimitWaitMs(
        Object.assign(new Error('Not Found'), {status: 404}),
        NOW,
      ),
    ).toBeNull();
  });
});

describe('installRateLimitBackoff', () => {
  const resetIn = seconds => ({
    'x-ratelimit-remaining': '0',
    'x-ratelimit-reset': String(NOW / 1000 + seconds),
  });

  it('waits for the reset with jitter, then retries', async () => {
    const {call, log, counter} = client([
      rateLimited({headers: resetIn(60)}),
      {data: 'ok'},
    ]);
    await expect(call()).resolves.toEqual({data: 'ok'});
    // Sixty seconds to the reset, plus half the 15-second jitter.
    expect(log.sleeps).toEqual([67_500]);
    expect(log.warnings[0]).toMatch(
      /^GitHub API rate limit reached: waiting 68 s for the reset at .+, then retrying GET /,
    );
    expect(counter).toEqual({requests: 2, waits: 1});
  });

  it('fails at once, saying when to re-run, when the reset is past the bound', async () => {
    const {call, log} = client([rateLimited({headers: resetIn(1800)})]);
    const error = await call().catch(caught => caught);
    expect(log.sleeps).toEqual([]);
    expect(error.rateLimited).toBe(true);
    expect(error.status).toBe(403);
    expect(error.message).toMatch(
      /^GitHub API rate limit reached for this repository's workflows \(resets at .+\)\. Re-run this job after that\./,
    );
  });

  it('stops waiting once the job has spent its bound', async () => {
    const {call, log} = client(
      [
        rateLimited({headers: resetIn(100)}),
        // 107.5 s in, the next reset is 292.5 s away: past the 300 s bound.
        rateLimited({headers: resetIn(400)}),
      ],
      {maxWaitMs: 300_000},
    );
    const error = await call().catch(caught => caught);
    expect(log.sleeps).toEqual([107_500]);
    expect(error.rateLimited).toBe(true);
  });

  it('passes every other error through unchanged', async () => {
    const denied = Object.assign(
      new Error('Resource not accessible by integration'),
      {
        status: 403,
        response: {headers: {}},
      },
    );
    const {call, log} = client([denied]);
    await expect(call()).rejects.toBe(denied);
    expect(log.sleeps).toEqual([]);
  });

  it('installs once per client', () => {
    const {github, counter} = client([]);
    expect(installRateLimitBackoff({github, core: {}, logOnExit: false})).toBe(
      counter,
    );
  });
});
