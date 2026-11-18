// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The scheduled Node record refresh: its workflow shape, the coverage
 * check, regenerating the record from a run's logs, and the one pull request.
 * Also proves that no pull-request check fails on an unrecorded test file.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';
import {
  BRANCH,
  DRIFT_MARGIN_S,
  MIN_RECORDED_SHARE,
  TITLE,
  coverage,
  driftedEntries,
  openOrRefresh,
  prBody,
  refreshReasons,
} from './node-record-refresh.mjs';
import {MARGIN_S, RATIO, main as driftMain} from './node-time-drift.mjs';
import {nodeLegFiles} from '../../scripts/vitest-node-legs.mjs';
import {partitionByDuration} from '../../scripts/vitest-shard-sequencer.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const workflowFile = path.join(
  ROOT,
  '.github/workflows/node-record-refresh.yml',
);
const workflow = yaml.parse(fs.readFileSync(workflowFile, 'utf8'));
const job = workflow.jobs.refresh;
const step = name => job.steps.find(each => each.name === name);
const nodeFiles = nodeLegFiles();

/** One file's line in a Main run's log, from leg `(i % 6) + 1`, as `gh run view --log` prints it. */
const legLine = (file, i, seconds) =>
  `test-node (${(i % 6) + 1})\tRun pnpm test:node --shard=${(i % 6) + 1}/6\t2026-01-01T00:00:00.0000000Z  ^[[32m✓^[[39m ^[[30m^[[43m node ^[[49m^[[39m ${file} ^[[2m(^[[22m^[[2m3 tests^[[22m^[[2m)^[[22m^[[33m ${seconds}s^[[39m`;

describe('the Node record refresh workflow', () => {
  it('runs when a Main run completes, with a six-hour backstop and by hand, never on a pull request or push', () => {
    expect(Object.keys(workflow.on).sort()).toEqual([
      'schedule',
      'workflow_dispatch',
      'workflow_run',
    ]);
    expect(workflow.on.workflow_run).toEqual({
      workflows: ['Main'],
      types: ['completed'],
      branches: ['main'],
    });
    expect(workflow.on.schedule).toEqual([{cron: '41 */6 * * *'}]);
    expect(workflow.concurrency).toEqual({
      group: 'node-record-refresh',
      'cancel-in-progress': false,
    });
  });

  it("counts only a successful full unit run of this repository's main", () => {
    const condition = job.if.replace(/\s+/g, ' ');
    for (const clause of [
      "github.ref == 'refs/heads/main'",
      "github.event_name != 'workflow_run'",
      "github.event.workflow_run.conclusion == 'success'",
      "github.event.workflow_run.event == 'workflow_dispatch'",
      "github.event.workflow_run.head_branch == 'main'",
      'github.event.workflow_run.head_repository.full_name == github.repository',
    ])
      expect(condition).toContain(clause);
  });

  it("reads the completed run, else main's latest successful full unit run", () => {
    const read = step("Read the Node leg logs of main's full unit run");
    expect(read.env.COMPLETED_RUN).toBe('${{ github.event.workflow_run.id }}');
    expect(read.run).toContain('run="$COMPLETED_RUN"');
    expect(read.run).toContain(
      '--workflow deploy.yml --branch main --event workflow_dispatch --status success --limit 1',
    );
    expect(read.run).toContain('--log > "$RUNNER_TEMP/main-run.log"');
  });

  it('grants write access to its one job only, and only for contents and pull requests', () => {
    expect(workflow.permissions).toEqual({});
    expect(Object.keys(workflow.jobs)).toEqual(['refresh']);
    expect(job.permissions).toEqual({
      actions: 'read',
      contents: 'write',
      'pull-requests': 'write',
    });
  });

  it('writes the record from that run only when the check asks for a refresh', () => {
    expect(
      step("Check the record's coverage and drift against that run").run,
    ).toBe(
      'node .github/scripts/node-record-refresh.mjs check --log "$RUNNER_TEMP/main-run.log" --reasons "$RUNNER_TEMP/refresh-reasons.json" --github-output',
    );
    const regenerate = step('Regenerate the record from that run');
    expect(regenerate.if).toBe("steps.check.outputs.refresh == 'true'");
    expect(regenerate.run).toContain(
      'node scripts/vitest-shard-sequencer.mjs record "$RUNNER_TEMP/main-run.log"',
    );
  });

  it('force-pushes to the one fixed branch, never to main, as the Actions bot', () => {
    const publish = step(
      'Push the record to the refresh branch and open or refresh its pull request',
    );
    expect(publish.if).toBe("steps.record.outputs.changed == 'true'");
    const pushes = publish.run
      .split('\n')
      .filter(line => line.includes('git push'))
      .map(line => line.trim());
    expect(pushes).toEqual([
      `git push --force origin HEAD:refs/heads/${BRANCH}`,
    ]);
    expect(publish.run).toContain("user.name='github-actions[bot]'");
    // A branch that already carries the record is not pushed again.
    expect(publish.run).toMatch(
      /git fetch --quiet origin refs\/heads\/ci\/node-durations-refresh &&\s+git diff --quiet FETCH_HEAD -- scripts\/vitest-node-durations\.json; then[\s\S]*else[\s\S]*git push --force[\s\S]*fi/,
    );
    expect(publish.run).toContain('git add scripts/vitest-node-durations.json');
    expect(publish.run).toContain(
      'node .github/scripts/node-record-refresh.mjs pr',
    );
    // Only the script opens a pull request, and it reuses the open one.
    expect(fs.readFileSync(workflowFile, 'utf8')).not.toContain('gh pr create');
  });
});

