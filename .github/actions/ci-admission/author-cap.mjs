// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file author-cap.mjs
 * @input A pull-request CI run, the open pull requests, and CI's pull-request
 *   runs: the ones running, and the ones cancelled while they waited their turn
 * @output Whether a run waits for its author's turn, and which waiting runs to
 *   start again when the author's runs end
 * @position Shared by CI admission (action.yml, phase `room`) and the
 *   workflow that starts a waiting run again (ci-author-turn.yml)
 *
 * One author runs at most AUTHOR_CAP pull-request CI runs at once. A run past
 * the cap holds no runner while it waits: it marks its head with the
 * AUTHOR_CAP_STATUS commit status (pending) and cancels itself. When one of
 * the author's runs ends, the author's oldest waiting run starts again. Runs
 * take turns in the order they began (spec:AST-030/DEC-31, FR16).
 */

import {STALE_MS} from './count.mjs';

/** The most pull-request CI runs one author runs at once. */
export const AUTHOR_CAP = 3;

/** The commit status a run that waits for its author's turn sets on its head. */
export const AUTHOR_CAP_STATUS = 'CI author cap';

/**
 * Authors whose pull requests the cap does not count: none. One list, so a
 * change to who is exempt is one line.
 * @type {string[]}
 */
export const AUTHOR_CAP_EXEMPT = [];

/** The CI workflow whose pull-request runs the cap counts. */
export const CI_WORKFLOW = 'ci.yml';

/** How far back a cancelled run can still be a waiting one. */
export const WAITING_LOOKBACK_MS = 24 * 60 * 60_000;

/**
 * @param {string | undefined | null} login
 * @param {string[]} [exempt]
 */
export function isExempt(login, exempt = AUTHOR_CAP_EXEMPT) {
  const name = String(login ?? '').toLowerCase();
  return name !== '' && exempt.some(entry => entry.toLowerCase() === name);
}

/**
 * Whether run `a` began before run `b`: by creation time, then by id.
 * @param {{id: number, created_at: string}} a
 * @param {{id: number, created_at: string}} b
 */
export function beganBefore(a, b) {
  const at = Date.parse(a.created_at);
  const bt = Date.parse(b.created_at);
  return at < bt || (at === bt && a.id < b.id);
}

/**
 * Whether `self` waits for its author's turn. Only runs that began before it
 * count, running or waiting, so runs that start together never all wait for
 * each other, and a new run never passes an older one that waits.
 * @param {{
 *   self: {id: number, created_at: string},
 *   running: Array<{id: number, created_at: string}>,
 *   waiting: Array<{id: number, created_at: string}>,
 *   cap?: number,
 * }} input
 */
export function authorTurn({self, running, waiting, cap = AUTHOR_CAP}) {
  const others = run => run.id !== self.id && beganBefore(run, self);
  const ahead = running.filter(others).length;
  const waitingAhead = waiting.filter(others).length;
  return {waits: ahead + waitingAhead >= cap, ahead, waitingAhead};
}

/**
 * The author's waiting runs to start again now: the oldest first, as many as
 * the cap leaves room for.
 * @template {{id: number, created_at: string}} Run
 * @param {{running: Array<{id: number}>, waiting: Run[], cap?: number}} input
 * @returns {Run[]}
 */
export function nextTurns({running, waiting, cap = AUTHOR_CAP}) {
  const room = Math.max(0, cap - running.length);
  return [...waiting]
    .sort((a, b) => (beganBefore(a, b) ? -1 : beganBefore(b, a) ? 1 : 0))
    .slice(0, room);
}

/**
 * Reads the open pull requests and CI's pull-request runs, and groups them by
 * pull-request author. Fork pull requests are left out: their runs cannot
 * cancel themselves or set a status.
 * @param {{
 *   github: any,
 *   owner: string,
 *   repo: string,
 *   now?: number,
 *   only?: string,
 * }} input `only` reads one author's waiting runs, not every author's.
 */
export async function readAuthors({
  github,
  owner,
  repo,
  now = Date.now(),
  only,
}) {
  const full = `${owner}/${repo}`;
  const pulls = (
    await github.paginate(github.rest.pulls.list, {
      owner,
      repo,
      state: 'open',
      per_page: 100,
    })
  ).filter(
    pull => pull.head?.repo?.full_name === full && !isExempt(pull.user?.login),
  );
  const byNumber = new Map(pulls.map(pull => [pull.number, pull]));
  const byHead = new Map(pulls.map(pull => [pull.head.sha, pull]));
  const pullOf = run =>
    (run.pull_requests ?? []).map(p => byNumber.get(p.number)).find(Boolean) ??
    byHead.get(run.head_sha);
  const list = async (status, extra = {}) =>
    (
      await github.rest.actions.listWorkflowRuns({
        owner,
        repo,
        workflow_id: CI_WORKFLOW,
        event: 'pull_request',
        status,
        per_page: 100,
        ...extra,
      })
    ).data.workflow_runs;
  /** @type {Map<string, {running: any[], waiting: any[]}>} */
  const authors = new Map();
  const of = login => {
    if (!authors.has(login)) authors.set(login, {running: [], waiting: []});
    return authors.get(login);
  };
  const all = [...(await list('in_progress')), ...(await list('queued'))];
  for (const run of all) {
    // A run GitHub still lists as running but has not updated in STALE_MS
    // holds no runner and never ends: it takes no turn (as in count.mjs).
    if (now - Date.parse(run.updated_at ?? '') > STALE_MS) continue;
    const pull = pullOf(run);
    if (pull) of(pull.user.login).running.push({...run, pull: pull.number});
  }
  // A waiting run is cancelled, at its pull request's current head, and that
  // head's newest author-cap status is still pending.
  const since = new Date(now - WAITING_LOOKBACK_MS).toISOString();
  const cancelled = await list('cancelled', {created: `>=${since}`});
  const newestAtHead = new Map();
  for (const run of cancelled) {
    const pull = pullOf(run);
    if (!pull || pull.head.sha !== run.head_sha) continue;
    if (only != null && pull.user.login !== only) continue;
    const seen = newestAtHead.get(run.head_sha);
    if (!seen || beganBefore(seen.run, run))
      newestAtHead.set(run.head_sha, {run, pull});
  }
  for (const {run, pull} of newestAtHead.values()) {
    if (
      (await capStatus({github, owner, repo, sha: run.head_sha}))?.state !==
      'pending'
    )
      continue;
    of(pull.user.login).waiting.push({...run, pull: pull.number});
  }
  return authors;
}

/**
 * The newest AUTHOR_CAP_STATUS on a commit, or null.
 * @param {{github: any, owner: string, repo: string, sha: string}} input
 */
export async function capStatus({github, owner, repo, sha}) {
  const {data} = await github.rest.repos.listCommitStatusesForRef({
    owner,
    repo,
    ref: sha,
    per_page: 100,
  });
  // GitHub lists a commit's statuses newest first.
  return data.find(status => status.context === AUTHOR_CAP_STATUS) ?? null;
}
