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
  findRegressions,
  isRecordable,
  isRegression,
  lastGoodRun,
  median,
  readResults,
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

function run(days, scenes = {table: SCENE}, extra = {}) {
  return {
    sha: `sha-${days}`,
    runId: days,
    date: daysBefore(days),
    good: true,
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
  const history = {
    version: 1,
    runs: [run(4), run(3), run(2), run(1, undefined, {good: false})],
  };

  it('flags a regression with the commits since the last good run, and records it', () => {
    const {report, nextHistory} = evaluateRun({
      scenes: {table: {...SCENE, mountLongTaskMs: 200}},
      history,
      run: NIGHTLY,
    });
    expect(report.regressions.map(r => r.metric)).toEqual(['mountLongTaskMs']);
    expect(report.range).toEqual({from: 'sha-2', to: 'sha-now'});
    expect(report.recorded).toBe(true);
    expect(nextHistory.runs.at(-1)).toMatchObject({
      sha: 'sha-now',
      good: false,
    });
  });

  it('records a clean run as good, with no range', () => {
    const {report, nextHistory} = evaluateRun({
      scenes: {table: SCENE},
      history,
      run: NIGHTLY,
    });
    expect(report.regressions).toEqual([]);
    expect(report.range).toBeNull();
    expect(nextHistory.runs.at(-1).good).toBe(true);
  });

  it('compares a pull request run without recording it', () => {
    const {report, nextHistory} = evaluateRun({
      scenes: {table: {...SCENE, mountLongTaskMs: 200}},
      history,
      run: {...NIGHTLY, event: 'pull_request', ref: 'refs/pull/1/merge'},
    });
    expect(report.regressions).toHaveLength(1);
    expect(report.recorded).toBe(false);
    expect(nextHistory).toBe(history);
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
