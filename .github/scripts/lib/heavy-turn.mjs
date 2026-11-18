// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file heavy-turn.mjs
 * @input A pull request, its head's review gate status, and its newest CI run
 * @output Whether that run deferred its heavy suites at a head whose review
 *   now passes, and the re-run that runs them
 * @position Read by ci-review-pass.yml (spec:AST-030/DEC-32, FR20)
 *
 * A pull-request push runs only the fast checks in its run's first attempt
 * and defers the heavy suites (the `heavy-ci` job). They run at a head whose
 * review passes as DEC-11 reads it (`reviewPasses`): the review app (for a
 * write-access author) or an engineering owner approved that exact head, and
 * the review-required status shows success. Then the deferred run is run again
 * in full, and a later attempt runs every suite. merge-guard's pre-merge
 * re-run is such a later attempt too.
 */

import {createRequire} from 'node:module';
import {workflowRunPullCandidates} from './workflow-run-pulls.mjs';

const reviewDecision = createRequire(import.meta.url)(
  '../review-signal-decision.cjs',
);

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
 * The pull requests a CI run belongs to, by the shared lookup. A fork's run
 * names none, so a fork's open pull request is taken by the run's head
 * repository and branch, and only at the run's head.
 * @param {{github: any, owner: string, repo: string, run: any}} input
 * @returns {Promise<number[]>}
 */
export async function pullsForRun({github, owner, repo, run}) {
  const candidates =
    (await workflowRunPullCandidates({github, owner, repo, run})) ?? [];
  const named = (run.pull_requests ?? []).length > 0;
  return candidates
    .filter(pull => named || pull.head?.sha === run.head_sha)
    .map(pull => pull.number);
}

/**
 * The handles in an owner variable such as `vars.ENGOWNERS`, lower-cased.
 * @param {string | undefined} text
 * @returns {string[]}
 */
export function ownerHandles(text) {
  return (String(text ?? '').match(/@?[A-Za-z0-9-]+/g) ?? []).map(handle =>
    handle.replace(/^@/, '').toLowerCase(),
  );
}

/**
 * Whether a pull request's review passes at its head, as
 * architecture:knowledge-contracts DEC-11 reads the gate: `review-required`
 * succeeds there (its spec half included), and a review of that exact head
 * cleared its code half: the review app's latest verdict for a write-access
 * author, or an engineering owner's approval. An author's own push never
 * clears it.
 * @param {{
 *   github: any,
 *   owner: string,
 *   repo: string,
 *   pull: {number: number, head: {sha: string}, user?: {login?: string}},
 *   engOwners: string[],
 *   reviewApp?: string,
 * }} input
 */
export async function reviewPasses({
  github,
  owner,
  repo,
  pull,
  engOwners,
  reviewApp = '',
}) {
  const sha = pull.head.sha;
  const status = await reviewStatus({github, owner, repo, sha});
  if (status?.state !== 'success') return false;
  const reviews = await github.paginate(github.rest.pulls.listReviews, {
    owner,
    repo,
    pull_number: pull.number,
    per_page: 100,
  });
  const app = reviewDecision.normalizeReviewApp(reviewApp);
  let authorHasWrite = false;
  if (app && pull.user?.login) {
    try {
      const {data} = await github.rest.repos.getCollaboratorPermissionLevel({
        owner,
        repo,
        username: pull.user.login,
      });
      authorHasWrite = reviewDecision.hasWritePermission(data);
    } catch {
      // An unreadable permission leaves the app's verdict without effect.
    }
  }
  return reviewDecision.resolveReviewApprovals({
    reviews,
    headSha: sha,
    engOwners,
    designOwners: [],
    reviewApp: app,
    authorHasWrite,
  }).codeApproved;
}

/**
 * Starts the heavy suites for a pull request whose review passes at its head:
 * re-runs its newest CI run there in full while that run's latest attempt
 * still defers them (a failed-jobs re-run keeps the deferral). Returns what
 * it did, in words.
 * @param {{
 *   github: any,
 *   owner: string,
 *   repo: string,
 *   pull: {number: number, base?: {ref?: string}, head: {sha: string}, user?: {login?: string}},
 *   engOwners: string[],
 *   reviewApp?: string,
 * }} input
 */
export async function startHeavy({
  github,
  owner,
  repo,
  pull,
  engOwners,
  reviewApp = '',
}) {
  const sha = pull.head.sha;
  const at = `#${pull.number} at ${sha.slice(0, 8)}`;
  if (!(await reviewPasses({github, owner, repo, pull, engOwners, reviewApp})))
    return `${at}: review has not passed`;
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
