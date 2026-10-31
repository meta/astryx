// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';

/**
 * @file Waits out the repository's shared GitHub API rate limit.
 *
 * Every workflow in the repository shares one hourly REST budget for its job
 * token. A gate or report script that hits it used to fail at once; with this
 * hook installed on its client, a rate-limited call waits for the reset, with
 * jitter so that waiting jobs do not all retry at once, and is retried. A wait
 * that would pass the job's bound (five minutes by default) fails at once
 * instead, with a message that says when the limit resets and to re-run.
 * Any other error, a permission 403 included, is thrown as before.
 *
 * @input  the job's GitHub client (actions/github-script `github`) and `core`
 * @output the same client, retrying rate-limited requests; a count of the
 *   requests the job made, logged when the job's process exits
 * @position loaded by the review, spec-owner, re-request and PR report jobs
 */

const DEFAULT_MAX_WAIT_MS = 5 * 60 * 1000;
const MAX_JITTER_MS = 15 * 1000;
// A secondary limit can arrive without a reset time.
const UNTIMED_WAIT_MS = 60 * 1000;

/**
 * How long to wait before retrying a request that failed on a rate limit, or
 * null when the failure is not a rate limit.
 */
function rateLimitWaitMs(error, now) {
  const status = Number(error?.status);
  if (status !== 403 && status !== 429) return null;
  const headers = error?.response?.headers ?? {};
  const header = name => {
    const value = headers[name] ?? headers[name.toLowerCase()];
    return value == null ? null : String(value);
  };
  const exhausted = header('x-ratelimit-remaining') === '0';
  const retryAfter = header('retry-after');
  const message = String(error?.message ?? '');
  if (
    status === 403 &&
    !exhausted &&
    retryAfter == null &&
    !/rate limit/i.test(message)
  ) {
    return null;
  }
  if (retryAfter != null && Number.isFinite(Number(retryAfter))) {
    return Math.max(1000, Number(retryAfter) * 1000);
  }
  const reset = Number(header('x-ratelimit-reset'));
  if (Number.isFinite(reset) && reset > 0) {
    return Math.max(1000, reset * 1000 - now);
  }
  return UNTIMED_WAIT_MS;
}

/**
 * Installs the wait-and-retry hook on `github` and returns the job's request
 * count. Idempotent: a client that already has it keeps the first.
 */
function installRateLimitBackoff({
  github,
  core,
  maxWaitMs = DEFAULT_MAX_WAIT_MS,
  now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  random = Math.random,
  logOnExit = true,
}) {
  if (github.__rateLimitBackoff) return github.__rateLimitBackoff;
  const deadline = now() + maxWaitMs;
  const counter = {requests: 0, waits: 0};
  github.hook.wrap('request', async (request, options) => {
    for (;;) {
      counter.requests += 1;
      try {
        return await request(options);
      } catch (error) {
        const wait = rateLimitWaitMs(error, now());
        if (wait == null) throw error;
        const jittered = wait + Math.floor(random() * MAX_JITTER_MS);
        const resetAt = new Date(now() + wait).toISOString();
        if (now() + jittered > deadline) {
          const limited = new Error(
            `GitHub API rate limit reached for this repository's workflows (resets at ${resetAt}). Re-run this job after that. (${error.message})`,
          );
          limited.status = error.status;
          limited.rateLimited = true;
          throw limited;
        }
        counter.waits += 1;
        core.warning(
          `GitHub API rate limit reached: waiting ${Math.ceil(jittered / 1000)} s for the reset at ${resetAt}, then retrying ${options.method} ${options.url}.`,
        );
        await sleep(jittered);
      }
    }
  });
  if (logOnExit) {
    process.once('exit', () =>
      core.info(
        `GitHub API requests made by this step: ${counter.requests} (rate-limit waits: ${counter.waits}).`,
      ),
    );
  }
  Object.defineProperty(github, '__rateLimitBackoff', {value: counter});
  return counter;
}

module.exports = {
  DEFAULT_MAX_WAIT_MS,
  installRateLimitBackoff,
  rateLimitWaitMs,
};
