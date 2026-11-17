// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The nightly perf trend's threshold, baseline window and history
 * (.github/scripts/perf-trend.mjs).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

import {
  HISTORY_LIMIT,
  METRICS,
  MIN_BASELINE_RUNS,
  appendRun,
  baselineMedians,
  evaluateRun,
  findNoBaseline,
  findRegressions,
  isRecordable,
  isRegression,
  lastGoodRun,
  median,
  readResults,
  readRunner,
  renderSummary,
  runReport,
} from './perf-trend.mjs';

const NOW = '2026-11-08T09:30:00.000Z';
const daysBefore = days =>
  new Date(Date.parse(NOW) - days * 24 * 60 * 60 * 1000).toISOString();

const SCENE = {
  mountLongTaskMs: 100,
  mountLayouts: 10,
  interactionLayouts: 10,
  interactionMs: 80,
  heapDeltaKb: 1000,
  listenerDelta: 0,
};

const CPU_A = 'AMD EPYC 7763 64-Core Processor';
const CPU_B = 'Intel(R) Xeon(R) Platinum 8370C CPU @ 2.80GHz';
const RUNNER_A = {cpu: CPU_A, calibrationMs: 40};
const RUNNER_B = {cpu: CPU_B, calibrationMs: 75};

function run(days, scenes = {table: SCENE}, extra = {}) {
  return {
    sha: `sha-${days}`,
    runId: days,
    date: daysBefore(days),
    good: true,
    runner: RUNNER_A,
    scenes,
    ...extra,
  };
}

const NIGHTLY = {
  sha: 'sha-now',
  runId: 99,
  runUrl: 'https://example.test/run/99',
  event: 'schedule',
  ref: 'refs/heads/main',
  repository: 'meta/astryx',
  date: NOW,
};

