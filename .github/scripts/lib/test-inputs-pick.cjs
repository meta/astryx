// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file test-inputs-pick.cjs
 * @input An Octokit client, the repository, and a pull request's merge base
 * @output Main's newest test-inputs record whose commit the merge base
 *   contains, with every path changed between that commit and the base; or
 *   why there is none
 * @position ci.yml's node-test-inputs job picks the one record all of a pull
 *   request's Node legs narrow their file-reading tests with
 *   (scripts/test-inputs, spec:AST-030 FR13). With no record the legs run
 *   every file-reading test.
 */

'use strict';

const {mainArtifacts} = require('./main-artifact.cjs');

/** The artifact Main's full unit run keeps its record in. */
const RECORD_ARTIFACT = 'node-test-inputs';
/** The compare API lists at most this many changed files. */
const COMPARE_FILE_LIMIT = 300;
/** The most commits one page of the commits API lists. */
const COMMITS_PAGE = 100;

/**
 * @returns {Promise<{runId: string, commit: string, changed: string[]} | {none: string}>}
 */
async function pickRecord({github, owner, repo, base}) {
  const records = await mainArtifacts({
    github,
    owner,
    repo,
    name: RECORD_ARTIFACT,
  });
  if (records.length === 0) return {none: 'Main keeps no test-inputs record'};
  // A record describes the code of its own commit, so only a commit the base
  // contains can stand for it: the newest such among the base's latest
  // commits. Records come newest first.
  const {data: commits} = await github.rest.repos.listCommits({
    owner,
    repo,
    sha: base,
    per_page: COMMITS_PAGE,
  });
  const behind = new Map(commits.map((commit, index) => [commit.sha, index]));
  const artifact = records.find(candidate =>
    behind.has(candidate.workflow_run.head_sha),
  );
  if (artifact == null) {
    return {
      none: `no test-inputs record is of the base's latest ${COMMITS_PAGE} commits`,
    };
  }
  const commit = artifact.workflow_run.head_sha;
  if (commit === base)
    return {runId: String(artifact.workflow_run.id), commit, changed: []};
  const {data} = await github.rest.repos.compareCommitsWithBasehead({
    owner,
    repo,
    basehead: `${commit}...${base}`,
  });
  const files = data.files ?? [];
  if (data.status !== 'ahead' || files.length >= COMPARE_FILE_LIMIT) {
    return {
      none: `the paths changed since the record of ${commit.slice(0, 12)} cannot all be listed`,
    };
  }
  const changed = new Set();
  for (const file of files) {
    changed.add(file.filename);
    if (file.previous_filename) changed.add(file.previous_filename);
  }
  return {
    runId: String(artifact.workflow_run.id),
    commit,
    changed: [...changed].sort(),
  };
}

module.exports = {
  COMMITS_PAGE,
  COMPARE_FILE_LIMIT,
  RECORD_ARTIFACT,
  pickRecord,
};
