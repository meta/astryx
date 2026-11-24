// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The Lint job's heap tripwire. Preloaded into each Node process of the
 *   type-aware lint steps (NODE_OPTIONS `--import`), it records the process's
 *   live heap (the most a full garbage collection left in use), its heap
 *   limit, the most heap V8 held, and its peak RSS. `report <file>` then names
 *   the process nearest its limit in the job summary and warns at WARN_SHARE.
 * @input LINT_HEAP_PEAK_FILE, the record file a preloaded process appends to.
 * @output JSON lines per process; the report's summary and warning.
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

const NEXT_STEP =
  "lint core's source with a source-only tsconfig, and core's tests in their own step.";

const GIB = 1024 ** 3;
const gib = bytes => `${(bytes / GIB).toFixed(2)} GiB`;
const percent = share => `${Math.round(share * 100)}%`;

/**
 * Each process's last reading, whether it finished, and one error per
 * process that could not record. A line that cannot be read is skipped.
 * @param {string[]} lines
 */
function readProcesses(lines) {
  /** @type {Map<number, Record<string, any>>} */
  const readings = new Map();
  /** @type {Map<number, string>} */
  const errors = new Map();
  /** @type {Set<number>} */
  const finished = new Set();
  for (const line of lines) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record == null || typeof record !== 'object') continue;
    if (record.done === true) finished.add(record.pid);
    if (typeof record.error === 'string') errors.set(record.pid, record.error);
    else if (record.heapLimit > 0) readings.set(record.pid, record);
  }
  return {
    processes: [...readings.values()].map(record => ({
      ...record,
      done: finished.has(record.pid),
    })),
    errors: [...errors.values()],
  };
}

/**
 * The summary line and warning for the recorded processes. A process that
 * did not finish comes first: one that runs out of heap writes no exit
 * record, so its last reading after a full collection is all that remains.
 * @param {string[]} lines the record file's lines
 * @returns {{summary: string, warning: string}}
 */
export function reportHeapPeaks(lines) {
  const {processes, errors} = readProcesses(lines);
  const failures =
    errors.length === 0
      ? ''
      : ` ${errors.length} ${errors.length === 1 ? 'process' : 'processes'} could not record: ${errors[0]}.`;
  if (processes.length === 0)
    return {
      summary: `Lint heap: no process recorded its peak.${failures}`,
      warning: '',
    };
  const share = record => record.liveHeap / record.heapLimit;
  const rank = record => (record.done ? share(record) : 1 + share(record));
  const top = processes.reduce((best, next) =>
    rank(next) > rank(best) ? next : best,
  );
  const live = `about ${gib(top.liveHeap)} of a ${gib(top.heapLimit)} heap (${percent(share(top))}) live after a full garbage collection`;
  const rest = `V8 held at most ${gib(top.heldHeap)}, and its peak RSS was ${gib(top.maxRss)}.${failures}`;
  const title = '::warning title=Lint heap near its limit::';
  if (!top.done)
    return {
      summary: `Lint heap: \`${top.command}\` did not finish; its last reading kept ${live}; ${rest}`,
      warning: `${title}${top.command} did not finish, with about ${gib(top.liveHeap)} of its ${gib(top.heapLimit)} heap (${percent(share(top))}) live at its last reading. If it ran out of heap: ${NEXT_STEP}`,
    };
  return {
    summary: `Lint heap: \`${top.command}\` kept ${live}; ${rest}`,
    warning:
      share(top) >= WARN_SHARE
        ? `${title}${top.command} kept about ${gib(top.liveHeap)} of its ${gib(top.heapLimit)} heap (${percent(share(top))}) live, past ${percent(WARN_SHARE)}. Before it runs out: ${NEXT_STEP}`
        : '',
  };
}

/**
 * Records this process's heap. The live heap is the most a full garbage
 * collection left in use: V8 lets the heap grow towards its limit before it
 * collects, so the most it held says little about what the process needs,
 * and a full collection that cannot free enough is what runs out. A reading
 * is written each time the live heap rises, because a process that runs out
 * of heap never reaches its exit record.
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
  const argv = process.argv.slice(1);
  const command = [path.basename(argv[0] ?? 'node'), ...argv.slice(1)]
    .join(' ')
    .slice(0, 120);
  const sample = () => {
    const stats = v8.getHeapStatistics();
    heldHeap = Math.max(heldHeap, stats.total_heap_size);
    return stats.used_heap_size;
  };
  const write = done => {
    const record =
      failure == null
        ? {
            pid: process.pid,
            command,
            done,
            liveHeap,
            heldHeap,
            heapLimit: v8.getHeapStatistics().heap_size_limit,
            maxRss: process.resourceUsage().maxRSS * 1024,
          }
        : {pid: process.pid, command, done, error: failure};
    fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
  };
  /** @type {PerformanceObserver | undefined} */
  let observer;
  guard(() => {
    observer = new PerformanceObserver(list =>
      guard(() => {
        const major = list
          .getEntries()
          .some(
            entry => entry.detail?.kind === constants.NODE_PERFORMANCE_GC_MAJOR,
          );
        if (!major) return;
        const used = sample();
        if (used <= liveHeap) return;
        liveHeap = used;
        write(false);
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
        let written = false;
        guard(() => {
          write(true);
          written = true;
        });
        // The heap record failed: write the error record instead.
        if (!written) write(true);
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
  try {
    const file = process.argv[3] ?? '';
    const lines = fs.statSync(file, {throwIfNoEntry: false})?.isFile()
      ? fs.readFileSync(file, 'utf8').split('\n')
      : [];
    const {summary, warning} = reportHeapPeaks(lines);
    console.log(summary);
    if (warning) console.log(warning);
    if (process.env.GITHUB_STEP_SUMMARY)
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  } catch (error) {
    console.log(`Lint heap: the report could not be made: ${error.message}`);
  }
  process.exitCode = 0;
}
