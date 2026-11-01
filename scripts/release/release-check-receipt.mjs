// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The passing canonical release-check for a release's exact cut commit.
 *
 * @input  the GitHub REST client and the cut commit from the release marker
 * @output the passing ci.yml release-check run for that commit, or a failure
 *   that names main's last commit with one (spec:AST-030 FR12, DEC-11)
 * @position read by release.yml's stable publish before anything is built
 */

/**
 * Whether a ci.yml run is a passing canonical release-check: its
 * `release-check` join succeeded. A maintenance capture, also a dispatch of
 * ci.yml on main, has no such job.
 */
async function passedReleaseCheck({github, owner, repo, run}) {
  if (run.conclusion !== 'success') return false;
  const {
    data: {jobs},
  } = await github.rest.actions.listJobsForWorkflowRun({
    owner,
    repo,
    run_id: run.id,
    per_page: 100,
  });
  return jobs.some(
    job => job.name === 'release-check' && job.conclusion === 'success',
  );
}

/** ci.yml's passing dispatched runs on main, newest first. */
async function dispatchedRuns({github, owner, repo, sha}) {
  const {data} = await github.rest.actions.listWorkflowRuns({
    owner,
    repo,
    workflow_id: 'ci.yml',
    event: 'workflow_dispatch',
    branch: 'main',
    status: 'success',
    per_page: 30,
    ...(sha ? {head_sha: sha} : {}),
  });
  return data.workflow_runs.filter(run => !sha || run.head_sha === sha);
}

/** The passing release-check run for exactly `sha`, or null. */
export async function findReleaseCheck({github, owner, repo, sha}) {
  for (const run of await dispatchedRuns({github, owner, repo, sha})) {
    if (await passedReleaseCheck({github, owner, repo, run})) return run;
  }
  return null;
}

/** The newest main commit with a passing release-check, or null. */
export async function lastCheckedMain({github, owner, repo}) {
  for (const run of await dispatchedRuns({github, owner, repo})) {
    if (await passedReleaseCheck({github, owner, repo, run}))
      return run.head_sha;
  }
  return null;
}

/**
 * Fails the step unless the cut commit has a passing release-check. The
 * failure names main's last commit with one, so the release can be re-cut
 * there.
 */
export async function requireReleaseCheck({github, core, owner, repo, sha}) {
  if (!/^[0-9a-f]{40}$/.test(sha ?? '')) {
    core.setFailed(`The release marker's cut commit is not a full SHA: ${sha}`);
    return null;
  }
  const run = await findReleaseCheck({github, owner, repo, sha});
  if (run) {
    core.info(`Cut commit ${sha} passed release-check in ${run.html_url}.`);
    return run;
  }
  const last = await lastCheckedMain({github, owner, repo});
  // A check can only be dispatched for main's tip, so the way forward is a
  // cut from a commit that has one.
  core.setFailed(
    `No passing release-check for the cut commit ${sha}. ` +
      (last
        ? `Re-cut the release from main's last commit with a passing release-check, ${last}, or wait for main's next check and cut from it.`
        : "No main commit has a passing release-check in the recent runs; wait for main's next check and cut from it."),
  );
  return null;
}
