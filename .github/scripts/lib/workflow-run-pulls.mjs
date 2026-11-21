// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file workflow-run-pulls.mjs
 * @input A workflow run and a GitHub client
 * @output The pull requests that run may belong to
 * @position The one run-to-pull-request lookup, shared by pr-preview.mjs's
 *   source-run resolver and the review-pass start (heavy-turn.mjs)
 */

/**
 * The pull requests a workflow run names. A fork's run names none, so for
 * one the open pull requests from its head repository and branch stand in.
 * These are candidates only: the caller confirms the match it needs.
 * @param {{github: any, owner: string, repo: string, run: any}} input
 * @returns {Promise<any[] | null>} The candidate pull requests, or null when
 *   the run names none and carries no head owner or branch.
 */
export async function workflowRunPullCandidates({github, owner, repo, run}) {
  const numbers = [
    ...new Set(
      (run?.pull_requests ?? [])
        .map(pull => Number(pull?.number))
        .filter(number => Number.isSafeInteger(number) && number > 0),
    ),
  ];
  if (numbers.length > 0) {
    return Promise.all(
      numbers.map(async pullNumber => {
        const {data} = await github.rest.pulls.get({
          owner,
          repo,
          pull_number: pullNumber,
        });
        return data;
      }),
    );
  }
  const headOwner = run?.head_repository?.owner?.login;
  const headRef = run?.head_branch;
  if (!headOwner || !headRef) return null;
  const {data} = await github.rest.pulls.list({
    owner,
    repo,
    state: 'open',
    head: `${headOwner}:${headRef}`,
    per_page: 100,
  });
  return data;
}
