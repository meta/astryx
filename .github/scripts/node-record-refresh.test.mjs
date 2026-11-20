// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The scheduled Node record refresh: its workflow shape, the coverage
 * check, regenerating the record from a run's logs, and the one pull request.
 * Also proves that no pull-request check fails on an unrecorded test file.
 */

import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';
import {
  BRANCH,
  DRIFT_MARGIN_S,
  HEAVIEST_SHOWN,
  MIN_RECORDED_SHARE,
  RETIME_MIN_S,
  TITLE,
  coverage,
  driftedEntries,
  earlyWarning,
  heaviestUnrecorded,
  incompleteLegs,
  normalizedTimes,
  openOrRefresh,
  prBody,
  refreshReasons,
} from './node-record-refresh.mjs';
import {MARGIN_S, RATIO, main as driftMain} from './node-time-drift.mjs';
import {nodeLegFiles} from '../../scripts/vitest-node-legs.mjs';
import {
  partitionByDuration,
  recordDurations,
} from '../../scripts/vitest-shard-sequencer.mjs';

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

/** One file's line in a leg's own job log, as the jobs logs endpoint returns it. */
const rawLine = (file, seconds) =>
  `2026-01-01T00:00:00.0000000Z  \x1b[32m✓\x1b[39m \x1b[30m\x1b[43m node \x1b[49m\x1b[39m ${file} \x1b[2m(\x1b[22m\x1b[2m3 tests\x1b[22m\x1b[2m)\x1b[22m\x1b[33m ${seconds}s\x1b[39m`;

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
    // Each leg's complete job log, never `gh run view --log`, which stops
    // reading a job's log at its first line over 64 KiB.
    const commands = read.run
      .split('\n')
      .filter(line => !line.trim().startsWith('#'));
    expect(commands.some(line => line.includes('gh run view'))).toBe(false);
    expect(read.run).toContain('actions/runs/$run/jobs?filter=latest');
    expect(read.run).toContain(
      'gh api --allow-escape-sequences "repos/$GITHUB_REPOSITORY/actions/jobs/$job/logs"',
    );
  });

  it('runs the read step against a leg log with colour codes, as gh api serves it', () => {
    const read = step("Read the Node leg logs of main's full unit run");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-record-'));
    try {
      const files = nodeFiles.slice(0, 3);
      const legLog = [
        ...files.map(file => rawLine(file, 2)),
        `2026-01-01T00:00:00.0000000Z  \x1b[2m Test Files \x1b[22m \x1b[1m\x1b[32m${files.length} passed\x1b[39m\x1b[22m\x1b[90m (${files.length})\x1b[39m`,
      ].join('\n');
      fs.writeFileSync(path.join(dir, 'leg-fixture.log'), `${legLog}\n`);
      // A stand-in for gh that keeps its rule: `gh api` writes a response
      // with terminal escape sequences only with --allow-escape-sequences.
      const bin = path.join(dir, 'bin');
      fs.mkdirSync(bin);
      fs.writeFileSync(
        path.join(bin, 'gh'),
        [
          '#!/usr/bin/env bash',
          'case "$*" in',
          '  *"/actions/runs/"*"/jobs"*) printf \'101\\ttest-node (1)\\n\' ;;',
          '  *"/actions/jobs/101/logs"*)',
          '    case " $* " in',
          '      *" --allow-escape-sequences "*) cat "$FIXTURE" ;;',
          '      *) echo "the response contains terminal escape sequences; pass --allow-escape-sequences to output it anyway" >&2; exit 1 ;;',
          '    esac ;;',
          '  *) echo "unexpected gh call: $*" >&2; exit 2 ;;',
          'esac',
        ].join('\n'),
        {mode: 0o755},
      );
      const result = spawnSync('bash', ['-e', '-c', read.run], {
        cwd: dir,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          FIXTURE: path.join(dir, 'leg-fixture.log'),
          GITHUB_REPOSITORY: 'meta/astryx',
          GITHUB_SERVER_URL: 'https://github.com',
          GITHUB_OUTPUT: path.join(dir, 'output'),
          RUNNER_TEMP: dir,
          COMPLETED_RUN: '7',
        },
      });
      expect(result.status, result.stderr).toBe(0);
      const log = fs.readFileSync(path.join(dir, 'main-run.log'), 'utf8');
      expect(log).toContain('\x1b[');
      expect(incompleteLegs(log)).toEqual([]);
      expect(Object.keys(recordDurations(log)).sort()).toEqual(
        [...files].sort(),
      );
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it("gives every line of a leg's own log its leg's name, long lines included", () => {
    const read = step("Read the Node leg logs of main's full unit run");
    const prefix = read.run
      .split('\n')
      .find(line => line.trim().startsWith('sed '))
      .trim();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-record-'));
    try {
      const files = nodeFiles.slice(0, 4);
      const raw = [
        rawLine(files[0], 1.5),
        `2026-01-01T00:00:00.0000000Z ${'x'.repeat(65_600)}`,
        ...files.slice(1).map(file => rawLine(file, 2.5)),
        `2026-01-01T00:00:00.0000000Z  Test Files  ${files.length} passed (${files.length})`,
      ].join('\n');
      fs.writeFileSync(path.join(dir, 'leg.log'), `${raw}\n`);
      const out = execFileSync(
        'bash',
        [
          '-c',
          `name='test-node (3)'; RUNNER_TEMP=. ; ${prefix.replace('>> "$RUNNER_TEMP/main-run.log"', '')}`,
        ],
        {cwd: dir, encoding: 'utf8', maxBuffer: 1 << 24},
      );
      expect(
        out
          .split('\n')
          .filter(Boolean)
          .every(line => line.startsWith('test-node (3)\tlog\t')),
      ).toBe(true);
      expect(incompleteLegs(out)).toEqual([]);
      expect(driftedEntries(out, {}).length).toBe(0);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
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
      'node .github/scripts/node-record-refresh.mjs regenerate --log "$RUNNER_TEMP/main-run.log"',
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
  it('keeps nineteen in twenty as the bar: past one file in twenty without a time, it warns', () => {
    expect(MIN_RECORDED_SHARE).toBe(0.95);
  });

  it('is fresh at exactly nineteen in twenty, and stale below it', () => {
    const files = Array.from({length: 20}, (_, i) => `f${i}.test.mjs`);
    const timed = count =>
      Object.fromEntries(files.slice(0, count).map(file => [file, 1]));
    expect(coverage(files, timed(19))).toMatchObject({
      total: 20,
      recorded: 19,
      fresh: true,
      missing: ['f19.test.mjs'],
    });
    expect(coverage(files, timed(18))).toMatchObject({
      recorded: 18,
      fresh: false,
    });
  });

  it('counts a file recorded at 0 s as recorded', () => {
    expect(coverage(['a.test.mjs'], {'a.test.mjs': 0}).fresh).toBe(true);
  });
});

describe('regenerating the record from a run log', () => {
  it("records the Node legs' files from a Main run log, each leg's slowdown taken out, and lifts the share over the bar", () => {
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
        [
          '.github/scripts/node-record-refresh.mjs',
          'regenerate',
          '--log',
          logFile,
        ],
        {
          cwd: ROOT,
          env: {...process.env, VITEST_DURATIONS_FILE: record},
          stdio: 'pipe',
        },
      );
      const after = JSON.parse(fs.readFileSync(record, 'utf8'));
      expect(after.$comment).toBe('kept');
      // Every leg measured its recorded files at 2.5 times their 1 s entry,
      // so a new file's 2.5 s is booked at 1 s and the kept entries stay.
      expect(after.seconds[nodeFiles[1]]).toBe(1);
      expect(after.seconds[kept[0]]).toBe(1);
      expect(coverage(nodeFiles, after.seconds)).toMatchObject({
        fresh: true,
        missing: [],
      });
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});

describe('the early warning', () => {
  // Six files in a hundred have no recorded time: past the line.
  const stale = nodeFiles.slice(0, Math.ceil(nodeFiles.length * 0.06));
  const recorded = Object.fromEntries(
    nodeFiles.slice(stale.length).map(file => [file, 20]),
  );
  // The first few missing files take distinct, larger times; the build job's
  // own line for one of them books no leg time.
  const missing = stale.slice(0, HEAVIEST_SHOWN + 2);
  const log = [
    ...nodeFiles.map((file, i) =>
      legLine(file, i, missing.includes(file) ? 100 - i : 5),
    ),
    `build\tRun tests\t2026-01-01T00:00:00.0000000Z  ✓  node  ${missing[11]} (3 tests) 999.0s`,
  ].join('\n');

  it('says nothing while the record times enough files', () => {
    const files = Array.from({length: 20}, (_, i) => `f${i}.test.mjs`);
    const timed = Object.fromEntries(files.slice(0, 19).map(file => [file, 1]));
    expect(earlyWarning(coverage(files, timed))).toBe('');
  });

  it('names how many files have no time, and the heaviest of them by their time in the Node legs', () => {
    const heaviest = heaviestUnrecorded(log, stale);
    expect(heaviest).toHaveLength(HEAVIEST_SHOWN);
    expect(heaviest.map(({file}) => file)).toEqual(
      missing.slice(0, HEAVIEST_SHOWN),
    );
    expect(heaviest[0]).toEqual({file: missing[0], measured: 100});
    const files = Array.from({length: 20}, (_, i) => `f${i}.test.mjs`);
    const timed = Object.fromEntries(files.slice(0, 18).map(file => [file, 1]));
    const warning = earlyWarning(coverage(files, timed), heaviest);
    expect(warning).toContain(
      'Early warning: 2 of 20 Node test files (10%) have no recorded time, past the 5% line.',
    );
    expect(warning).toContain('nothing fails on it');
    expect(warning).toContain(`- \`${missing[0]}\`: 100 s`);
  });

  it('opens the refresh with the warning in its pull request', () => {
    const reasons = refreshReasons({nodeFiles, recorded, log});
    expect(reasons.refresh).toBe(true);
    expect(reasons.unrecorded).toHaveLength(HEAVIEST_SHOWN);
    const body = prBody({
      reasons,
      after: coverage(nodeFiles, recorded),
      runUrl: 'https://example.test/run/1',
    });
    expect(body).toContain('Early warning:');
    expect(body).toContain(`- \`${missing[0]}\`: 100 s`);
  });

  it('lists drifted files under their own heading, apart from the heaviest unrecorded files', () => {
    const reasons = {
      ...refreshReasons({nodeFiles, recorded, log}),
      drifted: [{file: 'late.test.mjs', recorded: 20, measured: 200}],
    };
    const body = prBody({
      reasons,
      after: coverage(nodeFiles, recorded),
      runUrl: 'https://example.test/run/1',
    });
    const list = body.indexOf(`- \`${missing[0]}\`: 100 s`);
    const heading = body.indexOf(
      "Recorded files that ran far past their entry in main's run:\n\n- `late.test.mjs` ran 200 s",
    );
    expect(list).toBeGreaterThan(0);
    expect(heading).toBeGreaterThan(list);
  });

  it('reads a run log longer than a call can take as arguments', () => {
    const line = `test-node (1)\tRun tests\t2026-01-01T00:00:00.0000000Z  ✓  node  ${missing[0]} (1 test) 7ms`;
    const longLog = Array.from({length: 160_000}, () => line).join('\n');
    expect(heaviestUnrecorded(longLog, [missing[0]])).toEqual([
      {file: missing[0], measured: 0},
    ]);
  });

  function warn(seconds) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-record-warn-'));
    try {
      const record = path.join(dir, 'durations.json');
      const summary = path.join(dir, 'summary.md');
      fs.writeFileSync(record, JSON.stringify({seconds}));
      fs.writeFileSync(summary, '');
      const stdout = execFileSync(
        process.execPath,
        ['.github/scripts/node-record-refresh.mjs', 'warn'],
        {
          cwd: ROOT,
          env: {
            ...process.env,
            VITEST_DURATIONS_FILE: record,
            GITHUB_STEP_SUMMARY: summary,
          },
          encoding: 'utf8',
        },
      );
      return {stdout, summary: fs.readFileSync(summary, 'utf8')};
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }

  it("warns on main's run past the line and exits 0, so it never fails", () => {
    // execFileSync throws on a non-zero exit.
    const {stdout, summary} = warn(recorded);
    expect(stdout).toContain(
      '::warning title=Node test record::Early warning:',
    );
    expect(summary).toContain('Early warning:');
  });

  it('writes nothing to the summary when the record times enough files', () => {
    const all = Object.fromEntries(nodeFiles.map(file => [file, 1]));
    const {stdout, summary} = warn(all);
    expect(stdout).toContain('times enough files');
    expect(summary).toBe('');
  });

  it('runs once per full unit run of main, in its first Node leg, and can never fail that run', () => {
    const main = yaml.parse(
      fs.readFileSync(path.join(ROOT, '.github/workflows/deploy.yml'), 'utf8'),
    );
    const warnStep = main.jobs['test-node'].steps.find(
      each => each.run === 'node .github/scripts/node-record-refresh.mjs warn',
    );
    expect(warnStep).toBeDefined();
    expect(warnStep['continue-on-error']).toBe(true);
    expect(warnStep.if).toBe('${{ always() && matrix.shard == 1 }}');
  });
});

describe('regenerating from a log with no Node leg time', () => {
  it('fails, as the recorder does, and leaves the record as it was', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-record-empty-'));
    try {
      const record = path.join(dir, 'durations.json');
      const before = JSON.stringify({$comment: 'kept', seconds: {}});
      fs.writeFileSync(record, before);
      const logFile = path.join(dir, 'main-run.log');
      fs.writeFileSync(
        logFile,
        `build\tRun tests\t2026-01-01T00:00:00.0000000Z  ✓  node  ${nodeFiles[0]} (3 tests) 9.0s`,
      );
      let failure;
      try {
        execFileSync(
          process.execPath,
          [
            '.github/scripts/node-record-refresh.mjs',
            'regenerate',
            '--log',
            logFile,
          ],
          {
            cwd: ROOT,
            env: {...process.env, VITEST_DURATIONS_FILE: record},
            stdio: 'pipe',
          },
        );
      } catch (error) {
        failure = error;
      }
      expect(failure?.status).toBe(1);
      expect(String(failure?.stderr)).toContain(
        'No Node test file times found in that log.',
      );
      expect(fs.readFileSync(record, 'utf8')).toBe(before);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});

describe("each leg's slowdown taken out of the regenerated times", () => {
  // Leg 1 holds files 0, 6, 12, …; leg 2 holds files 1, 7, 13, ….
  const inLeg = leg => nodeFiles.filter((_, i) => i % 6 === leg - 1);
  const recorded = Object.fromEntries(nodeFiles.map(file => [file, 20]));
  const logOf = time =>
    nodeFiles.map((file, i) => legLine(file, i, time(file, i))).join('\n');

  it('books a slow leg at its own pace, and keeps entries that only ran slow with it', () => {
    const [first, second] = inLeg(2);
    const unrecorded = {...recorded};
    delete unrecorded[first];
    // Leg 2 ran everything twice as slow; the unrecorded file took 40 s there.
    const log = logOf((file, i) => (i % 6 === 1 ? 40 : 20));
    const {seconds, legs} = normalizedTimes(log, unrecorded);
    expect(seconds).toEqual({[first]: 20});
    expect(legs.find(({factor}) => factor > 1)?.factor).toBe(2);
    expect(seconds[second]).toBeUndefined();
  });

  it('re-times a file that is RATIO times off its entry either way, never a small move', () => {
    const [up, down, small] = inLeg(1);
    const log = logOf(file =>
      file === up ? 20 * RATIO + 1 : file === down ? 20 / RATIO - 1 : 20,
    );
    expect(normalizedTimes(log, recorded).seconds).toEqual({
      [up]: 20 * RATIO + 1,
      [down]: Math.round((20 / RATIO - 1) * 10) / 10,
    });
    // A file recorded at 2 s that ran 6 s is three times off but under
    // RETIME_MIN_S away, so it keeps its entry.
    const tiny = {...recorded, [small]: 2};
    const tinyLog = logOf(file => (file === small ? 2 + RETIME_MIN_S - 1 : 20));
    expect(normalizedTimes(tinyLog, tiny).seconds).toEqual({});
  });

  it('takes a lower time from a slow leg only after its slowdown is taken out', () => {
    const [heavy] = inLeg(3);
    // Leg 3 ran twice as slow, but its heavy file measured only 30 s against
    // a 40 s entry: at that leg's pace it took 15 s.
    const withHeavy = {...recorded, [heavy]: 40};
    const log = logOf((file, i) =>
      file === heavy ? 30 : i % 6 === 2 ? 40 : 20,
    );
    expect(normalizedTimes(log, withHeavy).seconds).toEqual({[heavy]: 15});
  });

  it("never divides by less than 1, so a fast leg's times are taken as measured", () => {
    const log = logOf((file, i) => (i % 6 === 3 ? 10 : 20));
    const fast = normalizedTimes(log, recorded);
    // Leg 4 ran at half its entries. Its factor stays 1, so each file there
    // is booked at the 10 s it took: RATIO times under and 10 s away.
    expect(fast.legs.every(({factor}) => factor >= 1)).toBe(true);
    expect(Object.values(fast.seconds).every(time => time === 10)).toBe(true);
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
    expect(body).toContain('8 of 10 Node test files (80%), below the 95% bar');
    expect(body).toContain('Early warning: 2 of 10 Node test files (20%)');
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

describe("a leg's log that misses test files", () => {
  const files = nodeFiles.slice(0, 5);
  const leg = (name, timed, counted) =>
    [
      ...files.slice(0, timed).map(file => `${name}\tlog\t${rawLine(file, 2)}`),
      ...(counted == null
        ? []
        : [
            `${name}\tlog\t2026-01-01T00:00:00.0000000Z  Test Files  ${counted - 1} passed | 1 skipped (${counted})`,
          ]),
    ].join('\n');

  it('passes a leg that times every file its summary counts', () => {
    expect(incompleteLegs(leg('test-node (1)', 5, 5))).toEqual([]);
  });

  it('names a leg that read fewer files than its summary, or has no summary', () => {
    const log = [
      leg('test-node (1)', 5, 5),
      leg('test-node (2)', 3, 5),
      leg('test-node (10)', 2, null),
    ].join('\n');
    expect(incompleteLegs(log)).toEqual([
      {job: 'test-node (2)', read: 3, counted: 5},
      {job: 'test-node (10)', read: 2, counted: null},
    ]);
  });

  it('counts skipped and todo files as the summary does', () => {
    const name = 'test-node (5)';
    const log = [
      `${name}\tlog\t${rawLine(files[0], 2)}`,
      `${name}\tlog\t2026-01-01T00:00:00.0000000Z  \x1b[33m↓\x1b[39m \x1b[30m\x1b[43m node \x1b[49m\x1b[39m ${files[1]} \x1b[2m(\x1b[22m\x1b[2m3 tests\x1b[22m\x1b[2m | \x1b[22m\x1b[33m3 skipped\x1b[39m\x1b[2m)\x1b[22m`,
      `${name}\tlog\t2026-01-01T00:00:00.0000000Z  \x1b[33m↓\x1b[39m \x1b[30m\x1b[43m node \x1b[49m\x1b[39m ${files[2]} \x1b[2m(\x1b[22m\x1b[2m1 test\x1b[22m\x1b[2m | \x1b[22m\x1b[35m1 todo\x1b[39m\x1b[2m)\x1b[22m`,
      `${name}\tlog\t2026-01-01T00:00:00.0000000Z  Test Files  1 passed | 2 skipped (3)`,
    ].join('\n');
    expect(incompleteLegs(log)).toEqual([]);
  });

  it('fails the check and writes no reasons, so no record is written', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-record-'));
    try {
      const logFile = path.join(dir, 'main-run.log');
      const reasonsFile = path.join(dir, 'reasons.json');
      fs.writeFileSync(logFile, leg('test-node (4)', 3, 5));
      let status = 0;
      let stderr = '';
      try {
        execFileSync(
          process.execPath,
          [
            '.github/scripts/node-record-refresh.mjs',
            'check',
            '--log',
            logFile,
            '--reasons',
            reasonsFile,
          ],
          {cwd: ROOT, stdio: 'pipe', encoding: 'utf8'},
        );
      } catch (error) {
        status = error.status;
        stderr = String(error.stderr);
      }
      expect(status).toBe(1);
      expect(stderr).toContain('test-node (4): 3 files read, 5 counted');
      // A log with no Node leg lines at all fails too.
      fs.writeFileSync(logFile, '');
      try {
        execFileSync(
          process.execPath,
          [
            '.github/scripts/node-record-refresh.mjs',
            'check',
            '--log',
            logFile,
            '--reasons',
            reasonsFile,
          ],
          {cwd: ROOT, stdio: 'pipe', encoding: 'utf8'},
        );
        status = 0;
      } catch (error) {
        status = error.status;
        stderr = String(error.stderr);
      }
      expect(status).toBe(1);
      expect(stderr).toContain('no Node leg lines');
      expect(fs.existsSync(reasonsFile)).toBe(false);
      // A leg that crashed before its summary fails too, by name.
      fs.writeFileSync(logFile, leg('test-node (6)', 4, null));
      try {
        execFileSync(
          process.execPath,
          [
            '.github/scripts/node-record-refresh.mjs',
            'check',
            '--log',
            logFile,
            '--reasons',
            reasonsFile,
          ],
          {cwd: ROOT, stdio: 'pipe', encoding: 'utf8'},
        );
        status = 0;
      } catch (error) {
        status = error.status;
        stderr = String(error.stderr);
      }
      expect(status).toBe(1);
      expect(stderr).toContain(
        'test-node (6): 4 files read, no Test Files summary',
      );
      expect(fs.existsSync(reasonsFile)).toBe(false);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});
