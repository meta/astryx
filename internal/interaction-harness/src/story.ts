// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file story.ts
 * @input Uses a Playwright `Page` and test object, and the a11y-spec package's
 *   static server over a built Storybook
 * @output `phone` (the touch-phone browser context every interaction proof
 *   runs in), `withStorybook` (serve the built Storybook for a spec file), and
 *   `openStory` (load one story and wait until it has rendered).
 * @position Stories are the reproduction path, as for every other browser
 *   check in this repository: a scenario used for verification is checked in,
 *   not built in a one-off page.
 *
 * The phone is an iPhone 17 Pro in Safari: 402 × 874 pt screen, 402 × 714 pt
 * visible page with the toolbars shown, 3 device pixels per point, touch,
 * mobile viewport rules. Measured on the iOS 26.2 simulator
 * (`innerWidth`/`innerHeight`, `screen`, `devicePixelRatio`).
 *
 * SYNC: Keep `phone` equal to the projects in playwright.interaction.config.ts.
 */

import type {Page, TestType} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

export const phone = {
  viewport: {width: 402, height: 714},
  screen: {width: 402, height: 874},
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
} as const;

/**
 * Serves the built Storybook for the spec file's tests (`ASTRYX_STORYBOOK_DIR`
 * overrides the default `apps/storybook/dist`). Returns its origin getter.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any fixture set
export function withStorybook(test: TestType<any, any>): () => string {
  let server: StaticServer | undefined;
  test.beforeAll(async () => {
    server = await serveStorybook(
      process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
    );
  });
  test.afterAll(async () => {
    await server?.close();
  });
  return () => {
    if (server == null) {
      throw new Error(
        'withStorybook: the Storybook server is not running (call inside a test)',
      );
    }
    return server.origin;
  };
}

/** Loads a story in the page and waits for its first render, its fonts and two frames. */
export async function openStory(
  page: Page,
  origin: string,
  storyId: string,
  args?: Readonly<Record<string, string>>,
): Promise<void> {
  const params = new URLSearchParams({id: storyId, viewMode: 'story'});
  if (args != null) {
    params.set(
      'args',
      Object.entries(args)
        .map(([k, v]) => `${k}:${v}`)
        .join(';'),
    );
  }
  await page.goto(`${origin}/iframe.html?${params.toString()}`);
  await page
    .locator('#storybook-root > *')
    .first()
    .waitFor({state: 'attached'});
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

/** Resolves after `count` animation frames have been presented in the page. */
export async function frames(page: Page, count = 2): Promise<void> {
  await page.evaluate(
    n =>
      new Promise<void>(resolve => {
        // The page's real frames, even while a timer gate holds its callbacks.
        const frame =
          (
            window as unknown as {
              __harnessTimerGate?: {frame: typeof requestAnimationFrame};
            }
          ).__harnessTimerGate?.frame ?? requestAnimationFrame;
        let left = n;
        const tick = () => (--left <= 0 ? resolve() : frame(tick));
        frame(tick);
      }),
    count,
  );
}

// A held callback is queued under its timer or frame id, so the page's own
// clearTimeout and cancelAnimationFrame still cancel it while frozen; a held
// frame callback gets the time it actually runs at. `frame` stays the real
// requestAnimationFrame, for the harness's own waits.
const TIMER_GATE = `(() => {
  if (window.__harnessTimerGate) return;
  const realTimeout = window.setTimeout.bind(window);
  const realClearTimeout = window.clearTimeout.bind(window);
  const realInterval = window.setInterval.bind(window);
  const realFrame = window.requestAnimationFrame.bind(window);
  const realCancelFrame = window.cancelAnimationFrame.bind(window);
  const gate = {frozen: false, queue: [], frame: realFrame};
  window.__harnessTimerGate = gate;
  const drop = key => { gate.queue = gate.queue.filter(entry => entry.key !== key); };
  window.setTimeout = (fn, ms, ...args) => {
    const id = realTimeout(() => {
      const run = () => (typeof fn === 'function' ? fn(...args) : 0);
      if (gate.frozen) gate.queue.push({key: 't' + id, run}); else run();
    }, ms);
    return id;
  };
  window.clearTimeout = id => { realClearTimeout(id); drop('t' + id); };
  window.setInterval = (fn, ms, ...args) => realInterval(() => { if (!gate.frozen && typeof fn === 'function') fn(...args); }, ms);
  window.requestAnimationFrame = fn => {
    const id = realFrame(time => {
      if (gate.frozen) gate.queue.push({key: 'f' + id, run: () => fn(performance.now())}); else fn(time);
    });
    return id;
  };
  window.cancelAnimationFrame = id => { realCancelFrame(id); drop('f' + id); };
})()`;

/**
 * Installs a gate on the page's setTimeout / setInterval /
 * requestAnimationFrame. Install it BEFORE the animation under test starts:
 * only callbacks scheduled through the gate can be held. Event timestamps,
 * Date, performance.now and the Web Animations timeline are untouched.
 */
export async function installTimerGate(page: Page): Promise<void> {
  await page.evaluate(TIMER_GATE);
}

/**
 * Holds every gated timer and frame callback until `thawTimers`, so a
 * component cannot finish an animation behind a held storyboard's back (a
 * transitionend backstop timer, a cleanup render). Callbacks that come due
 * meanwhile run, in order, on thaw, unless the page cancels them first
 * (clearTimeout, cancelAnimationFrame); intervals skip their frozen ticks.
 */
export async function freezeTimers(page: Page): Promise<void> {
  await page.evaluate(() => {
    const gate = (window as unknown as {__harnessTimerGate?: {frozen: boolean}})
      .__harnessTimerGate;
    if (gate == null) {
      throw new Error(
        'freezeTimers: call installTimerGate before the animation starts',
      );
    }
    gate.frozen = true;
  });
}

/** Releases the gate: held callbacks run now, in the order they came due. */
export async function thawTimers(page: Page): Promise<void> {
  await page.evaluate(() => {
    const gate = (
      window as unknown as {
        __harnessTimerGate?: {
          frozen: boolean;
          queue: {key: string; run: () => void}[];
        };
      }
    ).__harnessTimerGate;
    if (gate == null) {
      return;
    }
    gate.frozen = false;
    // One at a time from the live queue: a callback may cancel a later one.
    while (gate.queue.length > 0) {
      gate.queue.shift()?.run();
    }
  });
}
