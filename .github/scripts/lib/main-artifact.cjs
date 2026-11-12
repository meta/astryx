// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file main-artifact.cjs
 * @input An Octokit client, the repository, an artifact name, and the commit
 *   it must belong to (optional: any commit on `main`)
 * @output The id of the workflow run on `main` that uploaded that artifact for
 *   that exact commit (or any commit, without one), or null; or every such
 *   artifact (mainArtifacts)
 * @position Shared by the CI jobs that read what Main keeps for a merge base
 *   (its size records), the PR report's daily CI history and the release
 *   check's weekly WebKit verdicts, so each trusts
 *   the same thing: only Main's own run on `main` for this exact commit, in this
 *   repository. A pull request's run can upload an artifact under any name.
 */

'use strict';

/**
 * Every unexpired artifact of that name that Main's own runs on `main` in this
 * repository uploaded, in the API's order (newest first).
 */
async function mainArtifacts({github, owner, repo, name}) {
  const {data} = await github.rest.actions.listArtifactsForRepo({
    owner,
    repo,
    name,
    per_page: 100,
  });
  return data.artifacts.filter(
    candidate =>
      !candidate.expired &&
      candidate.workflow_run?.head_branch === 'main' &&
      candidate.workflow_run?.head_repository_id ===
        candidate.workflow_run?.repository_id,
  );
}

async function mainArtifactRunId({github, owner, repo, name, sha}) {
  const artifact = (await mainArtifacts({github, owner, repo, name})).find(
    candidate => sha == null || candidate.workflow_run?.head_sha === sha,
  );
  return artifact ? String(artifact.workflow_run.id) : null;
}

module.exports = {mainArtifactRunId, mainArtifacts};