describe('median', () => {
  it('takes the middle value, or the mean of the middle two', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('isRegression', () => {
  it('needs more than 10% worse than the median', () => {
    expect(isRegression('mountLongTaskMs', 330, 300)).toBe(false);
    expect(isRegression('mountLongTaskMs', 331, 300)).toBe(true);
  });

  it('needs at least the metric floor of absolute worsening', () => {
    // +50% but only 1 ms: noise on a near-zero value.
    expect(isRegression('mountLongTaskMs', 3, 2)).toBe(false);
    expect(isRegression('mountLongTaskMs', 22, 2)).toBe(true);
    expect(isRegression('mountLayouts', 3, 2)).toBe(false);
    expect(isRegression('mountLayouts', 4, 2)).toBe(true);
    expect(isRegression('heapDeltaKb', 1255, 1000)).toBe(false);
    expect(isRegression('heapDeltaKb', 1256, 1000)).toBe(true);
    expect(isRegression('listenerDelta', 4, 0)).toBe(false);
    expect(isRegression('listenerDelta', 5, 0)).toBe(true);
  });

  it('never flags an improvement', () => {
    for (const metric of Object.keys(METRICS)) {
      expect(isRegression(metric, 0, 1000), metric).toBe(false);
    }
  });
});

describe('baselineMedians', () => {
  it('reads only runs in the 7 days before the run', () => {
    const history = {
      version: 1,
      runs: [
        run(8, {table: {...SCENE, mountLayouts: 1000}}),
        run(6, {table: {...SCENE, mountLayouts: 10}}),
        run(3, {table: {...SCENE, mountLayouts: 12}}),
        run(1, {table: {...SCENE, mountLayouts: 14}}),
        // A run recorded at or after this one's time is not its baseline.
        {...run(0, {table: {...SCENE, mountLayouts: 2000}}), date: NOW},
      ],
    };
    expect(baselineMedians(history, NOW).table.mountLayouts).toEqual({
      median: 12,
      runs: 3,
    });
  });
});

describe('findRegressions', () => {
  const baseline = runs => ({
    table: Object.fromEntries(
      Object.entries(SCENE).map(([metric, value]) => [
        metric,
        {median: value, runs},
      ]),
    ),
  });

  it('names each metric past threshold and floor', () => {
    const regressions = findRegressions(
      {table: {...SCENE, mountLayouts: 20, interactionMs: 85}},
      baseline(MIN_BASELINE_RUNS),
    );
    expect(regressions).toEqual([
      {
        scene: 'table',
        metric: 'mountLayouts',
        value: 20,
        median: 10,
        change: 1,
      },
    ]);
  });

  it(`waits for ${MIN_BASELINE_RUNS} runs in the window`, () => {
    expect(
      findRegressions(
        {table: {...SCENE, mountLayouts: 20}},
        baseline(MIN_BASELINE_RUNS - 1),
      ),
    ).toEqual([]);
  });

  it('skips a scene with no baseline (a new scene)', () => {
    expect(
      findRegressions({markdown: SCENE}, baseline(MIN_BASELINE_RUNS)),
    ).toEqual([]);
  });

  it('reports a regression from a zero median without a ratio', () => {
    const [regression] = findRegressions(
      {table: {...SCENE, listenerDelta: 12}},
      baseline(MIN_BASELINE_RUNS),
    );
    expect(regression).toMatchObject({metric: 'listenerDelta', change: null});
  });
});

describe('isRecordable', () => {
  it('records nightly and dispatched runs on main of this repository only', () => {
    expect(isRecordable(NIGHTLY)).toBe(true);
    expect(isRecordable({...NIGHTLY, event: 'workflow_dispatch'})).toBe(true);
    expect(isRecordable({...NIGHTLY, event: 'pull_request'})).toBe(false);
    expect(isRecordable({...NIGHTLY, event: 'push'})).toBe(false);
    expect(isRecordable({...NIGHTLY, ref: 'refs/heads/feature'})).toBe(false);
    expect(isRecordable({...NIGHTLY, repository: 'someone/astryx'})).toBe(
      false,
    );
  });
});

describe('history', () => {
  it('finds the newest good run', () => {
    const history = {
      version: 1,
      runs: [run(3), run(2), run(1, undefined, {good: false})],
    };
    expect(lastGoodRun(history).sha).toBe('sha-2');
    expect(lastGoodRun({version: 1, runs: []})).toBeNull();
  });

  it(`keeps the newest ${HISTORY_LIMIT} runs`, () => {
    let history = {version: 1, runs: []};
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      history = appendRun(history, {...run(1), sha: `sha-${i}`});
    }
    expect(history.runs).toHaveLength(HISTORY_LIMIT);
    expect(history.runs.at(-1).sha).toBe(`sha-${HISTORY_LIMIT + 4}`);
    expect(history.runs[0].sha).toBe('sha-5');
  });
});

describe('evaluateRun', () => {
  // The newest recorded run was already over the threshold on Table's mount.
  const history = {
    version: 1,
    runs: [
      run(4),
      run(3),
      run(2),
      run(1, undefined, {
        good: false,
        overThreshold: ['table/mountLongTaskMs'],
      }),
    ],
  };
  const firstTime = {
    version: 1,
    runs: [run(4), run(3), run(2), run(1)],
  };

  it('confirms a metric over the threshold on two recorded runs in a row, with the commits since the last good run', () => {
    const {report, nextHistory} = evaluateRun({
      scenes: {table: {...SCENE, mountLongTaskMs: 200}},
      history,
      run: NIGHTLY,
      runner: RUNNER_A,
    });
    expect(report.regressions.map(r => r.metric)).toEqual(['mountLongTaskMs']);
    expect(report.pending).toEqual([]);
    expect(report.range).toEqual({from: 'sha-2', to: 'sha-now'});
    expect(report.recorded).toBe(true);
    expect(nextHistory.runs.at(-1)).toMatchObject({
      sha: 'sha-now',
      good: false,
      overThreshold: ['table/mountLongTaskMs'],
    });
  });

  it('holds a metric over the threshold for the first time as pending, and records it', () => {
    const {report, nextHistory} = evaluateRun({
      scenes: {table: {...SCENE, mountLongTaskMs: 200}},
      history: firstTime,
      run: NIGHTLY,
      runner: RUNNER_A,
    });
    expect(report.regressions).toEqual([]);
    expect(report.pending.map(r => r.metric)).toEqual(['mountLongTaskMs']);
    expect(report.range).toBeNull();
    expect(nextHistory.runs.at(-1)).toMatchObject({
      good: false,
      overThreshold: ['table/mountLongTaskMs'],
    });
  });

  it('does not confirm a different metric than the previous run had over', () => {
    const {report} = evaluateRun({
      scenes: {table: {...SCENE, mountLayouts: 20}},
      history,
      run: NIGHTLY,
      runner: RUNNER_A,
    });
    expect(report.regressions).toEqual([]);
    expect(report.pending.map(r => r.metric)).toEqual(['mountLayouts']);
  });

  it('reads a run recorded before confirmation as having nothing over', () => {
    const {report} = evaluateRun({
      scenes: {table: {...SCENE, mountLongTaskMs: 200}},
      history: firstTime,
      run: NIGHTLY,
      runner: RUNNER_A,
    });
    expect(report.regressions).toEqual([]);
  });

  it('records a clean run as good, with no range', () => {
    const {report, nextHistory} = evaluateRun({
      scenes: {table: SCENE},
      history,
      run: NIGHTLY,
      runner: RUNNER_A,
    });
    expect(report.regressions).toEqual([]);
    expect(report.pending).toEqual([]);
    expect(report.range).toBeNull();
    expect(nextHistory.runs.at(-1)).toMatchObject({
      good: true,
      overThreshold: [],
    });
  });

  it('compares a pull request run without recording it', () => {
    const {report, nextHistory} = evaluateRun({
      scenes: {table: {...SCENE, mountLongTaskMs: 200}},
      history,
      run: {...NIGHTLY, event: 'pull_request', ref: 'refs/pull/1/merge'},
      runner: RUNNER_A,
    });
    expect(report.regressions).toHaveLength(1);
    expect(report.recorded).toBe(false);
    expect(nextHistory).toBe(history);
  });
});

describe('timing metrics on different CPU models', () => {
  // Five nights on CPU A, then the previous night on CPU B, where the same
  // commit's timing metrics are about 75% higher.
  const slow = {...SCENE, mountLongTaskMs: 175, interactionMs: 140};
  const crossCpu = {
    version: 1,
    runs: [
      run(6),
      run(5),
      run(4),
      run(3),
      run(2),
      run(
        1,
        {table: slow},
        {
          runner: RUNNER_B,
          good: false,
          noBaseline: ['table/mountLongTaskMs', 'table/interactionMs'],
        },
      ),
    ],
  };

  it('does not call a slower CPU model a regression, and reports no baseline instead', () => {
    const {report, nextHistory} = evaluateRun({
      scenes: {table: slow},
      history: crossCpu,
      run: NIGHTLY,
      runner: RUNNER_B,
    });
    expect(report.regressions).toEqual([]);
    expect(report.pending).toEqual([]);
    expect(report.noBaseline).toEqual([
      {scene: 'table', metric: 'mountLongTaskMs', runs: 1},
      {scene: 'table', metric: 'interactionMs', runs: 1},
    ]);
    // Never a silent pass: the run records which metrics had no baseline.
    expect(nextHistory.runs.at(-1)).toMatchObject({
      good: true,
      runner: RUNNER_B,
      noBaseline: ['table/mountLongTaskMs', 'table/interactionMs'],
    });
  });

  it('still finds a timing regression on the same CPU model', () => {
    const history = {
      version: 1,
      runs: [
        run(4, {table: slow}, {runner: RUNNER_B}),
        run(3, {table: slow}, {runner: RUNNER_B}),
        run(2, {table: slow}, {runner: RUNNER_B}),
        run(
          1,
          {table: {...slow, mountLongTaskMs: 260}},
          {
            runner: RUNNER_B,
            good: false,
            overThreshold: ['table/mountLongTaskMs'],
          },
        ),
      ],
    };
    const {report} = evaluateRun({
      scenes: {table: {...slow, mountLongTaskMs: 260}},
      history,
      run: NIGHTLY,
      runner: RUNNER_B,
    });
    expect(report.regressions.map(r => r.metric)).toEqual(['mountLongTaskMs']);
    expect(report.noBaseline).toEqual([]);
  });

  it('compares count metrics with every CPU model', () => {
    const {report} = evaluateRun({
      scenes: {table: {...slow, interactionLayouts: 20}},
      history: crossCpu,
      run: NIGHTLY,
      runner: RUNNER_B,
    });
    expect(report.pending.map(r => r.metric)).toEqual(['interactionLayouts']);
  });

  it('gives a first run on a CPU model no baseline for its timing metrics', () => {
    const {report, nextHistory} = evaluateRun({
      scenes: {table: SCENE},
      history: {version: 1, runs: []},
      run: NIGHTLY,
      runner: RUNNER_A,
    });
    expect(report.noBaseline.map(r => r.metric)).toEqual([
      'mountLongTaskMs',
      'interactionMs',
    ]);
    expect(nextHistory.runs.at(-1).noBaseline).toEqual([
      'table/mountLongTaskMs',
      'table/interactionMs',
    ]);
  });

  it('gives a run with no CPU model no timing baseline', () => {
    expect(
      findNoBaseline(
        {table: SCENE},
        baselineMedians({version: 1, runs: [run(3), run(2), run(1)]}, NOW),
      ).map(r => r.metric),
    ).toEqual(['mountLongTaskMs', 'interactionMs']);
  });

  it('counts only same-CPU runs in a timing baseline, and every run in a count baseline', () => {
    const baseline = baselineMedians(crossCpu, NOW, CPU_A);
    expect(baseline.table.mountLongTaskMs).toEqual({median: 100, runs: 5});
    expect(baseline.table.mountLayouts).toEqual({median: 10, runs: 6});
  });

  it('lists the metrics with no baseline in the summary', () => {
    const summary = renderSummary({
      scenes: {table: slow},
      baseline: baselineMedians(crossCpu, NOW, CPU_B),
      regressions: [],
      noBaseline: [{scene: 'table', metric: 'mountLongTaskMs', runs: 1}],
      runner: RUNNER_B,
    });
    expect(summary).toContain(`no baseline on ${CPU_B}`);
    expect(summary).toContain('175 ms (no baseline)');
    expect(summary).toContain(`Runner: ${CPU_B}, calibration 75 ms`);
  });
});

describe('readRunner', () => {
  it('reads the runner file, and skips it among the scene results', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-trend-'));
    fs.writeFileSync(path.join(dir, 'runner.json'), JSON.stringify(RUNNER_B));
    fs.writeFileSync(
      path.join(dir, 'table.json'),
      JSON.stringify({scene: 'table', samples: [SCENE], median: SCENE}),
    );
    expect(readRunner(dir)).toEqual(RUNNER_B);
    expect(Object.keys(readResults(dir))).toEqual(['table']);
    fs.rmSync(dir, {recursive: true, force: true});
  });

  it('reads no CPU model when the driver wrote no runner file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-trend-'));
    expect(readRunner(dir)).toEqual({cpu: null, calibrationMs: null});
    fs.rmSync(dir, {recursive: true, force: true});
  });
});

