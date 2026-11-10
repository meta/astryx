// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file perfReadings.ts
 * @input Measured values, a saved baseline, and the browser's Long Tasks API
 * @output Duration, count and baseline-change text, and a long-task watcher
 * @position Shared readings for the Sandbox performance pages (Animated Layout
 *   Perf, DiffViewer Perf, Markdown Perf), so they show one value the same way
 */

export function formatDuration(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(1)} ms`;
}

export function formatCount(value: number | null): string {
  return value == null ? '—' : value.toLocaleString();
}

/** What a change shows when it has no value or no baseline to compare. */
export interface BenchmarkChangeEmptyLabels {
  /** Shown when no baseline is saved. Defaults to '—'. */
  noBaseline?: string;
  /** Shown when a baseline is saved but there is no value yet. Defaults to '—'. */
  noValue?: string;
}

export function formatBenchmarkChange(
  value: number | null,
  baseline: number | null,
  empty: BenchmarkChangeEmptyLabels = {},
): string {
  if (baseline == null) {
    return empty.noBaseline ?? '—';
  }
  if (value == null) {
    return empty.noValue ?? '—';
  }
  if (baseline === 0) {
    return value === 0 ? '0.0%' : 'new';
  }
  const percent = ((value - baseline) / baseline) * 100;
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`;
}

export interface LongTaskReading {
  count: number;
  totalMs: number;
}

/**
 * Collects long tasks until the returned stop function is called. Returns
 * null from stop when the browser has no Long Tasks API, so a page shows no
 * reading rather than a misleading zero.
 */
export function watchLongTasks(): () => LongTaskReading | null {
  const isSupported =
    typeof PerformanceObserver !== 'undefined' &&
    PerformanceObserver.supportedEntryTypes?.includes('longtask') === true;
  if (!isSupported) {
    return () => null;
  }
  const entries: PerformanceEntry[] = [];
  const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      entries.push(entry);
    }
  });
  observer.observe({type: 'longtask', buffered: false});
  return () => {
    for (const entry of observer.takeRecords()) {
      entries.push(entry);
    }
    observer.disconnect();
    return {
      count: entries.length,
      totalMs: entries.reduce((total, entry) => total + entry.duration, 0),
    };
  };
}
