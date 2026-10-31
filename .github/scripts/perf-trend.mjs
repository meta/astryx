#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The nightly perf trend: compare a run's scene medians with the last
 * seven days of main and keep the history.
 * @input `--results <dir>` (one `<scene>.json` per scene from
 *   apps/sandbox/perf/scenes.perf.spec.ts), `--history <file>` (the previous
 *   run's perf-history.json; may be missing), `--out <dir>`, and the run's
 *   `--sha`, `--run-id`, `--run-url`, `--event`, `--ref`, `--repository`,
 *   `--date` (ISO).
 * @output In `--out`: `report.json` (regressions, the commit range since the
 *   last good run, whether the run was recorded), `summary.md` (for the job
 *   summary), and `perf-history.json` (the history with this run appended,
 *   when it is a nightly or dispatched run on main; otherwise unchanged).
 * @position The report job of .github/workflows/perf-nightly.yml. The
 *   history travels as a workflow artifact from one main run to the next
 *   (artifacts need only `actions: read`; the Actions cache is not used for
 *   dependencies or data in this repository). Pull request runs compare
 *   against the history and record nothing.
 *
 * A metric regresses when it is more than 10% worse than its median over the
 * runs recorded in the seven days before this one, and worse by at least the
 * metric's floor, so noise on a near-zero value (a 1 ms long task becoming
 * 2 ms) is not a regression. A metric with fewer than three runs in the window
 * has no baseline yet. Every metric is better when lower.
 *
 * SYNC: METRICS names the fields of SceneSample in apps/sandbox/perf/measure.ts.
 */

import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const THRESHOLD = 0.1;
export const WINDOW_DAYS = 7;
export const MIN_BASELINE_RUNS = 3;
export const HISTORY_LIMIT = 120;

/** metric → the smallest absolute worsening that can count, and its unit. */
export const METRICS = {
  mountLongTaskMs: {floor: 20, unit: 'ms', label: 'Mount long tasks'},
  mountLayouts: {floor: 2, unit: '', label: 'Mount layouts'},
  interactionLayouts: {floor: 2, unit: '', label: 'Interaction layouts'},
  interactionMs: {floor: 16, unit: 'ms', label: 'Interaction latency'},
  heapDeltaKb: {floor: 256, unit: 'KB', label: 'Heap after unmount'},
  listenerDelta: {floor: 5, unit: '', label: 'Listeners after unmount'},
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Whether a run is a nightly or dispatched run on this repository's main. */
export function isRecordable({event, ref, repository}) {
  return (
    (event === 'schedule' || event === 'workflow_dispatch') &&
    ref === 'refs/heads/main' &&
    repository === 'meta/astryx'
  );
}

/** scene → metric → {median, runs} over recorded runs in the window before `at`. */
export function baselineMedians(history, at) {
  const end = Date.parse(at);
  const start = end - WINDOW_DAYS * DAY_MS;
  const values = {};
  for (const run of history.runs) {
    const time = Date.parse(run.date);
    if (!(time >= start && time < end)) continue;
    for (const [scene, metrics] of Object.entries(run.scenes)) {
      for (const [metric, value] of Object.entries(metrics)) {
        if (typeof value !== 'number') continue;
        ((values[scene] ??= {})[metric] ??= []).push(value);
      }
    }
  }
  const baseline = {};
  for (const [scene, metrics] of Object.entries(values)) {
    for (const [metric, list] of Object.entries(metrics)) {
      (baseline[scene] ??= {})[metric] = {
        median: median(list),
        runs: list.length,
      };
    }
  }
  return baseline;
}

/** Whether `value` regresses against `base` (a baseline median) for `metric`. */
export function isRegression(metric, value, base) {
  const floor = METRICS[metric]?.floor ?? 0;
  return value > base * (1 + THRESHOLD) && value - base >= floor;
}

/** Every scene metric that regressed against its baseline. */
export function findRegressions(scenes, baseline) {
  const regressions = [];
  for (const [scene, metrics] of Object.entries(scenes)) {
    for (const metric of Object.keys(METRICS)) {
      const value = metrics[metric];
      const base = baseline[scene]?.[metric];
      if (typeof value !== 'number' || base == null) continue;
      if (base.runs < MIN_BASELINE_RUNS) continue;
      if (isRegression(metric, value, base.median)) {
        regressions.push({
          scene,
          metric,
          value,
          median: base.median,
          change: base.median === 0 ? null : value / base.median - 1,
        });
      }
    }
  }
  return regressions;
}

/** The newest recorded run with no regression, or null. */
export function lastGoodRun(history) {
  for (let i = history.runs.length - 1; i >= 0; i--) {
    if (history.runs[i].good) return history.runs[i];
  }
  return null;
}

/** The history with `run` appended, oldest runs dropped past HISTORY_LIMIT. */
export function appendRun(history, run) {
  return {version: 1, runs: [...history.runs, run].slice(-HISTORY_LIMIT)};
}

export function readHistory(file) {
  if (file == null || !fs.existsSync(file)) return {version: 1, runs: []};
  const history = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (history?.version !== 1 || !Array.isArray(history.runs)) {
    throw new Error(`${file} is not a version 1 perf history`);
  }
  return history;
}

/** scene → metric → median, from the driver's result files. */
export function readResults(dir) {
  const scenes = {};
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.json')) continue;
    const result = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    if (typeof result.scene !== 'string' || result.median == null) {
      throw new Error(`${name} is not a perf scene result`);
    }
    scenes[result.scene] = result.median;
  }
  if (Object.keys(scenes).length === 0) {
    throw new Error(`no perf scene results in ${dir}`);
  }
  return scenes;
}

