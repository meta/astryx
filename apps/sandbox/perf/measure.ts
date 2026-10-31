// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file measure.ts
 * @input A Playwright `Page` on the perf scenes page (Chromium)
 * @output `measureScene`: one sample of a scene's mount, interaction and
 *   unmount, as the numbers the nightly perf trend compares
 * @position Driver support for scenes.perf.spec.ts. Rendering counts and long
 *   tasks come from the interaction harness's Chromium trace
 *   (`traceRendering`); heap and listener counts from the DevTools protocol
 *   after a forced garbage collection; interaction latency from the page's
 *   own Event Timing entries, the measurement behind INP.
 *
 * SYNC: Keep the metric names equal to METRICS in
 *   .github/scripts/perf-trend.mjs.
 */

import type {CDPSession, Page} from '@playwright/test';
import {
  frames,
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
  /** JS heap after unmount minus before mount, KB, both after collection. */
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
  cdp: CDPSession,
): Promise<{heapBytes: number; listeners: number}> {
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

/** Waits until no animation in the document is still running (at most 3 s). */
export async function animationsSettled(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document
        .getAnimations()
        .every(animation => animation.playState !== 'running'),
    undefined,
    {timeout: 3_000},
  );
  await frames(page, 2);
}

/**
 * Mounts the scene the page shows, plays `interact`, unmounts it, and returns
 * the sample. The page must be freshly loaded on `?scene=<id>`.
 */
export async function measureScene(
  page: Page,
  interact: (page: Page) => Promise<void>,
): Promise<SceneSample> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  try {
    const before = await collectedCounts(cdp);

    const mount = await traceRendering(page, async () => {
      await page
        .getByRole('button', {name: 'Mount scene', exact: true})
        .click();
      await page.locator('html[data-perf-scene="ready"]').waitFor({
        state: 'attached',
      });
      await frames(page, 2);
    });
    // The mount click is not part of the scene's interaction.
    await takeInteractions(page);

    const interaction = await traceRendering(page, () => interact(page));
    const durations = await takeInteractions(page);

    await page
      .getByRole('button', {name: 'Unmount scene', exact: true})
      .click();
    await page.locator('html[data-perf-scene]').waitFor({state: 'detached'});
    await frames(page, 2);
    const after = await collectedCounts(cdp);

    return {
      mountLongTaskMs: round(
        mount.longTasks.reduce((sum, task) => sum + task.durationMs, 0),
      ),
      mountLayouts: mount.layout,
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
