// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file measure.ts
 * @input A Playwright `Page` on the perf scenes page (Chromium)
 * @output `measureScene`: one sample of a scene's mount, interaction and
 *   unmount, as the numbers one sample records
 * @position Driver support for scenes.perf.spec.ts. Rendering counts and long
 *   tasks come from the interaction harness's Chromium trace
 *   (`traceRendering`); heap and listener counts from the DevTools protocol
 *   after a forced garbage collection; interaction latency from the page's
 *   own Event Timing entries, the measurement behind INP.
 */

import type {CDPSession, Page} from '@playwright/test';
import {
  frames,
  releaseAnimationLog,
  traceRendering,
} from '../../../internal/interaction-harness/src/index';

/** One sample of a scene. Every metric is better when lower. */
export interface SceneSample {
  /** Total time of the main-thread tasks over 50 ms while the scene mounted. */
  mountLongTaskMs: number;
  /** Layouts the main thread ran while the scene mounted. */
  mountLayouts: number;
  /** Layouts the main thread ran during the scene's interaction. */
  interactionLayouts: number;
  /**
   * The slowest interaction's input-to-next-paint time (Event Timing
   * `duration`, 8 ms granularity). 0 when every interaction presented within
   * 16 ms, the shortest duration the browser reports.
   */
  interactionMs: number;
  /** JS heap after unmount minus before mount, KB, both after collection, on a warm cycle. */
  heapDeltaKb: number;
  /** Event listeners after unmount minus before mount. */
  listenerDelta: number;
}

/**
 * Records the page's interactions (Event Timing entries that carry an
 * interaction id) from its first script on. Installed before navigation.
 */
export const EVENT_TIMING_LOG = `(() => {
  window.__perfInteractions = [];
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      if (entry.interactionId > 0) window.__perfInteractions.push(entry.duration);
    }
  }).observe({type: 'event', durationThreshold: 16, buffered: true});
})();`;

async function takeInteractions(page: Page): Promise<number[]> {
  // Entries are queued after the frame that presented them.
  await frames(page, 3);
  return page.evaluate(() => {
    const log = (window as unknown as {__perfInteractions: number[]})
      .__perfInteractions;
    return log.splice(0, log.length);
  });
}

async function collectedCounts(
  page: Page,
  cdp: CDPSession,
): Promise<{heapBytes: number; listeners: number}> {
  // The harness's own animation log (filled by waitForRest) keeps the
  // animations and elements it saw; a count must not include them.
  await releaseAnimationLog(page);
  // Two passes: the first can leave objects a finalizer only just released.
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const {metrics} = await cdp.send('Performance.getMetrics');
  const heap = metrics.find(metric => metric.name === 'JSHeapUsedSize');
  const counters = await cdp.send('Memory.getDOMCounters');
  if (heap == null) {
    throw new Error('Performance.getMetrics reported no JSHeapUsedSize');
  }
  return {heapBytes: heap.value, listeners: counters.jsEventListeners};
}

async function mount(page: Page): Promise<void> {
  await page.getByRole('button', {name: 'Mount scene', exact: true}).click();
  await page
    .locator('html[data-perf-scene="ready"]')
    .waitFor({state: 'attached'});
  await frames(page, 2);
}

async function unmount(page: Page): Promise<void> {
  await page.getByRole('button', {name: 'Unmount scene', exact: true}).click();
  await page.locator('html[data-perf-scene]').waitFor({state: 'detached'});
  await frames(page, 2);
}

/**
 * Plays one unmeasured mount, `interact` and unmount, then measures a second
 * one in the same page and returns that sample. The first cycle pays for
 * loading and compiling the scene's code and for caches that live past an
 * unmount, so the sample is a warm mount, and its heap and listener deltas
 * are what one more cycle leaves behind. The page must be freshly loaded on
 * `?scene=<id>`.
 */
export async function measureScene(
  page: Page,
  interact: (page: Page) => Promise<void>,
): Promise<SceneSample> {
  await mount(page);
  await interact(page);
  await unmount(page);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  try {
    const before = await collectedCounts(page, cdp);

    const mounted = await traceRendering(page, () => mount(page));
    // The warm-up's and the mount click's entries are not the interaction's.
    await takeInteractions(page);

    const interaction = await traceRendering(page, () => interact(page));
    const durations = await takeInteractions(page);

    await unmount(page);
    const after = await collectedCounts(page, cdp);

    return {
      mountLongTaskMs: round(
        mounted.longTasks.reduce((sum, task) => sum + task.durationMs, 0),
      ),
      mountLayouts: mounted.layout,
      interactionLayouts: interaction.layout,
      interactionMs: Math.max(0, ...durations),
      heapDeltaKb: round((after.heapBytes - before.heapBytes) / 1024),
      listenerDelta: after.listeners - before.listeners,
    };
  } finally {
    await cdp.detach().catch(() => {});
  }
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
