// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file heavy-turn.mjs
 * @input A pull request, its head's review gate status, and its newest CI run
 * @output Whether that run deferred its heavy suites at a head whose review
 *   now passes, and the re-run that runs them
 * @position Read by ci-review-pass.yml (spec:AST-030/DEC-32, FR20)
 *
 * A pull-request push runs only the fast checks in its run's first attempt
 * and defers the heavy suites (the `heavy-ci` job). They run at the first head
 * whose review and spec gates pass: then the deferred run is run again in
 * full, and a later attempt runs every suite. merge-guard's pre-merge re-run
 * is such a later attempt too.
 */

/** The commit status the review gate writes (both halves: DEC-14). */
export const REVIEW_STATUS = 'review-required';

/** The CI workflow whose deferred runs start again. */
export const CI_WORKFLOW = 'ci.yml';

/** The step every required check runs when its run deferred the heavy suites. */
export const DEFERRED_STEP = 'Heavy CI deferred';

/**
 * Whether a run's jobs show that it deferred its heavy suites: a required
 * check failed at the deferral step.
 * @param {Array<{steps?: Array<{name: string, conclusion: string | null}>}>} jobs
 */
export function deferred(jobs) {
  return jobs.some(job =>
    (job.steps ?? []).some(
      step => step.name === DEFERRED_STEP && step.conclusion === 'failure',
    ),
  );
}

/**
 * The newest REVIEW_STATUS on a commit, or null.
 * @param {{github: any, owner: string, repo: string, sha: string}} input
 */
export async function reviewStatus({github, owner, repo, sha}) {
  const {data} = await github.rest.repos.listCommitStatusesForRef({
    owner,
    repo,
    ref: sha,
    per_page: 100,
  });
  // GitHub lists a commit's statuses newest first.
  return data.find(status => status.context === REVIEW_STATUS) ?? null;
}

/**
 * The pull requests a CI run belongs to. GitHub lists them on a run from this
 * repository but none on a fork's run, so a fork's open pull requests are
 * found by the run's head repository and branch, at the run's head.
 * @param {{github: any, owner: string, repo: string, run: any}} input
 * @returns {Promise<number[]>}
 */
export async function pullsForRun({github, owner, repo, run}) {
  const listed = (run.pull_requests ?? []).map(pull => pull.number);
  if (listed.length > 0) return listed;
  const headOwner = run.head_repository?.owner?.login;
  if (!headOwner || !run.head_branch) return [];
  const {data} = await github.rest.pulls.list({
    owner,
    repo,
    state: 'open',
    head: `${headOwner}:${run.head_branch}`,
    per_page: 100,
  });
  return data
    .filter(pull => pull.head?.sha === run.head_sha)
    .map(pull => pull.number);
}

/**
 * Starts the heavy suites for a pull request whose review passes at its head:
 * re-runs its newest CI run there in full when that run's first attempt
 * deferred them. Returns what it did, in words.
 * @param {{
 *   github: any,
 *   owner: string,
 *   repo: string,
 *   pull: {number: number, base?: {ref?: string}, head: {sha: string}},
 * }} input
 */
export async function startHeavy({github, owner, repo, pull}) {
  const sha = pull.head.sha;
  const at = `#${pull.number} at ${sha.slice(0, 8)}`;
  const status = await reviewStatus({github, owner, repo, sha});
  if (status?.state !== 'success') return `${at}: review has not passed`;
  const {data} = await github.rest.actions.listWorkflowRuns({
    owner,
    repo,
    workflow_id: CI_WORKFLOW,
    event: 'pull_request',
    head_sha: sha,
    per_page: 10,
  });
  const run = [...data.workflow_runs].sort(
    (a, b) =>
      Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id,
  )[0];
  if (run == null) return `${at}: no CI run`;
  if (run.run_attempt > 1) return `${at}: run ${run.id} already ran again`;
  if (run.status !== 'completed') return `${at}: run ${run.id} still runs`;
  const {
    data: {jobs},
  } = await github.rest.actions.listJobsForWorkflowRun({
    owner,
    repo,
    run_id: run.id,
    filter: 'latest',
    per_page: 100,
  });
  if (!deferred(jobs)) return `${at}: run ${run.id} ran its heavy suites`;
  await github.rest.actions.reRunWorkflow({owner, repo, run_id: run.id});
  return `${at}: started run ${run.id} again in full`;
}