describe('the coverage check', () => {
  it('keeps nine in ten as the bar', () => {
    expect(MIN_RECORDED_SHARE).toBe(0.9);
  });

  it('is fresh at exactly nine in ten, and stale below it', () => {
    const files = Array.from({length: 10}, (_, i) => `f${i}.test.mjs`);
    const nine = Object.fromEntries(files.slice(0, 9).map(file => [file, 1]));
    expect(coverage(files, nine)).toMatchObject({
      total: 10,
      recorded: 9,
      fresh: true,
      missing: ['f9.test.mjs'],
    });
    const eight = Object.fromEntries(files.slice(0, 8).map(file => [file, 1]));
    expect(coverage(files, eight)).toMatchObject({recorded: 8, fresh: false});
  });

  it('counts a file recorded at 0 s as recorded', () => {
    expect(coverage(['a.test.mjs'], {'a.test.mjs': 0}).fresh).toBe(true);
  });
});

describe('regenerating the record from a run log', () => {
  it("records the Node legs' files from a Main run log and lifts the share over the bar", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-record-refresh-'));
    try {
      const record = path.join(dir, 'durations.json');
      // A stale record: one Node file in five.
      const kept = nodeFiles.filter((_, i) => i % 5 === 0);
      fs.writeFileSync(
        record,
        JSON.stringify({
          $comment: 'kept',
          seconds: Object.fromEntries(kept.map(file => [file, 1])),
        }),
      );
      expect(
        coverage(nodeFiles, JSON.parse(fs.readFileSync(record, 'utf8')).seconds)
          .fresh,
      ).toBe(false);
      const log = [
        ...nodeFiles.map((file, i) => legLine(file, i, 2.5)),
        // The build job's own Node tests book no leg time.
        `build\tRun tests\t2026-01-01T00:00:00.0000000Z  ✓  node  ${nodeFiles[1]} (3 tests) 99.0s`,
      ].join('\n');
      const logFile = path.join(dir, 'main-run.log');
      fs.writeFileSync(logFile, log);
      execFileSync(
        process.execPath,
        ['scripts/vitest-shard-sequencer.mjs', 'record', logFile],
        {
          cwd: ROOT,
          env: {...process.env, VITEST_DURATIONS_FILE: record},
          stdio: 'pipe',
        },
      );
      const after = JSON.parse(fs.readFileSync(record, 'utf8'));
      expect(after.$comment).toBe('kept');
      expect(after.seconds[nodeFiles[1]]).toBe(2.5);
      expect(coverage(nodeFiles, after.seconds)).toMatchObject({
        fresh: true,
        missing: [],
      });
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});

describe("drift in main's run", () => {
  // Every Node file recorded at 20 s, and main's run measuring each at 20 s
  // but one: a recorded file far past its entry.
  const recorded = Object.fromEntries(nodeFiles.map(file => [file, 20]));
  const slow = nodeFiles[7];
  const runLog = seconds =>
    nodeFiles
      .map((file, i) => legLine(file, i, file === slow ? seconds : 20))
      .join('\n');
  // The pull-request rule: past RATIO × the entry and MARGIN_S over it.
  const bar = Math.max(20 * RATIO, 20 + MARGIN_S);
  const far = bar + 30;
  const near = bar - 5;

  it('uses the pull-request drift margin', () => {
    expect(DRIFT_MARGIN_S).toBe(MARGIN_S);
  });

  it('refreshes a fully recorded record when one recorded file ran far past its entry', () => {
    const reasons = refreshReasons({nodeFiles, recorded, log: runLog(far)});
    expect(reasons.coverage.fresh).toBe(true);
    expect(reasons.drifted).toEqual([
      {file: slow, recorded: 20, measured: far},
    ]);
    expect(reasons.refresh).toBe(true);
    // ...and the refresh pull request names it.
    const body = prBody({
      reasons,
      after: coverage(nodeFiles, recorded),
      runUrl: 'https://example.test/run/1',
    });
    expect(body).toContain(
      `\`${slow}\` ran ${far} s against its recorded 20 s.`,
    );
    const open = [];
    const gh = args => {
      if (args[1] === 'list') return JSON.stringify(open);
      if (args[1] === 'create') open.push({number: 1, url: 'u'});
      return 'u';
    };
    expect(openOrRefresh(gh, {title: TITLE, body}).action).toBe('created');
  });

  it('does not refresh when the slow file stays within the drift rule', () => {
    const reasons = refreshReasons({nodeFiles, recorded, log: runLog(near)});
    expect(reasons.drifted).toEqual([]);
    expect(reasons.refresh).toBe(false);
  });

  it("takes each leg's slowdown out separately", () => {
    // Leg 2 ran everything twice as slow: no file in it drifts.
    const log = nodeFiles
      .map((file, i) => legLine(file, i, i % 6 === 1 ? 40 : 20))
      .join('\n');
    expect(driftedEntries(log, recorded)).toEqual([]);
  });

  it('reads only the Node legs of the run', () => {
    const log = `${runLog(20)}\nbuild\tRun tests\t2026-01-01T00:00:00.0000000Z  ✓  node  ${slow} (3 tests) 900.0s`;
    expect(driftedEntries(log, recorded)).toEqual([]);
  });
});

describe('the one refresh pull request', () => {
  /** A fake `gh` over a list of open pull requests on BRANCH. */
  function fakeGh(open) {
    const calls = [];
    const gh = args => {
      calls.push(args);
      if (args[0] === 'pr' && args[1] === 'list') return JSON.stringify(open);
      if (args[0] === 'pr' && args[1] === 'create') {
        const url = `https://example.test/pull/${open.length + 1}`;
        open.push({number: open.length + 1, url});
        return `${url}\n`;
      }
      return '';
    };
    return {gh, calls};
  }
  const body = prBody({
    reasons: {
      coverage: {total: 10, recorded: 8, share: 0.8, fresh: false},
      drifted: [],
      refresh: true,
    },
    after: coverage(['a.test.mjs'], {'a.test.mjs': 1}),
    runUrl: 'https://example.test/run/1',
  });

  it('opens one when none is open, from the fixed branch', () => {
    const {gh, calls} = fakeGh([]);
    expect(openOrRefresh(gh, {title: TITLE, body})).toEqual({
      action: 'created',
      url: 'https://example.test/pull/1',
    });
    expect(calls[0]).toEqual(expect.arrayContaining(['--head', BRANCH]));
    expect(calls[1]).toEqual(
      expect.arrayContaining(['create', '--head', BRANCH, '--base', 'main']),
    );
  });

  it('edits the open one and never opens a second, however often it runs', () => {
    const open = [];
    const {gh, calls} = fakeGh(open);
    for (let tick = 0; tick < 3; tick++)
      openOrRefresh(gh, {title: TITLE, body});
    expect(open).toHaveLength(1);
    expect(calls.filter(args => args[1] === 'create')).toHaveLength(1);
    expect(calls.filter(args => args[1] === 'edit')).toHaveLength(2);
  });

  it('describes a durations-only change with the shares before and after', () => {
    expect(body).toContain('8 of 10 Node test files (80%), below the 90% bar');
    expect(body).toContain('1 of 1 Node test files recorded (100%)');
    expect(body).toContain('Durations only.');
    expect(body).toContain('- CI impact (for a change to workflows');
  });
});

describe('pull requests never fail on a missing or low recorded time', () => {
  it('runs every Node file in exactly one leg with no record at all', () => {
    const legs = partitionByDuration(nodeFiles, 6, {});
    expect(legs.flat().sort()).toEqual([...nodeFiles].sort());
  });

  it("passes the changed files' time check for an unrecorded slow file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-record-refresh-'));
    try {
      const times = path.join(dir, 'times.json');
      fs.writeFileSync(times, JSON.stringify({'new.test.mjs': 900}));
      const log = console.log;
      console.log = () => {};
      try {
        expect(
          driftMain(['--times', times, '--changed', 'base'], {
            diff: () => 'A\tnew.test.mjs\n',
          }),
        ).toBe(0);
      } finally {
        console.log = log;
      }
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it("passes the changed files' time check for a recorded file far past its entry", () => {
    const repoRecord = JSON.parse(
      fs.readFileSync(
        path.join(ROOT, 'scripts/vitest-node-durations.json'),
        'utf8',
      ),
    ).seconds;
    const [file, seconds] = Object.entries(repoRecord).find(
      ([, value]) => value >= 10,
    );
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-record-refresh-'));
    const log = console.log;
    const lines = [];
    console.log = line => lines.push(line);
    try {
      const times = path.join(dir, 'times.json');
      fs.writeFileSync(
        times,
        JSON.stringify({[file]: seconds * RATIO + MARGIN_S + 100}),
      );
      expect(
        driftMain(['--times', times, '--changed', 'base'], {
          diff: () => `M\t${file}\n`,
        }),
      ).toBe(0);
      expect(lines.join('\n')).toContain(
        `::notice file=${file},title=Recorded Node test time is stale::`,
      );
    } finally {
      console.log = log;
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('keeps the coverage bar off every pull-request test', () => {
    // The scheduled job is the bar's one reader.
    const readers = execFileSync(
      'git',
      [
        'grep',
        '--untracked',
        '-l',
        'MIN_RECORDED_SHARE',
        '--',
        '*.mjs',
        '*.yml',
      ],
      {cwd: ROOT, encoding: 'utf8'},
    )
      .split('\n')
      .filter(Boolean)
      .sort();
    expect(readers).toEqual([
      '.github/scripts/node-record-refresh.mjs',
      '.github/scripts/node-record-refresh.test.mjs',
    ]);
    expect(
      fs.readFileSync(
        path.join(ROOT, 'scripts/vitest-shard-sequencer.test.mjs'),
        'utf8',
      ),
    ).not.toContain('nodeLegFiles');
  });
});