function format(metric, value) {
  const unit = METRICS[metric]?.unit ?? '';
  const number = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return unit ? `${number} ${unit}` : number;
}

/** The job summary: every scene's medians beside its baseline. */
export function renderSummary({scenes, baseline, regressions, range}) {
  const flagged = new Set(regressions.map(r => `${r.scene}/${r.metric}`));
  const lines = [
    '## Nightly perf scenes',
    '',
    regressions.length === 0
      ? 'No metric is more than 10% worse than its 7-day median.'
      : `**${regressions.length} metric(s) regressed** against the 7-day median.`,
    '',
    `| Scene | ${Object.values(METRICS)
      .map(m => m.label)
      .join(' | ')} |`,
    `| --- |${' ---: |'.repeat(Object.keys(METRICS).length)}`,
  ];
  for (const [scene, metrics] of Object.entries(scenes)) {
    const cells = Object.keys(METRICS).map(metric => {
      const value = metrics[metric];
      if (typeof value !== 'number') return '—';
      const base = baseline[scene]?.[metric];
      const mark = flagged.has(`${scene}/${metric}`) ? ' ⚠️' : '';
      return base && base.runs >= MIN_BASELINE_RUNS
        ? `${format(metric, value)} (7d ${format(metric, base.median)})${mark}`
        : format(metric, value);
    });
    lines.push(`| ${scene} | ${cells.join(' | ')} |`);
  }
  if (range) {
    lines.push(
      '',
      `Commits since the last good run: ${range.from.slice(0, 7)}…${range.to.slice(0, 7)}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

/** Compares a run with the history; returns the report and the next history. */
export function evaluateRun({scenes, history, run}) {
  const baseline = baselineMedians(history, run.date);
  const regressions = findRegressions(scenes, baseline);
  const good = lastGoodRun(history);
  const range =
    regressions.length > 0 && good != null && good.sha !== run.sha
      ? {from: good.sha, to: run.sha}
      : null;
  const recorded = isRecordable(run);
  const nextHistory = recorded
    ? appendRun(history, {
        sha: run.sha,
        runId: run.runId,
        date: run.date,
        good: regressions.length === 0,
        scenes,
      })
    : history;
  return {
    report: {
      sha: run.sha,
      runUrl: run.runUrl,
      recorded,
      lastGood: good
        ? {sha: good.sha, runId: good.runId, date: good.date}
        : null,
      range,
      regressions,
    },
    baseline,
    nextHistory,
  };
}

/**
 * Reads a run's results and the previous history, writes report.json,
 * perf-history.json and summary.md to `outDir`, and returns the report and
 * the summary. The workflow calls it from actions/github-script; the CLI below
 * is the same call.
 */
export function runReport({resultsDir, historyFile, outDir, run}) {
  const scenes = readResults(resultsDir);
  const history = readHistory(historyFile);
  const {report, baseline, nextHistory} = evaluateRun({scenes, history, run});
  const summary = renderSummary({
    scenes,
    baseline,
    regressions: report.regressions,
    range: report.range,
  });
  fs.mkdirSync(outDir, {recursive: true});
  fs.writeFileSync(
    path.join(outDir, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(outDir, 'perf-history.json'),
    `${JSON.stringify(nextHistory, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(outDir, 'summary.md'), summary);
  return {report, summary, earlierRuns: history.runs.length};
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--')) throw new Error(`unexpected ${argv[i]}`);
    args[argv[i].slice(2)] = argv[i + 1];
  }
  for (const required of [
    'results',
    'out',
    'sha',
    'event',
    'ref',
    'repository',
    'date',
  ]) {
    if (!args[required]) throw new Error(`--${required} is required`);
  }
  return args;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = parseArgs(process.argv.slice(2));
  const {report, earlierRuns} = runReport({
    resultsDir: args.results,
    historyFile: args.history,
    outDir: args.out,
    run: {
      sha: args.sha,
      runId: args['run-id'] ?? null,
      runUrl: args['run-url'] ?? null,
      event: args.event,
      ref: args.ref,
      repository: args.repository,
      date: args.date,
    },
  });
  console.log(
    `${report.regressions.length} regression(s), ${report.recorded ? 'recorded' : 'not recorded'}; ${earlierRuns} earlier run(s) in the history.`,
  );
}
