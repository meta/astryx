// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file heavy-turn.mjs
 * @input A pull request, its head's review gate status, and its newest CI run
 * @output Whether that run deferred its heavy suites at a head whose review
 *   now passes, and the re-run that runs them
 * @position Read by ci-review-pass.yml (spec:AST-030/DEC-32, FR20)
 *
 * A pull-request push runs only the fast checks in its run's first attempt
 * and defers the heavy suites (the `heavy-ci` job). They run at a head that
 * passes the heavy turn (`heavyReviewPasses`): the spec half of the review
 * gate passes, and an engineering owner or the review app approved that exact
 * head. The app's approval counts for a write-access author and for a fork a
 * maintainer admitted with `ci:run`. The heavy turn clears no gate: merging
 * reads `review-required` (DEC-11, unchanged). Then the deferred run is run again
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
 * The oldest deferred run the heavy turn starts again. A re-run replays the
 * run's own merge commit, so an older run merges the head with a main that has
 * moved on: it can fail on a contract main has since changed, and finish after
 * a fresh run. The schedule's sweep looks back as far.
 */
export const RERUN_MAX_AGE_MS = 6 * 60 * 60_000;

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
    headPushedAt: await reviewDecision.readHeadPushedAt({
      github,
      owner,
      repo,
      sha,
    }),
    engOwners,
    designOwners: [],
    reviewApp: app,
    authorHasWrite,
  }).codeApproved;
}

/** The label a maintainer adds before a fork's pull request runs CI. */
export const CI_RUN_LABEL = 'ci:run';

/**
 * Whether a maintainer (write access or more) ever added `ci:run` to a pull
 * request. The label may be gone since: a run it admitted stays admitted
 * (spec:AST-030 FR29). A label from a bot or a reader does not count.
 * @param {{github: any, owner: string, repo: string, number: number}} input
 */
export async function maintainerAdmitted({github, owner, repo, number}) {
  const events = await github.paginate(github.rest.issues.listEvents, {
    owner,
    repo,
    issue_number: number,
    per_page: 100,
  });
  const actors = new Set(
    events
      .filter(
        event =>
          event.event === 'labeled' && event.label?.name === CI_RUN_LABEL,
      )
      .map(event => event.actor?.login)
      .filter(Boolean),
  );
  for (const username of actors) {
    try {
      const {data} = await github.rest.repos.getCollaboratorPermissionLevel({
        owner,
        repo,
        username,
      });
      if (reviewDecision.hasWritePermission(data)) return true;
    } catch {
      // An unreadable permission does not admit.
    }
  }
  return false;
}

/**
 * Whether a pull request's head may start its heavy suites (the heavy turn
 * only, spec:AST-030 FR20 and DEC-32). It clears no gate: merging still reads
 * `review-required`. The spec half of the review gate passes at the head, and a
 * review of that exact head approves the code: an engineering owner, or the
 * review app's latest verdict when the author has write access or the pull
 * request comes from a fork a maintainer admitted with `ci:run`. The workflow
 * token cannot see a reader's access (a private organization member shows as
 * a contributor), so the maintainer's label is the access signal. The author's
 * own review never counts.
 * @param {{
 *   github: any,
 *   owner: string,
 *   repo: string,
 *   pull: {
 *     number: number,
 *     head: {sha: string, repo?: {full_name?: string} | null},
 *     user?: {login?: string},
 *   },
 *   engOwners: string[],
 *   reviewApp?: string,
 * }} input
 */
export async function heavyReviewPasses({
  github,
  owner,
  repo,
  pull,
  engOwners,
  reviewApp = '',
}) {
  const sha = pull.head.sha;
  const {data: statuses} = await github.rest.repos.listCommitStatusesForRef({
    owner,
    repo,
    ref: sha,
    per_page: 100,
  });
  if (!reviewDecision.readSpecGate(statuses).satisfied) return false;
  const author = pull.user?.login?.toLowerCase() ?? '';
  const reviews = (
    await github.paginate(github.rest.pulls.listReviews, {
      owner,
      repo,
      pull_number: pull.number,
      per_page: 100,
    })
  ).filter(review => review.user?.login?.toLowerCase() !== author);
  const app = reviewDecision.normalizeReviewApp(reviewApp);
  let appCounts = false;
  if (app && author) {
    try {
      const {data} = await github.rest.repos.getCollaboratorPermissionLevel({
        owner,
        repo,
        username: pull.user.login,
      });
      appCounts = reviewDecision.hasWritePermission(data);
    } catch {
      // An unreadable permission leaves the app's verdict to the fork rule.
    }
    // A head with no repository (a deleted fork) is a fork too.
    const fork =
      pull.head.repo?.full_name?.toLowerCase() !==
      `${owner}/${repo}`.toLowerCase();
    if (!appCounts && fork)
      appCounts = await maintainerAdmitted({
        github,
        owner,
        repo,
        number: pull.number,
      });
  }
  return reviewDecision.resolveReviewApprovals({
    reviews,
    headSha: sha,
    headPushedAt: await reviewDecision.readHeadPushedAt({
      github,
      owner,
      repo,
      sha,
    }),
    engOwners,
    designOwners: [],
    reviewApp: app,
    authorHasWrite: appCounts,
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
  if (
    !(await heavyReviewPasses({
      github,
      owner,
      repo,
      pull,
      engOwners,
      reviewApp,
    }))
  )
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
  if (Date.now() - Date.parse(run.created_at) > RERUN_MAX_AGE_MS)
    return `${at}: run ${run.id} is from ${run.created_at}, more than ${RERUN_MAX_AGE_MS / 3_600_000} hours ago, so its merge with main is stale. Mark the pull request draft, then ready, to start a fresh run on today's main (no new head, so no new review; a fork head needs its ci:run label first); a push or a main merge also works.`;
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
