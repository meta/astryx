// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The test-inputs record in CI: Main records and keeps it, one job
 *   picks it for a pull request, the Node legs narrow their file-reading tests
 *   by it, and Main names a failed test a merged pull request left out
 *   (scripts/test-inputs, spec:AST-030 FR13, DEC-31).
 * @input ci.yml, deploy.yml, vitest.config.ts, test-inputs-pick.cjs and
 *   skipped-test-alarm.cjs with a stubbed GitHub API.
 * @output The wiring each part needs, the record a pull request picks, and the
 *   failed tests the alarm names.
 * @position Node contracts beside scripts/test-inputs/test-inputs.test.mjs.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const require = createRequire(import.meta.url);
const {
  COMMITS_PAGE,
  COMPARE_FILE_LIMIT,
  RECORD_ARTIFACT,
  pickRecord,
} = require('./lib/test-inputs-pick.cjs');
const {
  failedTests,
  mergedPullRequests,
  skippedFailures,
} = require('./lib/skipped-test-alarm.cjs');

const root = path.resolve(import.meta.dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const ci = yaml.parse(read('.github/workflows/ci.yml'));
const main = yaml.parse(read('.github/workflows/deploy.yml'));
const stepNamed = (job, name) => job.steps.find(step => step.name === name);

describe("Main's record", () => {
  it('is recorded by every full-run Node leg and merged only when they all pass', () => {
    const legs = main.jobs['test-node'];
    const run = stepNamed(
      legs,
      'Run this shard of the Node tests, recording their inputs',
    );
    expect(run.env.ASTRYX_TEST_INPUTS_DIR).toBe(
      '${{ runner.temp }}/node-test-inputs',
    );
    expect(run.run).toContain(
      '--outputFile.json="$RUNNER_TEMP/node-results.json"',
    );
    // Named reporters turn off the automatic GitHub annotations, so a failing
    // test on main still gets one only when this reporter is named.
    expect(run.run).toContain('--reporter=github-actions');
    expect(stepNamed(legs, "Keep this leg's recorded inputs").with.name).toBe(
      'node-test-inputs-leg-${{ matrix.shard }}',
    );
    expect(stepNamed(legs, "Keep this leg's results").if).toBe('always()');
    const after = main.jobs['node-test-inputs'];
    expect(after.needs).toEqual(['main-commit', 'test-node']);
    const merge = stepNamed(after, 'Merge the legs into the record');
    // The record only narrows pull requests; failing to make it leaves main
    // green.
    for (const name of [
      "Download every leg's recorded inputs",
      'Merge the legs into the record',
      'Keep the record for pull requests',
    ]) {
      expect(stepNamed(after, name)['continue-on-error'], name).toBe(true);
    }
    expect(merge.if).toBe("needs.test-node.result == 'success'");
    expect(merge.run).toContain('scripts/test-inputs/merge.mjs --out');
    // Kept only for the commit the run was dispatched on, the commit pull
    // requests find it by.
    const keep = stepNamed(after, 'Keep the record for pull requests');
    expect(keep.if).toBe(
      "needs.test-node.result == 'success' && needs.main-commit.outputs.sha == github.sha",
    );
    expect(keep.with.name).toBe(RECORD_ARTIFACT);
  });

  it('records only in a recording run', () => {
    expect(read('vitest.config.ts')).toContain(
      "...(process.env.ASTRYX_TEST_INPUTS_DIR\n              ? ['./scripts/test-inputs/setup.mjs']\n              : []),",
    );
  });

  it('raises an issue when a failed test was left out by a merged pull request', () => {
    const after = main.jobs['node-test-inputs'];
    expect(after.permissions.issues).toBe('write');
    const alarm = stepNamed(
      after,
      'Name failed tests that a merged pull request left out',
    );
    expect(alarm.if).toBe("needs.test-node.result == 'failure'");
    expect(alarm.with.script).toContain('skippedFailures');
  });
});

describe("a pull request's selection", () => {
  it('is picked once, after admission, and read by every Node leg', () => {
    const pick = ci.jobs['node-test-inputs'];
    expect(pick.needs).toEqual(['admission']);
    expect(pick.permissions).toEqual({actions: 'read', contents: 'read'});
    expect(pick.outputs.record).toBe(
      "${{ steps.upload.outcome == 'success' }}",
    );
    expect(stepNamed(pick, "Download Main's record").with.name).toBe(
      RECORD_ARTIFACT,
    );
    const legs = ci.jobs['test-node'];
    expect(legs.needs).toContain('node-test-inputs');
    const download = stepNamed(legs, 'Download the test-inputs record');
    expect(download.with.name).toBe(
      stepNamed(
        pick,
        'Keep the record and the paths changed since it for the legs',
      ).with.name,
    );
    // A leg that cannot read the record fails rather than split another list.
    expect(download['continue-on-error']).toBeUndefined();
    expect(download.if).toContain(
      "needs.node-test-inputs.outputs.record == 'true'",
    );
    const run = stepNamed(legs, 'Run this shard of the Node tests').run;
    expect(run).toContain(
      '--record-commit "$RUNNER_TEMP/node-test-inputs/commit.txt"',
    );
    expect(run).toContain(
      'if [ -f "$RUNNER_TEMP/node-test-inputs/record.json" ]; then',
    );
    expect(run).toContain(
      '--reached "$RUNNER_TEMP/reached.json" "${INPUTS[@]}"',
    );
    const keep = stepNamed(
      legs,
      'Keep the file-reading tests the record left out',
    );
    expect(keep.if).toBe(
      "matrix.shard == 1 && steps.test-inputs.outcome == 'success'",
    );
    expect(keep.with.name).toBe('node-skipped-tests');
  });

  const artifact = (sha, id) => ({
    expired: false,
    workflow_run: {
      id,
      head_sha: sha,
      head_branch: 'main',
      repository_id: 1,
      head_repository_id: 1,
    },
  });
  const github = ({artifacts, commits, compare}) => ({
    rest: {
      actions: {listArtifactsForRepo: async () => ({data: {artifacts}})},
      repos: {
        listCommits: async ({per_page}) => {
          expect(per_page).toBe(COMMITS_PAGE);
          return {data: commits.map(sha => ({sha}))};
        },
        compareCommitsWithBasehead: async ({basehead}) => compare(basehead),
      },
    },
  });

  it("takes Main's newest record of a commit the base contains, with the paths changed since", async () => {
    const picked = await pickRecord({
      github: github({
        // c3 is newer than the base; c1 is the newest the base contains.
        artifacts: [artifact('c3', 30), artifact('c1', 10), artifact('c0', 5)],
        commits: ['base', 'c2', 'c1', 'c0'],
        compare: basehead => {
          expect(basehead).toBe('c1...base');
          return {
            data: {
              status: 'ahead',
              files: [
                {filename: 'a.mjs'},
                {filename: 'b.mjs', previous_filename: 'old-b.mjs'},
              ],
            },
          };
        },
      }),
      owner: 'o',
      repo: 'r',
      base: 'base',
    });
    expect(picked).toEqual({
      runId: '10',
      commit: 'c1',
      changed: ['a.mjs', 'b.mjs', 'old-b.mjs'],
    });
  });

  it('picks none when no record is of the base, or the change since it cannot all be listed', async () => {
    const none = async options =>
      (
        await pickRecord({
          github: github(options),
          owner: 'o',
          repo: 'r',
          base: 'base',
        })
      ).none;
    expect(await none({artifacts: [], commits: [], compare: () => {}})).toMatch(
      /no test-inputs record/,
    );
    expect(
      await none({
        artifacts: [artifact('elsewhere', 1)],
        commits: ['base'],
        compare: () => {},
      }),
    ).toMatch(/latest 100 commits/);
    const many = Array.from({length: COMPARE_FILE_LIMIT}, (_, i) => ({
      filename: `f${i}`,
    }));
    expect(
      await none({
        artifacts: [artifact('c1', 1)],
        commits: ['base', 'c1'],
        compare: () => ({data: {status: 'ahead', files: many}}),
      }),
    ).toMatch(/cannot all be listed/);
  });
});

describe('the alarm', () => {
  it('reads the merged pull requests from squash-merged subjects', () => {
    expect(
      mergedPullRequests([
        'fix: a thing (#12)\n\nbody (#99)',
        'chore: no number',
        'feat: b (#7)',
      ]),
    ).toEqual([12, 7]);
  });

  it('reads failed test files from every leg', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alarm-'));
    fs.mkdirSync(path.join(dir, 'leg-1'));
    fs.writeFileSync(
      path.join(dir, 'leg-1', 'node-results.json'),
      JSON.stringify({
        testResults: [
          {name: '/w/a.test.mjs', status: 'failed'},
          {name: '/w/b.test.mjs', status: 'passed'},
        ],
      }),
    );
    expect([...failedTests(dir, '/w')]).toEqual(['a.test.mjs']);
    fs.rmSync(dir, {recursive: true, force: true});
  });

  it('names a failed test that a pull request merged since the commit the last passing run tested left out', async () => {
    const tested = 'a'.repeat(40);
    const dispatched = 'b'.repeat(40);
    const now = 'c'.repeat(40);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alarm-'));
    fs.mkdirSync(path.join(dir, 'leg-1'));
    fs.writeFileSync(
      path.join(dir, 'leg-1', 'node-results.json'),
      JSON.stringify({
        testResults: [
          {name: '/w/a.test.mjs', status: 'failed'},
          {name: '/w/b.test.mjs', status: 'failed'},
        ],
      }),
    );
    const bases = [];
    const github = {
      rest: {
        actions: {
          listWorkflowRuns: async () => ({
            data: {
              workflow_runs: [
                {
                  id: 9,
                  head_sha: now,
                  display_title: `Main validation of ${now}`,
                },
                // A run that names no commit says nothing of what it tested.
                {id: 10, head_sha: dispatched, display_title: 'Main'},
                {
                  id: 8,
                  head_sha: dispatched,
                  display_title: `Main validation of ${tested}`,
                },
              ],
            },
          }),
          listWorkflowRunsForRepo: async ({head_sha}) => ({
            data: {
              workflow_runs: [
                {id: 70, path: '.github/workflows/ci.yml', head_sha},
              ],
            },
          }),
          listWorkflowRunArtifacts: async () => ({
            data: {artifacts: [{name: 'node-skipped-tests'}]},
          }),
        },
        repos: {
          compareCommitsWithBasehead: async ({basehead}) => {
            bases.push(basehead);
            return {
              data: {commits: [{commit: {message: 'fix: one thing (#5)'}}]},
            };
          },
        },
        pulls: {get: async () => ({data: {head: {sha: 'd'.repeat(40)}}})},
      },
    };
    const previous = process.env.GITHUB_WORKSPACE;
    process.env.GITHUB_WORKSPACE = '/w';
    try {
      const found = await skippedFailures({
        github,
        owner: 'o',
        repo: 'r',
        sha: now,
        results: dir,
        runId: 9,
        download: () => ['a.test.mjs', 'c.test.mjs'],
      });
      expect(found).toEqual([{test: 'a.test.mjs', pr: 5}]);
      // The comparison starts at the commit the last passing run named as
      // tested, not the one it was dispatched on, and skips a run that names
      // none.
      expect(bases).toEqual([`${tested}...${now}`]);
    } finally {
      if (previous == null) delete process.env.GITHUB_WORKSPACE;
      else process.env.GITHUB_WORKSPACE = previous;
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});
