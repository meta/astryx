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

/**
 * The mark a harness function puts on its own page-side work
 * (`console.timeStamp('harness-read')` at the start of the function it
 * evaluates in the page), so a trace can tell the harness's reads from page
 * code a test's own evaluate runs.
 */
export const HARNESS_READ = 'harness-read';

/** Trace events that run page script: a listener, a timer, a frame callback. */
const PAGE_SCRIPT_EVENTS = new Set([
  'EventDispatch',
  'FunctionCall',
  'TimerFire',
  'FireAnimationFrame',
  'FireIdleCallback',
]);

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
  /**
   * The page's own main-thread tasks longer than 50 ms inside the window (long
   * tasks), epoch ms. A task that ran a test's own DevTools command (a
   * `page.evaluate`) is one, whether it calls page code directly or sets it
   * off; only the harness's own marked reads are in `devtoolsTasks`.
   */
  readonly longTasks: readonly {
    readonly start: number;
    readonly durationMs: number;
  }[];
  /**
   * Main-thread tasks longer than 50 ms inside the window that ran a DevTools
   * command the harness marked as its own read (`HARNESS_READ`) and no page
   * script, epoch ms: `waitForAnimation` describing every animation's
   * keyframes, or `blockMainThread(page, ms)` without `during`.
   */
  readonly devtoolsTasks: readonly {
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
  // A task that ran a DevTools command received it over the DevTools
  // session's pipe; page script it set off shows as its listener, timer or
  // frame callback.
  const main = events.filter(e => onMain(e) && e.ph !== 'E');
  const longTasks: {start: number; durationMs: number}[] = [];
  const devtoolsTasks: {start: number; durationMs: number}[] = [];
  for (const task of main) {
    if (task.name !== 'RunTask' || (task.dur ?? 0) <= 50_000) {
      continue;
    }
    const end = task.ts + (task.dur ?? 0);
    const inside = main.filter(
      e => e !== task && e.ts >= task.ts && e.ts <= end,
    );
    const devtools = inside.some(
      e =>
        e.name === 'Receive mojo message' &&
        (
          e.args?.chrome_mojo_event_info as
            {mojo_interface_tag?: unknown} | undefined
        )?.mojo_interface_tag === 'blink.mojom.DevToolsSession',
    );
    // Only the harness's own reads are set apart: a test's evaluate may call
    // page code directly, which leaves no listener or timer in the trace.
    const harnessRead = inside.some(
      e =>
        e.name === 'TimeStamp' &&
        (e.args?.data as {message?: unknown} | undefined)?.message ===
          HARNESS_READ,
    );
    const pageScript = inside.some(e => PAGE_SCRIPT_EVENTS.has(e.name));
    (devtools && harnessRead && !pageScript ? devtoolsTasks : longTasks).push({
      start: toEpochMs(task.ts),
      durationMs: (task.dur ?? 0) / 1000,
    });
  }
  return {
    counts,
    layout: counts.Layout ?? 0,
    paint: counts.Paint ?? 0,
    styleRecalc: counts.UpdateLayoutTree ?? 0,
    prePaint: counts.PrePaint ?? 0,
    durationMs: (end.ts - start.ts) / 1000,
    longTasks,
    devtoolsTasks,
    events: counted,
    window: {from: fromEpoch, to: toEpoch},
  };
}

/**
 * The browser's open pages. The compositor record is browser-wide: its
 * `Display::FrameDisplayed` events carry no page identity.
 */
function openPages(page: Page): Page[] {
  const browser = page.context().browser();
  return browser == null
    ? page.context().pages()
    : browser.contexts().flatMap(context => context.pages());
}

/**
 * Watches for a page that opens while the record runs, in any context (it
 * may close again before the record stops). Returns whether one opened.
 */
async function watchForOtherPages(
  page: Page,
): Promise<{stop(): Promise<boolean>}> {
  let opened = false;
  const onPage = (other: Page) => {
    if (other !== page) {
      opened = true;
    }
  };
  // The page's own context, through Playwright (a persistent context has no
  // browser to ask).
  page.context().on('page', onPage);
  // Every context, through the browser's target discovery: a page in a
  // context created during the record is a new target too.
  let targets: CDPSession | null = null;
  const browser = page.context().browser();
  if (browser != null) {
    try {
      targets = await browser.newBrowserCDPSession();
      const {targetInfos} = await targets.send('Target.getTargets');
      const known = new Set(targetInfos.map(info => info.targetId));
      targets.on('Target.targetCreated', ({targetInfo}) => {
        if (targetInfo.type === 'page' && !known.has(targetInfo.targetId)) {
          opened = true;
        }
      });
      await targets.send('Target.setDiscoverTargets', {discover: true});
    } catch {
      targets = null;
    }
  }
  return {
    async stop() {
      page.context().off('page', onPage);
      await targets?.detach().catch(() => {});
      return opened;
    },
  };
}

