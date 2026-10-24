// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file trace.ts
 * @input Uses a Playwright `Page` (Chromium: CDP `Tracing`) and the page's
 *   PerformanceObserver for long tasks
 * @output `traceRendering` — counts of the main thread's rendering work
 *   (Layout, Paint, UpdateLayoutTree, PrePaint, …) between two marks — and
 *   `installLongTaskLog` / `readLongTasks`.
 * @position The "no Layout/Paint during a transform/opacity animation" proof.
 *   A compositor animation costs the main thread nothing per frame; one that
 *   animates a layout property, or writes styles from JavaScript each frame,
 *   shows a Layout (and usually a Paint) per frame. Chromium only: WebKit
 *   exposes no comparable trace to Playwright.
 *
 * Counting is scoped to the renderer main thread that ran the page's own
 * `performance.mark` calls, and to the time between the start and end marks,
 * so other pages, the browser process and setup work are excluded.
 *
 * SYNC: Keep RENDERING_EVENTS equal to the README's list.
 */

import type {CDPSession, Page} from '@playwright/test';

/** Main-thread trace events that are rendering work, by their trace names. */
export const RENDERING_EVENTS = [
  'UpdateLayoutTree', // style recalculation
  'Layout',
  'PrePaint',
  'Paint',
  'Layerize',
  'UpdateLayer',
  'ScrollLayer',
  'HitTest',
] as const;

export interface RenderingTrace {
  /** Count per trace event name inside the window, on the page's main thread. */
  readonly counts: Readonly<Record<string, number>>;
  /** Shorthand for the four that matter most. */
  readonly layout: number;
  readonly paint: number;
  readonly styleRecalc: number;
  readonly prePaint: number;
  /** Window length, ms. */
  readonly durationMs: number;
  /** Main-thread `RunTask`s longer than 50 ms inside the window (long tasks), epoch ms. */
  readonly longTasks: readonly {
    readonly start: number;
    readonly durationMs: number;
  }[];
  /** Every counted rendering event with its epoch-ms time, for sub-window counts. */
  readonly events: readonly {readonly name: string; readonly t: number}[];
  /** The window, epoch ms on the page's clock. */
  readonly window: {readonly from: number; readonly to: number};
}

/** Counts rendering events by name inside `[from, to]` (epoch ms). */
export function countBetween(
  trace: RenderingTrace,
  from: number,
  to: number,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of trace.events) {
    if (e.t >= from && e.t <= to) {
      counts[e.name] = (counts[e.name] ?? 0) + 1;
    }
  }
  return counts;
}

interface TraceEvent {
  name: string;
  cat: string;
  ph: string;
  ts: number;
  dur?: number;
  pid: number;
  tid: number;
  args?: Record<string, unknown>;
}

/**
 * Traces the page while `body` runs and counts the rendering work its main
 * thread did between a start mark (placed just before `body`) and an end mark
 * (just after).
 */
export async function traceRendering(
  page: Page,
  body: () => Promise<unknown>,
): Promise<RenderingTrace> {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  const events: TraceEvent[] = [];
  cdp.on('Tracing.dataCollected', ({value}) => {
    events.push(...(value as unknown as TraceEvent[]));
  });
  const complete = new Promise<void>(resolve =>
    cdp.once('Tracing.tracingComplete', () => resolve()),
  );
  await cdp.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: {
      includedCategories: [
        'devtools.timeline',
        'disabled-by-default-devtools.timeline',
        'blink.user_timing',
        'toplevel',
      ],
      excludedCategories: ['*'],
    },
  });
  const tag = `harness-${Math.random().toString(36).slice(2, 8)}`;
  const mark = (name: string) =>
    page.evaluate(
      n => performance.timeOrigin + performance.mark(n).startTime,
      name,
    );
  const fromEpoch = await mark(`${tag}:start`);
  await body();
  const toEpoch = await mark(`${tag}:end`);
  await cdp.send('Tracing.end');
  await complete;
  await cdp.detach().catch(() => {});

  const start = events.find(e => e.name === `${tag}:start`);
  const end = events.find(e => e.name === `${tag}:end`);
  if (start == null || end == null) {
    throw new Error('traceRendering: the window marks were not traced');
  }
  const onMain = (e: TraceEvent) =>
    e.pid === start.pid &&
    e.tid === start.tid &&
    e.ts >= start.ts &&
    e.ts <= end.ts;
  // Trace time (µs, monotonic) -> epoch ms, anchored on the start mark.
  const toEpochMs = (ts: number) => fromEpoch + (ts - start.ts) / 1000;
  const counts: Record<string, number> = {};
  const counted: {name: string; t: number}[] = [];
  for (const e of events) {
    if (!onMain(e) || e.ph === 'E') {
      continue;
    }
    if ((RENDERING_EVENTS as readonly string[]).includes(e.name)) {
      counts[e.name] = (counts[e.name] ?? 0) + 1;
      counted.push({name: e.name, t: toEpochMs(e.ts)});
    }
  }
  const longTasks = events
    .filter(e => onMain(e) && e.name === 'RunTask' && (e.dur ?? 0) > 50_000)
    .map(e => ({start: toEpochMs(e.ts), durationMs: (e.dur ?? 0) / 1000}));
  return {
    counts,
    layout: counts.Layout ?? 0,
    paint: counts.Paint ?? 0,
    styleRecalc: counts.UpdateLayoutTree ?? 0,
    prePaint: counts.PrePaint ?? 0,
    durationMs: (end.ts - start.ts) / 1000,
    longTasks,
    events: counted,
    window: {from: fromEpoch, to: toEpoch},
  };
}

const LONG_TASK_SCRIPT = `(() => {
  if (window.__harnessLongTasks || typeof PerformanceObserver === 'undefined') return;
  const tasks = [];
  window.__harnessLongTasks = tasks;
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) tasks.push({start: performance.timeOrigin + entry.startTime, durationMs: entry.duration, name: entry.name});
    }).observe({type: 'longtask', buffered: true});
  } catch {}
})()`;

/** Records every long task (> 50 ms) the page runs (install before navigation; Chromium). */
export async function installLongTaskLog(page: Page): Promise<void> {
  await page.addInitScript(LONG_TASK_SCRIPT);
}

export interface LongTask {
  /** Epoch ms. */
  readonly start: number;
  readonly durationMs: number;
  readonly name: string;
}

/** Long tasks recorded since navigation, optionally only those overlapping a window. */
export async function readLongTasks(
  page: Page,
  range?: {from: number; to: number},
): Promise<LongTask[]> {
  const tasks = await page.evaluate(
    () =>
      (window as unknown as {__harnessLongTasks?: LongTask[]})
        .__harnessLongTasks ?? [],
  );
  return range == null
    ? tasks
    : tasks.filter(
        t => t.start < range.to && t.start + t.durationMs > range.from,
      );
}
