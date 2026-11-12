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
  QUEUED_CHECKS,
  SMALL_MOST,
  countLook,
  estimate,
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

describe('a queued run with no jobs (spec:AST-030 FR16)', () => {
  const NOW = Date.now();
  const at = ms => new Date(NOW - ms).toISOString();
  // A run of a small workflow, queued, as GitHub lists the backlog a stall
  // leaves: runs that have no jobs yet.
  const queued = (id, jobs = []) => ({
    run: {
      id,
      status: 'queued',
      event: 'pull_request_target',
      path: '.github/workflows/review-signal.yml',
      updated_at: at(60_000),
    },
    jobs,
  });
  async function look(entries, options = {}) {
    const jobsOf = new Map(entries.map(({run, jobs}) => [run.id, jobs]));
    let jobCalls = 0;
    const result = await countLook({
      listRuns: async status => ({
        runs: entries.map(({run}) => run).filter(run => run.status === status),
      }),
      listJobs: async id => {
        jobCalls += 1;
        return jobsOf.get(id) ?? [];
      },
      selfId: null,
      main: false,
      maxWaitMs: 12 * 60_000,
      ...options,
    });
    return {...result, jobCalls};
  }

  it('counts nothing for queued runs with no jobs, the backlog a stall leaves', async () => {
    const backlog = Array.from({length: 15}, (_, i) => queued(100 + i));
    const now = await look(backlog);
    expect(now.small).toBe(0);
    expect(now.emptyQueued).toBe(15);
    // The legacy count charges each its estimate, as before.
    const before = await look(backlog, {legacy: true});
    expect(before.small).toBe(15 * estimate(backlog[0].run));
    expect(before.jobCalls).toBe(0);
  });

  it('every wait reads the one legacy switch', () => {
    const line = "legacy: ${{ vars.CI_ADMISSION_LEGACY == 'true' }}";
    const main = fs.readFileSync(
      path.join(root, '.github/workflows/deploy.yml'),
      'utf8',
    );
    // ci.yml's room and admission, and Main's wait.
    expect(workflow.split(line).length - 1).toBe(2);
    expect(main.split(line).length - 1).toBe(1);
  });

  it('still counts a queued run that has jobs', async () => {
    const result = await look([queued(1, [{status: 'queued'}])]);
    expect(result.small).toBe(estimate(queued(1).run));
  });

  it('keeps the small-workflow floor: a backlog of empty runs never lowers it', async () => {
    const result = await look(
      Array.from({length: QUEUED_CHECKS}, (_, i) => queued(200 + i)),
    );
    expect(result.others).toBe(SMALL_MOST);
  });

  it('checks at most a set number of queued runs a look; the rest count their estimate', async () => {
    const backlog = Array.from({length: QUEUED_CHECKS + 5}, (_, i) =>
      queued(300 + i),
    );
    const result = await look(backlog);
    expect(result.jobCalls).toBe(QUEUED_CHECKS);
    expect(result.small).toBe(5 * estimate(backlog[0].run));
  });

  it('keeps the just-admitted rule: a CI run admitted under 45 s ago with no jobs yet counts its planned most', async () => {
    const run = {
      id: 7,
      status: 'queued',
      event: 'pull_request',
      path: '.github/workflows/ci.yml',
      updated_at: at(10_000),
    };
    const jobs = [
      {
        status: 'completed',
        steps: [
          {
            name: 'Wait for room under the CI ceiling',
            status: 'completed',
            started_at: at(60_000),
            completed_at: at(10_000),
          },
        ],
      },
    ];
    const result = await look([{run, jobs}]);
    expect(result.large).toBe(estimate(run));
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