function assertOnlyPage(page: Page, when: string): void {
  if (openPages(page).some(other => other !== page && !other.isClosed())) {
    throw new Error(
      `startCompositorTrace: another page is open ${when}; the compositor record is browser-wide (its frames carry no page identity), so another page's frames would be credited to this one`,
    );
  }
}

/**
 * Records when the compositor presents each frame, for `busyWindowProof`'s
 * `presented`: a Chromium trace of `Display::FrameDisplayed`, on the page
 * clock. Start it with the screencast, before the block, and stop it after.
 * Engines without a CDP trace (WebKit) resolve `stop()` to [], and the
 * verdict then judges the screencast alone. It runs its own trace, so not
 * inside `traceRendering`. The record is browser-wide, so it throws when
 * another page is open as it starts or stops, or opened while it ran.
 */
export async function startCompositorTrace(
  page: Page,
): Promise<{stop(): Promise<number[]>}> {
  let cdp: CDPSession;
  try {
    cdp = await page.context().newCDPSession(page);
  } catch {
    return {stop: async () => []};
  }
  try {
    assertOnlyPage(page, 'as the trace starts');
  } catch (error) {
    await cdp.detach().catch(() => {});
    throw error;
  }
  const others = await watchForOtherPages(page);
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
        'disabled-by-default-display.framedisplayed',
        'blink.user_timing',
      ],
      excludedCategories: ['*'],
    },
  });
  const tag = `harness-compositor-${Math.random().toString(36).slice(2, 8)}`;
  const epoch = await page.evaluate(
    n => performance.timeOrigin + performance.mark(n).startTime,
    tag,
  );
  return {
    async stop() {
      await cdp.send('Tracing.end');
      await complete;
      await cdp.detach().catch(() => {});
      if (await others.stop()) {
        throw new Error(
          "startCompositorTrace: another page opened during the record; the compositor record is browser-wide (its frames carry no page identity), so that page's frames would be credited to this one",
        );
      }
      assertOnlyPage(page, 'as the trace stops');
      const mark = events.find(e => e.name === tag);
      if (mark == null) {
        throw new Error('startCompositorTrace: the clock mark was not traced');
      }
      // Trace time (µs, monotonic) -> epoch ms, anchored on the mark.
      return events
        .filter(e => e.name === 'Display::FrameDisplayed')
        .map(e => epoch + (e.ts - mark.ts) / 1000)
        .sort((a, b) => a - b);
    },
  };
}

const LONG_TASK_SCRIPT = `(() => {
  if (window.__harnessLongTasks) return;
  const tasks = [];
  const log = {tasks, supported: false};
  window.__harnessLongTasks = log;
  if (typeof PerformanceObserver === 'undefined' || !(PerformanceObserver.supportedEntryTypes || []).includes('longtask')) return;
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) tasks.push({start: performance.timeOrigin + entry.startTime, durationMs: entry.duration, name: entry.name});
    }).observe({type: 'longtask', buffered: true});
    log.supported = true;
  } catch {}
})()`;

/**
 * Records every long task (> 50 ms) the page runs (install before navigation;
 * Chromium), through the Long Tasks API. That sees the tasks of the page's own
 * event loop: a timer, an event handler, `blockMainThread(page, ms, {during})`.
 * A DevTools `page.evaluate`, such as `blockMainThread(page, ms)` without
 * `during`, is not one of them and is never recorded here; `traceRendering`
 * reports it in `devtoolsTasks`, apart from the page's `longTasks`.
 */
export async function installLongTaskLog(page: Page): Promise<void> {
  await page.addInitScript(LONG_TASK_SCRIPT);
}

export interface LongTask {
  /** Epoch ms. */
  readonly start: number;
  readonly durationMs: number;
  readonly name: string;
}

/**
 * Long tasks recorded since navigation, optionally only those overlapping a
 * window. Fails closed: it throws when the log never ran on this document
 * (installed after the page navigated) or the engine has no Long Tasks API
 * (WebKit), so an empty answer is evidence of no long task, never of no log.
 */
export async function readLongTasks(
  page: Page,
  range?: {from: number; to: number},
): Promise<LongTask[]> {
  const log = await page.evaluate(
    () =>
      (
        window as unknown as {
          __harnessLongTasks?: {tasks: LongTask[]; supported: boolean};
        }
      ).__harnessLongTasks ?? null,
  );
  if (log == null) {
    throw new Error(
      'readLongTasks: the long-task log is not running on this document; call installLongTaskLog(page) before navigating',
    );
  }
  if (!log.supported) {
    throw new Error(
      'readLongTasks: this engine has no Long Tasks API, so the log records nothing',
    );
  }
  const tasks = log.tasks;
  return range == null
    ? tasks
    : tasks.filter(
        t => t.start < range.to && t.start + t.durationMs > range.from,
      );
}
