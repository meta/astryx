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

/** How often the most heap V8 held is read, ms. */
const SAMPLE_MS = 100;

const GIB = 1024 ** 3;
const gib = bytes => `${(bytes / GIB).toFixed(2)} GiB`;
const percent = share => `${Math.round(share * 100)}%`;

/**
 * The summary line and warning for the recorded processes.
 * @param {string[]} lines the record file's lines
 * @returns {{summary: string, warning: string}}
 */
export function reportHeapPeaks(lines) {
  const parsed = lines
    .filter(line => line.trim() !== '')
    .flatMap(line => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
  const failed = parsed.filter(record => typeof record.error === 'string');
  const failures =
    failed.length === 0
      ? ''
      : ` ${failed.length} ${failed.length === 1 ? 'process' : 'processes'} could not record: ${failed[0].error}.`;
  const records = parsed.filter(record => record.heapLimit > 0);
  if (records.length === 0)
    return {
      summary: `Lint heap: no process recorded its peak.${failures}`,
      warning: '',
    };
  const share = record => record.liveHeap / record.heapLimit;
  const top = records.reduce((best, next) =>
    share(next) > share(best) ? next : best,
  );
  const live = `${gib(top.liveHeap)} of a ${gib(top.heapLimit)} heap (${percent(share(top))})`;
  const summary = `Lint heap: \`${top.command}\` kept ${live} live after a full garbage collection; V8 held at most ${gib(top.heldHeap)}, and its peak RSS was ${gib(top.maxRss)}.${failures}`;
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
 *
 * It must never change the process it watches: every step catches its own
 * errors, writes nothing to the process's output, and never sets its exit
 * code. The first error goes into the record instead.
 * @param {string} file
 */
function recordPeak(file) {
  let liveHeap = 0;
  let heldHeap = 0;
  /** @type {string | undefined} */
  let failure;
  const guard = step => {
    try {
      step();
    } catch (error) {
      failure ??= error instanceof Error ? error.message : String(error);
    }
  };
  const sample = () => {
    const stats = v8.getHeapStatistics();
    heldHeap = Math.max(heldHeap, stats.total_heap_size);
    return stats.used_heap_size;
  };
  /** @type {PerformanceObserver | undefined} */
  let observer;
  guard(() => {
    observer = new PerformanceObserver(list =>
      guard(() => {
        if (
          list
            .getEntries()
            .some(
              entry =>
                entry.detail?.kind === constants.NODE_PERFORMANCE_GC_MAJOR,
            )
        )
          liveHeap = Math.max(liveHeap, sample());
      }),
    );
    observer.observe({entryTypes: ['gc']});
  });
  guard(() => {
    setInterval(() => guard(sample), SAMPLE_MS).unref();
  });
  guard(() => {
    process.on('exit', () => {
      guard(() => {
        sample();
      });
      guard(() => observer?.disconnect());
      try {
        const argv = process.argv.slice(1);
        const command = [path.basename(argv[0] ?? 'node'), ...argv.slice(1)]
          .join(' ')
          .slice(0, 120);
        /** @type {Record<string, unknown>} */
        let record = {pid: process.pid, command};
        if (failure == null) {
          guard(() => {
            record = {
              ...record,
              liveHeap,
              heldHeap,
              heapLimit: v8.getHeapStatistics().heap_size_limit,
              maxRss: process.resourceUsage().maxRSS * 1024,
            };
          });
        }
        if (failure != null)
          record = {pid: process.pid, command, error: failure};
        fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
      } catch {
        // A record that cannot be written costs only the report.
      }
    });
  });
}

if (process.env.LINT_HEAP_PEAK_FILE) {
  try {
    recordPeak(process.env.LINT_HEAP_PEAK_FILE);
  } catch {
    // The watched process runs as if the preload were absent.
  }
}

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
