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
  // A cut needs both receipts (FR12, FR21), so the commit to re-cut from is
  // the newest with a passing release-check and a passing full unit run.
  for (const run of await dispatchedRuns({github, owner, repo})) {
    if (
      (await passedReleaseCheck({github, owner, repo, run})) &&
      (await findUnitRun({github, owner, repo, sha: run.head_sha}))
    ) {
      return run.head_sha;
    }
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
  // A check can only be dispatched for main's tip, so the way forward is a
  // cut from a commit that has one.
  core.setFailed(
    `No passing release-check for the cut commit ${sha}. ` +
      (await recutAdvice({github, owner, repo})),
  );
  return null;
}

async function recutAdvice({github, owner, repo}) {
  const last = await lastCheckedMain({github, owner, repo});
  return last
    ? `Re-cut the release from main's last commit with both a passing release-check and a passing full unit run, ${last}, or wait for main's next checks and cut from them.`
    : "No recent main commit has both a passing release-check and a passing full unit run; wait for main's next checks and cut from them.";
}

/**
 * Whether a run of the Main workflow (deploy.yml) is a passing full unit run:
 * the run succeeded and every unit leg ran and passed. A push run, whose unit
 * legs skip, is not one (spec:AST-030 FR21).
 */
async function passedUnitRun({github, owner, repo, run}) {
  if (run.conclusion !== 'success') return false;
  const {
    data: {jobs},
  } = await github.rest.actions.listJobsForWorkflowRun({
    owner,
    repo,
    run_id: run.id,
    per_page: 100,
  });
  const legs = prefix => jobs.filter(job => job.name.startsWith(prefix));
  return ['test-ui (', 'test-node ('].every(
    prefix =>
      legs(prefix).length > 0 &&
      legs(prefix).every(job => job.conclusion === 'success'),
  );
}

/** The passing full unit run for exactly `sha`, or null. */
export async function findUnitRun({github, owner, repo, sha}) {
  const {data} = await github.rest.actions.listWorkflowRuns({
    owner,
    repo,
    workflow_id: 'deploy.yml',
    branch: 'main',
    status: 'success',
    head_sha: sha,
    per_page: 30,
  });
  for (const run of data.workflow_runs.filter(item => item.head_sha === sha)) {
    if (await passedUnitRun({github, owner, repo, run})) return run;
  }
  return null;
}

/**
 * Fails the step unless the cut commit has a passing full unit run. Main's
 * scheduler dispatches one with every release-check, so a commit with a
 * passing release-check normally has one too.
 */
export async function requireUnitRun({github, core, owner, repo, sha}) {
  const run = await findUnitRun({github, owner, repo, sha});
  if (run) {
    core.info(`Cut commit ${sha} passed the full unit run in ${run.html_url}.`);
    return run;
  }
  core.setFailed(
    `No passing full unit run for the cut commit ${sha}. ` +
      (await recutAdvice({github, owner, repo})),
  );
  return null;
}
