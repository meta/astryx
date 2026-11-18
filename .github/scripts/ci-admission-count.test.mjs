// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The shared CI count as a command: a tool that grants CI capacity
 *   reads CI the way the admission action does (count.mjs, spec:AST-030 FR16).
 * @input count.mjs, ci.yml, and a stub `gh` that answers the API reads.
 * @output A pull request's peak from ci.yml and its labels, and the command's
 *   count, fit and failure exit.
 * @position Node contract beside ci-admission.test.mjs, which runs the same
 *   count inside the action.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterAll, describe, expect, it} from 'vitest';

import {
  CI_CEILING,
  SMALL_MOST,
  pullRequestPeak,
} from '../actions/ci-admission/count.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const COUNT = path.join(root, '.github/actions/ci-admission/count.mjs');
const workflow = fs.readFileSync(
  path.join(root, '.github/workflows/ci.yml'),
  'utf8',
);
const scratch = [];
afterAll(() => {
  for (const dir of scratch) fs.rmSync(dir, {recursive: true, force: true});
});

describe("a pull request's peak", () => {
  it("is ci.yml's pull-request peak plus the jobs its labels add", () => {
    const base = pullRequestPeak(workflow, []);
    expect(workflow).toContain(
      `peak: \${{ github.event_name == 'workflow_dispatch' && 39 || ${base} }}`,
    );
    const legs = JSON.parse(/label-legs: '([^']*)'/.exec(workflow)[1]);
    expect(pullRequestPeak(workflow, ['ci:run-visual'])).toBe(
      base + legs['ci:run-visual'],
    );
    expect(pullRequestPeak(workflow, Object.keys(legs))).toBe(
      base + Object.values(legs).reduce((total, jobs) => total + jobs, 0),
    );
    // A label that adds no suite adds no jobs.
    expect(pullRequestPeak(workflow, ['CLA Signed'])).toBe(base);
  });
});

describe('the count command', () => {
  // A stub `gh` that answers `gh api <path>` from a fixture, or fails.
  function stubGh(fixture) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-count-'));
    scratch.push(dir);
    fs.writeFileSync(path.join(dir, 'fixture.json'), JSON.stringify(fixture));
    fs.writeFileSync(
      path.join(dir, 'gh'),
      [
        `#!${process.execPath}`,
        "const fixture = require(require('path').join(__dirname, 'fixture.json'));",
        'const [, , command, route] = process.argv;',
        "if (command !== 'api' || fixture.fail) process.exit(1);",
        'const key = Object.keys(fixture).find(prefix => route.startsWith(prefix));',
        'if (key == null) process.exit(1);',
        'process.stdout.write(JSON.stringify(fixture[key]));',
        '',
      ].join('\n'),
      {mode: 0o755},
    );
    return dir;
  }
  const now = new Date().toISOString();
  const longAgo = new Date(Date.now() - 30 * 60_000).toISOString();
  // One pull-request CI run admitted half an hour ago with 20 live jobs, and
  // one small workflow's run.
  const fixture = {
    'repos/o/r/actions/runs?status=in_progress': {
      workflow_runs: [
        {
          id: 11,
          event: 'pull_request',
          path: '.github/workflows/ci.yml',
          updated_at: now,
        },
        {
          id: 12,
          event: 'pull_request',
          path: '.github/workflows/lint.yml',
          updated_at: now,
        },
      ],
    },
    'repos/o/r/actions/runs?status=queued': {workflow_runs: []},
    'repos/o/r/actions/runs/11/jobs': {
      jobs: [
        {
          name: 'admission',
          status: 'completed',
          conclusion: 'success',
          steps: [
            {
              name: 'Wait for room under the CI ceiling',
              status: 'completed',
              started_at: longAgo,
              completed_at: longAgo,
            },
          ],
        },
        ...Array.from({length: 20}, () => ({status: 'in_progress', steps: []})),
      ],
    },
    'repos/o/r/pulls/7': {labels: [{name: 'CLA Signed'}]},
  };
  const run = (args, data = fixture) =>
    spawnSync(process.execPath, [COUNT, ...args], {
      encoding: 'utf8',
      env: {...process.env, PATH: `${stubGh(data)}:${process.env.PATH}`},
    });

  it("counts CI as the admission action does, with the pull request's peak and the tool's reservations", () => {
    const result = run(['--repo', 'o/r', '--pr', '7', '--reserved', '5']);
    expect(result.status, result.stderr).toBe(0);
    const look = JSON.parse(result.stdout);
    const peak = pullRequestPeak(workflow, ['CLA Signed']);
    // 20 live jobs, small workflows at their floor, and 5 reserved.
    expect(look).toMatchObject({
      others: 20 + SMALL_MOST + 5,
      reserved: 5,
      peak,
      ceiling: CI_CEILING,
      fits: 20 + SMALL_MOST + 5 + peak <= CI_CEILING,
      mainWaiting: false,
      // Two run listings, one CI run's jobs and the pull request's labels.
      calls: 4,
    });
    // Reservations that fill CI leave no room.
    const full = JSON.parse(
      run(['--repo', 'o/r', '--pr', '7', '--reserved', '60']).stdout,
    );
    expect(full.fits).toBe(false);
    // `--peak` sets the peak instead of the pull request's labels.
    expect(JSON.parse(run(['--repo', 'o/r', '--peak', '30']).stdout).peak).toBe(
      30,
    );
  });

  it("leaves out the pull request's own run with --run, and runs through a symlinked path", () => {
    // Its own waiting run is not counted twice.
    const own = JSON.parse(
      run(['--repo', 'o/r', '--peak', '16', '--run', '11']).stdout,
    );
    expect(own.others).toBe(SMALL_MOST);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-count-link-'));
    scratch.push(dir);
    const link = path.join(dir, 'count.mjs');
    fs.symlinkSync(COUNT, link);
    const linked = spawnSync(
      process.execPath,
      [link, '--repo', 'o/r', '--peak', '16'],
      {
        encoding: 'utf8',
        env: {...process.env, PATH: `${stubGh(fixture)}:${process.env.PATH}`},
      },
    );
    expect(linked.status, linked.stderr).toBe(0);
    expect(JSON.parse(linked.stdout).others).toBe(20 + SMALL_MOST);
  });

  it('exits 2 when a lookup fails or the arguments are incomplete, which the tool reads as no room', () => {
    expect(run(['--repo', 'o/r', '--pr', '7'], {fail: true}).status).toBe(2);
    expect(run(['--repo', 'o/r']).status).toBe(2);
    expect(run(['--pr', '7']).status).toBe(2);
  });
});
