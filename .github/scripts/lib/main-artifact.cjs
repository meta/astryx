// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file main-artifact.cjs
 * @input An Octokit client, the repository, an artifact name, and the commit
 *   it must belong to
 * @output The id of the workflow run on `main` that uploaded that artifact for
 *   that exact commit, or null
 * @position Shared by the CI jobs that read what Main keeps for a merge base
 *   (its package builds, its package-size measurement), so each trusts the
 *   same thing: only Main's own run on `main` for this exact commit, in this
 *   repository. A pull request's run can upload an artifact under any name.
 */

'use strict';

async function mainArtifactRunId({github, owner, repo, name, sha}) {
  const {data} = await github.rest.actions.listArtifactsForRepo({
    owner,
    repo,
    name,
    per_page: 100,
  });
  const artifact = data.artifacts.find(
    candidate =>
      !candidate.expired &&
      candidate.workflow_run?.head_branch === 'main' &&
      candidate.workflow_run?.head_sha === sha &&
      candidate.workflow_run?.head_repository_id ===
        candidate.workflow_run?.repository_id,
  );
  return artifact ? String(artifact.workflow_run.id) : null;
}

module.exports = {mainArtifactRunId};
