// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The Lint job's heap tripwire. Preloaded into each Node process of the
 *   type-aware lint steps (NODE_OPTIONS `--import`), it records the process's
 *   live heap (the most a full garbage collection left in use), its heap
 *   limit, the most heap V8 held, and its peak RSS. `report <file>` then names
 *   the process nearest its limit in the job summary and warns at WARN_SHARE.
 * @input LINT_HEAP_PEAK_FILE, the record file a preloaded process appends to.
 * @output One JSON line per process; the report's summary and warning.
 * @position CI tooling for lint.yml. It only reports: it never fails a run.
 */

import fs from 'node:fs';
import path from 'node:path';
import {PerformanceObserver, constants} from 'node:perf_hooks';
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
  const share = record => record.liveHeap / record.heapLimit;
  const top = records.reduce((best, next) =>
    share(next) > share(best) ? next : best,
  );
  const live = `${gib(top.liveHeap)} of a ${gib(top.heapLimit)} heap (${percent(share(top))})`;
  const summary = `Lint heap: \`${top.command}\` kept ${live} live after a full garbage collection; V8 held at most ${gib(top.heldHeap)}, and its peak RSS was ${gib(top.maxRss)}.`;
  const warning =
    share(top) >= WARN_SHARE
      ? `::warning title=Lint heap near its limit::${top.command} kept ${gib(top.liveHeap)} of its ${gib(top.heapLimit)} heap (${percent(share(top))}) live, past ${percent(WARN_SHARE)}. Before it runs out: lint core's source with a source-only tsconfig, and core's tests in their own step.`
      : '';
  return {summary, warning};
}

/**
 * Records this process's heap at exit. The live heap is the most a full
 * garbage collection left in use: V8 lets the heap grow towards its limit
 * before it collects, so the most it held says little about what the process
 * needs, and a full collection that cannot free enough is what runs out.
 * @param {string} file
 */
function recordPeak(file) {
  let liveHeap = 0;
  let heldHeap = 0;
  const sample = () => {
    const stats = v8.getHeapStatistics();
    heldHeap = Math.max(heldHeap, stats.total_heap_size);
    return stats.used_heap_size;
  };
  const observer = new PerformanceObserver(list => {
    if (
      list
        .getEntries()
        .some(
          entry => entry.detail?.kind === constants.NODE_PERFORMANCE_GC_MAJOR,
        )
    )
      liveHeap = Math.max(liveHeap, sample());
  });
  observer.observe({entryTypes: ['gc']});
  setInterval(sample, 100).unref();
  process.on('exit', () => {
    sample();
    observer.disconnect();
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
          liveHeap,
          heldHeap,
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