describe('runReport', () => {
  it('reads the driver results, starts a history when none exists, and writes the report', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-trend-'));
    const results = path.join(dir, 'results');
    fs.mkdirSync(results);
    fs.writeFileSync(
      path.join(results, 'table.json'),
      JSON.stringify({scene: 'table', samples: [SCENE], median: SCENE}),
    );
    fs.writeFileSync(
      path.join(results, 'runner.json'),
      JSON.stringify(RUNNER_A),
    );
    const out = path.join(dir, 'out');
    const {report, summary, earlierRuns} = runReport({
      resultsDir: results,
      historyFile: path.join(dir, 'missing.json'),
      outDir: out,
      run: NIGHTLY,
    });
    expect(earlierRuns).toBe(0);
    expect(report.recorded).toBe(true);
    expect(summary).toContain('| table |');
    const written = JSON.parse(
      fs.readFileSync(path.join(out, 'perf-history.json'), 'utf8'),
    );
    expect(written.runs).toHaveLength(1);
    // runner.json reaches the history and the summary.
    expect(written.runs[0].runner).toEqual(RUNNER_A);
    expect(summary).toContain(`Runner: ${CPU_A}`);
    expect(fs.existsSync(path.join(out, 'report.json'))).toBe(true);
    fs.rmSync(dir, {recursive: true, force: true});
  });

  it('refuses an empty results directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-trend-'));
    expect(() => readResults(dir)).toThrow(/no perf scene results/);
    fs.rmSync(dir, {recursive: true, force: true});
  });
});

