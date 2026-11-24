// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The Lint job's heap tripwire. Preloaded into each Node process of the
 *   type-aware lint steps (NODE_OPTIONS `--import`), it records the process's
 *   peak heap, its heap limit and its peak RSS. `report <file>` then names the
 *   process nearest its limit in the job summary and warns at WARN_SHARE.
 * @input LINT_HEAP_PEAK_FILE, the record file a preloaded process appends to.
 * @output One JSON line per process; the report's summary and warning.
 * @position CI tooling for lint.yml. It only reports: it never fails a run.
 */

import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import v8 from 'node:v8';

/** The share of its heap limit past which the report warns. */
export const WARN_SHARE = 0.8;

const GIB = 1024 ** 3;
const gib = bytes => `${(bytes / GIB).toFixed(2)} GiB`;
const percent = share => `${Math.round(share * 100)}%`;

/**
 * The summary line and warning for the recorded processes.
 * @param {string[]} lines the record file's lines
 * @returns {{summary: string, warning: string}}
 */
export function reportHeapPeaks(lines) {
  const records = lines
    .filter(line => line.trim() !== '')
    .map(line => JSON.parse(line))
    .filter(record => record.heapLimit > 0);
  if (records.length === 0)
    return {summary: 'Lint heap: no process recorded its peak.', warning: ''};
  const share = record => record.peakUsed / record.heapLimit;
  const top = records.reduce((best, next) =>
    share(next) > share(best) ? next : best,
  );
  const peak = `${gib(top.peakUsed)} of a ${gib(top.heapLimit)} heap (${percent(share(top))})`;
  const summary = `Lint heap: \`${top.command}\` peaked at ${peak}; its peak RSS was ${gib(top.maxRss)}.`;
  const warning =
    share(top) >= WARN_SHARE
      ? `::warning title=Lint heap near its limit::${top.command} peaked at ${gib(top.peakUsed)} of its ${gib(top.heapLimit)} heap (${percent(share(top))}), past ${percent(WARN_SHARE)}. Before it runs out: lint core's source with a source-only tsconfig, and core's tests in their own step.`
      : '';
  return {summary, warning};
}

/**
 * Records this process's peak heap at exit. Timers sample the heap between
 * tasks, and the exit sample adds the heap V8 holds then: a stretch of
 * synchronous work can peak between samples, but V8 keeps the heap it grew.
 * @param {string} file
 */
function recordPeak(file) {
  let peakUsed = 0;
  const sample = () => {
    const stats = v8.getHeapStatistics();
    peakUsed = Math.max(peakUsed, stats.used_heap_size, stats.total_heap_size);
  };
  setInterval(sample, 100).unref();
  process.on('exit', () => {
    sample();
    const argv = process.argv.slice(1);
    const command = [path.basename(argv[0] ?? 'node'), ...argv.slice(1)]
      .join(' ')
      .slice(0, 120);
    try {
      fs.appendFileSync(
        file,
        `${JSON.stringify({
          pid: process.pid,
          command,
          peakUsed,
          heapLimit: v8.getHeapStatistics().heap_size_limit,
          maxRss: process.resourceUsage().maxRSS * 1024,
        })}\n`,
      );
    } catch {
      // A record that cannot be written costs only the report.
    }
  });
}

if (process.env.LINT_HEAP_PEAK_FILE)
  recordPeak(process.env.LINT_HEAP_PEAK_FILE);

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href &&
  process.argv[2] === 'report'
) {
  const file = process.argv[3] ?? '';
  const lines = fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8').split('\n')
    : [];
  const {summary, warning} = reportHeapPeaks(lines);
  console.log(summary);
  if (warning) console.log(warning);
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}
