// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file trace.ts
 * @input Uses a Playwright `Page` (Chromium: CDP `Tracing`)
 * @output `startCompositorTrace`: when the compositor presented each frame,
 *   for the busy-main-thread proof's `presented`.
 * @position Frame evidence beside the screencast: on a loaded machine
 *   Chromium's screencast can skip frames the compositor still presents, and
 *   this record tells such a skip from a stall. Chromium only: WebKit exposes
 *   no comparable trace to Playwright.
 */

import type {CDPSession, Page} from '@playwright/test';

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
 * Records when the compositor presents each frame, for `busyWindowProof`'s
 * `presented`: a Chromium trace of `Display::FrameDisplayed`, on the page
 * clock. Start it with the screencast, before the block, and stop it after.
 * Engines without a CDP trace (WebKit) resolve `stop()` to [], and the
 * verdict then judges the screencast alone.
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