describe('renderSummary', () => {
  it('marks every metric over the threshold alike on a run that is not recorded', () => {
    const summary = renderSummary({
      scenes: {table: {...SCENE, mountLayouts: 20, interactionMs: 200}},
      baseline: {
        table: {
          mountLayouts: {median: 10, runs: 5},
          interactionMs: {median: 80, runs: 5},
        },
      },
      regressions: [{scene: 'table', metric: 'mountLayouts'}],
      pending: [{scene: 'table', metric: 'interactionMs'}],
      range: null,
      recorded: false,
    });
    expect(summary).toContain('**2 metric(s) are more than 10% worse**');
    expect(summary).toContain('This run is not recorded.');
    expect(summary).toContain('20 (7d 10) ⚠️');
    expect(summary).toContain('200 ms (7d 80 ms) ⚠️');
    expect(summary).not.toContain('⏳');
    expect(summary).not.toContain('next recorded run');
  });

  it('marks a metric over the threshold for the first time as pending', () => {
    const summary = renderSummary({
      scenes: {table: {...SCENE, mountLayouts: 20}},
      baseline: {table: {mountLayouts: {median: 10, runs: 5}}},
      regressions: [],
      pending: [{scene: 'table', metric: 'mountLayouts'}],
      range: null,
    });
    expect(summary).toContain('20 (7d 10) ⏳');
    expect(summary).toContain(
      '1 metric(s) are over the threshold for the first time',
    );
  });

  it('marks a regressed metric and shows its 7-day median', () => {
    const summary = renderSummary({
      scenes: {table: {...SCENE, mountLayouts: 20}},
      baseline: {table: {mountLayouts: {median: 10, runs: 5}}},
      regressions: [{scene: 'table', metric: 'mountLayouts'}],
      range: {from: 'aaaaaaaaaa', to: 'bbbbbbbbbb'},
    });
    expect(summary).toContain('20 (7d 10) ⚠️');
    expect(summary).toContain('aaaaaaa…bbbbbbb');
  });
});
