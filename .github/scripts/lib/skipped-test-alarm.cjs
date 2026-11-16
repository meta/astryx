// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file skipped-test-alarm.cjs
 * @input An Octokit client, the repository, the commit Main's full unit run
 *   tested, the folder of its Node legs' JSON results, and a `gh` on PATH
 *   with a token
 * @output Each failed Node test file that a pull request merged since the
 *   last passing full run left out by its recorded inputs, with that pull
 *   request's number
 * @position deploy.yml's skipped-test-alarm job runs it when a Node leg
 *   fails, so a test the record wrongly left out shows within the hour
 *   (scripts/test-inputs, spec:AST-030 FR13).
 */

'use strict';

const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** Every failed test file in Vitest JSON results under `dir`, as repository paths. */
function failedTests(dir, root) {
  const failed = new Set();
  const walk = folder => {
    for (const entry of fs.readdirSync(folder, {withFileTypes: true})) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) {
        const results = JSON.parse(fs.readFileSync(full, 'utf8'));
        for (const file of results.testResults ?? []) {
          if (file.status === 'failed') {
            failed.add(
              path.relative(root, file.name).split(path.sep).join('/'),
            );
          }
        }
      }
    }
  };
  walk(dir);
  return failed;
}

/** The pull request numbers squash-merged commits name: `subject (#123)`. */
function mergedPullRequests(messages) {
  const numbers = new Set();
  for (const message of messages) {
    const match = /\(#(\d+)\)\s*$/.exec(message.split('\n')[0]);
    if (match) numbers.add(Number(match[1]));
  }
  return [...numbers];
}

async function skippedFailures({github, owner, repo, sha, results, runId}) {
  const failed = failedTests(
    results,
    process.env.GITHUB_WORKSPACE ?? process.cwd(),
  );
  if (failed.size === 0) return [];
  // The last full unit run that passed, of another commit.
  const {data: runs} = await github.rest.actions.listWorkflowRuns({
    owner,
    repo,
    workflow_id: 'deploy.yml',
    event: 'workflow_dispatch',
    branch: 'main',
    status: 'success',
    per_page: 20,
  });
  const previous = runs.workflow_runs.find(
    run => run.head_sha !== sha && run.id !== runId,
  );
  if (previous == null) return [];
  const {data: comparison} = await github.rest.repos.compareCommitsWithBasehead(
    {
      owner,
      repo,
      basehead: `${previous.head_sha}...${sha}`,
    },
  );
  const found = [];
  for (const pr of mergedPullRequests(
    comparison.commits.map(commit => commit.commit.message),
  )) {
    const {data: pull} = await github.rest.pulls.get({
      owner,
      repo,
      pull_number: pr,
    });
    const {data: prRuns} = await github.rest.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      event: 'pull_request',
      head_sha: pull.head.sha,
      per_page: 20,
    });
    const run = prRuns.workflow_runs.find(
      candidate => candidate.path === '.github/workflows/ci.yml',
    );
    if (run == null) continue;
    const {data: artifacts} =
      await github.rest.actions.listWorkflowRunArtifacts({
        owner,
        repo,
        run_id: run.id,
        name: 'node-skipped-tests',
      });
    if (artifacts.artifacts.length === 0) continue;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `skipped-${pr}-`));
    execFileSync('gh', [
      'run',
      'download',
      String(run.id),
      '--repo',
      `${owner}/${repo}`,
      '--name',
      'node-skipped-tests',
      '--dir',
      dir,
    ]);
    const skipped = fs
      .readFileSync(path.join(dir, 'node-skipped-tests.txt'), 'utf8')
      .split('\n')
      .filter(Boolean);
    for (const test of skipped) if (failed.has(test)) found.push({test, pr});
  }
  return found;
}

module.exports = {failedTests, mergedPullRequests, skippedFailures};
