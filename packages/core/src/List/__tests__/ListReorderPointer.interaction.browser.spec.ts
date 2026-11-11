// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListReorderPointer.interaction.browser.spec.ts
 * @input The built List "Reorderable" story in two contexts: one with no
 *   touch screen, so the primary pointer is fine, and the touch phone. A real
 *   mouse and the harness's real engine pen drive it (the pen in Chromium)
 * @output Browser proofs of who drags a row without a hold. A mouse drags a
 *   row from its handle at once. So does a pen where the primary pointer is
 *   fine. A pen where the primary pointer is coarse keeps the hold, as a
 *   finger does. A quick stroke moves nothing, and a held one moves the row.
 *   A row held near a scroll edge scrolls the page, or the box the list
 *   scrolls in, and stops at the end. A wheel during a drag scrolls the
 *   page, and the preview and the drop stay under the pointer. Each scrolled
 *   frame reads the scroll offset once at most and forces no layout. A drop
 *   measures the rows in one pass, before its writes, whatever their count. A
 *   wheel at a box's end scrolls the page or a box around it, and the drop
 *   still lands under the pointer. The
 *   preview and the insertion line run along a row set in from the list's
 *   start, in either direction. A checked radio in the dragged row stays
 *   checked through the drag. With a mouse, the handle keeps a plain
 *   button's text selection and callout
 * @position Beside ListReorderTouch.interaction.browser.spec.ts, which proves
 *   the hold under a finger
 */

import {
  expect,
  test,
  type Browser,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  openStory,
  PEN_SKIP,
  webInputDriver,
  withStorybook,
  type PenPoint,
} from '@astryxdesign/interaction-harness';
import {reorder} from '../../motion/uikit/reorder';
import {describePasses, forcedPassesDuring, passesUnder} from './forcedPasses';

const storybook = withStorybook(test);

const STORY = 'core-list--reorderable';

const LONG_STORY = 'core-list--reorder-long-list';

/** Past the claim delay: the hold claims the drag. */
const HOLD_MS = reorder.claim.delayMs + 150;

/** The story's row labels, in order. */
async function labels(page: Page): Promise<string[]> {
  return page
    .locator('#storybook-root li:not([data-astryx-leaving])')
    .evaluateAll(rows => rows.map(row => row.textContent?.trim() ?? ''));
}

/** The centre of `label`'s handle and the height of its row. */
async function handleOf(page: Page, label: string) {
  const handle = page.getByRole('button', {name: `Reorder ${label}`});
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  const row = await handle
    .locator('xpath=ancestor::li[1]')
    .evaluate(element => element.getBoundingClientRect().height);
  if (box == null) {
    throw new Error(`no handle for ${label}`);
  }
  return {
    at: {x: box.x + box.width / 2, y: box.y + box.height / 2},
    rowHeight: row,
  };
}

/** The first row moved two places down: the order a two-row drag commits. */
function movedTwoDown(order: ReadonlyArray<string>): string[] {
  return [order[1], order[2], order[0], ...order.slice(3)];
}

/**
 * The story in a context with no touch screen, so the primary pointer is
 * fine. Contexts made here inherit the project's phone options unless they
 * are named.
 */
async function openFinePointerStory(browser: Browser, story = STORY) {
  const context = await browser.newContext({
    viewport: {width: 800, height: 900},
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  });
  const page = await context.newPage();
  await openStory(page, storybook(), story);
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(false);
  return {page, close: async () => context.close()};
}

/** A stroke from `at` straight down `distance`, a point every 16 ms. */
function strokeDown(
  at: {x: number; y: number},
  distance: number,
  startMs = 0,
): PenPoint[] {
  const steps = 16;
  return Array.from({length: steps + 1}, (_, step) => ({
    x: at.x,
    y: at.y + (distance * step) / steps,
    t: startMs + step * 16,
  }));
}

test('a mouse drags a row from its handle at once, where the primary pointer is fine', async ({
  browser,
}) => {
  const story = await openFinePointerStory(browser);
  try {
    const {page} = story;
    const before = await labels(page);
    expect(before.length).toBeGreaterThanOrEqual(3);
    const {at, rowHeight} = await handleOf(page, before[0]);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x, at.y + rowHeight * 2.5, {steps: 12});
    await page.mouse.up();
    await expect.poll(async () => labels(page)).toEqual(movedTwoDown(before));
  } finally {
    await story.close();
  }
});

test('a row held near the bottom of the page scrolls the page', async ({
  browser,
}) => {
  const story = await openFinePointerStory(browser, LONG_STORY);
  try {
    const {page} = story;
    const order = await labels(page);
    // Item 4: an earlier one's name is a prefix of a later row's.
    const {at} = await handleOf(page, order[3]);
    const bottom = await page.evaluate(() => window.innerHeight);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x, bottom - 4, {steps: 12});
    await expect
      .poll(async () => page.evaluate(() => window.scrollY), {timeout: 3000})
      .toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await page.mouse.up();
  } finally {
    await story.close();
  }
});

test('a row held at the bottom of the page stops at its end, under the pointer', async ({
  browser,
}) => {
  const story = await openFinePointerStory(browser, LONG_STORY);
  try {
    const {page} = story;
    const order = await labels(page);
    // Item 4: an earlier one's name is a prefix of a later row's.
    const {at} = await handleOf(page, order[3]);
    const viewport = page.viewportSize();
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x, (viewport?.height ?? 0) - 4, {steps: 12});
    // The page scrolls until the list's end is in view, then stops.
    let last = Number.NaN;
    await expect
      .poll(
        async () => {
          const y = await page.evaluate(() => window.scrollY);
          const isStill = y > 0 && y === last;
          last = y;
          return isStill;
        },
        {intervals: [250], timeout: 8000},
      )
      .toBe(true);
    const listBottom = await page.evaluate(
      () =>
        document.querySelector('#storybook-root ul')?.getBoundingClientRect()
          .bottom ?? Number.NaN,
    );
    expect(listBottom).toBeLessThanOrEqual(viewport?.height ?? 0);
    const previewTop = async () =>
      page.evaluate(
        () =>
          document
            .querySelector('[data-astryx-reorder-preview]')
            ?.getBoundingClientRect().top ?? Number.NaN,
      );
    const atEnd = await previewTop();
    await page.waitForTimeout(300);
    // Held at the end, nothing moves: the page stays where it stopped, and
    // the preview stays where the pointer holds it.
    expect(await page.evaluate(() => window.scrollY)).toBe(last);
    expect(Math.abs((await previewTop()) - atEnd)).toBeLessThan(1);
    await page.keyboard.press('Escape');
    await page.mouse.up();
  } finally {
    await story.close();
  }
});

test('a wheel during a drag scrolls the page, and the preview and the drop stay under the pointer', async ({
  browser,
}) => {
  const story = await openFinePointerStory(browser, LONG_STORY);
  try {
    const {page} = story;
    const order = await labels(page);
    // Item 4: an earlier one's name is a prefix of a later row's.
    const {at, rowHeight} = await handleOf(page, order[3]);
    const pitch = await page.evaluate(() => {
      const rows = document.querySelectorAll('#storybook-root ul > li');
      return (
        rows[1].getBoundingClientRect().top -
        rows[0].getBoundingClientRect().top
      );
    });
    // The preview's top and the insertion line's y, in the viewport.
    const placed = async () =>
      page.evaluate(() => {
        const list = document.querySelector<HTMLElement>('#storybook-root ul');
        const preview = document.querySelector('[data-astryx-reorder-preview]');
        const line = parseFloat(
          list == null
            ? ''
            : getComputedStyle(list).getPropertyValue(
                '--astryx-reorder-line-y',
              ),
        );
        return {
          preview: preview?.getBoundingClientRect().top ?? Number.NaN,
          line: (list?.getBoundingClientRect().top ?? Number.NaN) + line,
        };
      });
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x, at.y + rowHeight * 1.5, {steps: 8});
    await expect(page.locator('[data-astryx-reorder-preview]')).toHaveCount(1);
    const before = await placed();
    // Counts rendered frames from the last scroll to the first frame that
    // shows the preview and the line under the pointer again.
    await page.evaluate(target => {
      const state = {frame: 0, lastScroll: -1, settledAt: -1};
      Object.assign(window, {scrollFrames: state});
      const check = () => {
        if (state.lastScroll < 0 || state.settledAt >= 0) {
          return;
        }
        const list = document.querySelector<HTMLElement>('#storybook-root ul');
        const preview = document.querySelector('[data-astryx-reorder-preview]');
        if (list == null || preview == null) {
          return;
        }
        const line =
          list.getBoundingClientRect().top +
          parseFloat(
            getComputedStyle(list).getPropertyValue('--astryx-reorder-line-y'),
          );
        const top = preview.getBoundingClientRect().top;
        if (
          Math.abs(top - target.preview) < 1 &&
          Math.abs(line - target.line) < 1
        ) {
          state.settledAt = state.frame;
        }
      };
      const tick = () => {
        state.frame += 1;
        // After the frame renders.
        setTimeout(check, 0);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      document.addEventListener(
        'scroll',
        () => {
          // The scroll steps come before the frame's callbacks.
          state.lastScroll = state.frame + 1;
          state.settledAt = -1;
        },
        {passive: true},
      );
    }, before);
    await page.mouse.wheel(0, pitch * 3);
    // The wheel's scroll animates: wait for it to rest.
    let last = Number.NaN;
    await expect
      .poll(
        async () => {
          const y = await page.evaluate(() => window.scrollY);
          const isStill = y > 0 && y === last;
          last = y;
          return isStill;
        },
        {intervals: [100], timeout: 5000},
      )
      .toBe(true);
    const frames = async () =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              scrollFrames: {lastScroll: number; settledAt: number};
            }
          ).scrollFrames,
      );
    // The preview and the line come back under the pointer.
    await expect
      .poll(async () => (await frames()).settledAt >= 0, {timeout: 100})
      .toBe(true);
    const {lastScroll, settledAt} = await frames();
    // Within two frames of the scroll, as a native drag follows it.
    expect(settledAt - lastScroll).toBeLessThanOrEqual(2);
    await page.mouse.up();
    // The drop lands under the pointer, past the rows the wheel scrolled by.
    await expect
      .poll(async () => (await labels(page)).indexOf(order[3]), {
        timeout: 600,
      })
      .toBe(4 + Math.round(last / pitch));
  } finally {
    await story.close();
  }
});

test('a wheel during a drag forces no layout, and reads the scroll offset once a scrolled frame at most', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'the layout trace is Chromium CDP');
  const story = await openFinePointerStory(browser, LONG_STORY);
  try {
    const {page} = story;
    const order = await labels(page);
    // Item 4: an earlier one's name is a prefix of a later row's.
    const {at, rowHeight} = await handleOf(page, order[3]);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x, at.y + rowHeight * 1.5, {steps: 8});
    await expect(page.locator('[data-astryx-reorder-preview]')).toHaveCount(1);
    // Counts reads of the page scroller's offset, and the frames a scroll
    // lands in.
    await page.evaluate(() => {
      const scroller = document.scrollingElement as Element;
      const own = Object.getOwnPropertyDescriptor(
        Element.prototype,
        'scrollTop',
      );
      const counts = {reads: 0, frames: 0};
      Object.assign(window, {scrollCounts: counts});
      Object.defineProperty(scroller, 'scrollTop', {
        configurable: true,
        get() {
          counts.reads += 1;
          return own?.get?.call(this) as number;
        },
        set(value: number) {
          own?.set?.call(this, value);
        },
      });
      let isCounted = false;
      document.addEventListener(
        'scroll',
        () => {
          if (!isCounted) {
            isCounted = true;
            counts.frames += 1;
            requestAnimationFrame(() => {
              isCounted = false;
            });
          }
        },
        {passive: true},
      );
    });
    await browser.startTracing(page, {
      categories: [
        'devtools.timeline',
        'disabled-by-default-devtools.timeline',
        'disabled-by-default-devtools.timeline.stack',
      ],
    });
    await page.mouse.wheel(0, rowHeight * 3);
    // The pointer moves too, so moves and scrolls share frames.
    for (let step = 1; step <= 16; step += 1) {
      await page.mouse.move(at.x, at.y + rowHeight * 1.5 + step);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(400);
    const trace = JSON.parse((await browser.stopTracing()).toString()) as {
      traceEvents: {
        name: string;
        ph: string;
        pid: number;
        tid: number;
        args?: {
          name?: string;
          beginData?: {stackTrace?: {functionName?: string}[]};
        };
      }[];
    };
    const counts = await page.evaluate(
      () =>
        (window as unknown as {scrollCounts: {reads: number; frames: number}})
          .scrollCounts,
    );
    await page.mouse.up();
    const mainThreads = new Set(
      trace.traceEvents
        .filter(e => e.ph === 'M' && e.name === 'thread_name')
        .filter(e => e.args?.name === 'CrRendererMain')
        .map(e => `${e.pid}:${e.tid}`),
    );
    // A style or layout pass with a script stack ran inside script: a read
    // after a write forced it, instead of the frame's own pass.
    const forced = trace.traceEvents.filter(
      e =>
        (e.name === 'Layout' || e.name === 'UpdateLayoutTree') &&
        mainThreads.has(`${e.pid}:${e.tid}`) &&
        (e.args?.beginData?.stackTrace ?? []).length > 0,
    );
    expect(
      forced.map(
        e =>
          `${e.name} in ${e.args?.beginData?.stackTrace?.[0]?.functionName ?? '?'}`,
      ),
    ).toEqual([]);
    expect(counts.frames).toBeGreaterThan(0);
    expect(counts.reads).toBeGreaterThan(0);
    expect(counts.reads).toBeLessThanOrEqual(counts.frames);
  } finally {
    await story.close();
  }
});

test('a wheel at the end of a box during a drag forces no layout, and measures the box once a scrolled frame at most', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'the layout trace is Chromium CDP');
  const story = await openFinePointerStory(browser, LONG_STORY);
  try {
    const {page} = story;
    // The list scrolls in a 400 px box, scrolled to its end, on a page that
    // can scroll too.
    await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('#storybook-root');
      if (root == null) {
        return;
      }
      root.style.blockSize = '400px';
      root.style.overflowY = 'auto';
      const room = document.createElement('div');
      room.style.blockSize = '2000px';
      root.after(room);
      root.scrollTop = root.scrollHeight;
    });
    const order = await labels(page);
    const {at, rowHeight} = await handleOf(page, order[order.length - 4]);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x, at.y - rowHeight * 1.5, {steps: 8});
    await expect(page.locator('[data-astryx-reorder-preview]')).toHaveCount(1);
    // Counts the measures of the box, and the frames a scroll of the box or
    // the page lands in.
    await page.evaluate(() => {
      const box = document.querySelector<HTMLElement>('#storybook-root');
      if (box == null) {
        return;
      }
      const counts = {reads: 0, frames: 0};
      Object.assign(window, {boxCounts: counts});
      const measure = Element.prototype.getBoundingClientRect;
      box.getBoundingClientRect = function getBoundingClientRect() {
        counts.reads += 1;
        return measure.call(this);
      };
      let isCounted = false;
      document.addEventListener(
        'scroll',
        () => {
          if (!isCounted) {
            isCounted = true;
            counts.frames += 1;
            requestAnimationFrame(() => {
              isCounted = false;
            });
          }
        },
        {capture: true, passive: true},
      );
    });
    await browser.startTracing(page, {
      categories: [
        'devtools.timeline',
        'disabled-by-default-devtools.timeline',
        'disabled-by-default-devtools.timeline.stack',
      ],
    });
    // The box is at its end, so the wheel scrolls the page.
    await page.mouse.wheel(0, rowHeight * 2);
    // The pointer moves too, so moves and scrolls share frames.
    for (let step = 1; step <= 16; step += 1) {
      await page.mouse.move(at.x, at.y - rowHeight * 1.5 - step);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(400);
    const trace = JSON.parse((await browser.stopTracing()).toString()) as {
      traceEvents: {
        name: string;
        ph: string;
        pid: number;
        tid: number;
        args?: {
          name?: string;
          beginData?: {stackTrace?: {functionName?: string}[]};
        };
      }[];
    };
    const counts = await page.evaluate(
      () =>
        (window as unknown as {boxCounts: {reads: number; frames: number}})
          .boxCounts,
    );
    const scrollY = await page.evaluate(() => window.scrollY);
    await page.mouse.up();
    const mainThreads = new Set(
      trace.traceEvents
        .filter(e => e.ph === 'M' && e.name === 'thread_name')
        .filter(e => e.args?.name === 'CrRendererMain')
        .map(e => `${e.pid}:${e.tid}`),
    );
    // A style or layout pass with a script stack ran inside script: a read
    // after a write forced it, instead of the frame's own pass.
    const forced = trace.traceEvents.filter(
      e =>
        (e.name === 'Layout' || e.name === 'UpdateLayoutTree') &&
        mainThreads.has(`${e.pid}:${e.tid}`) &&
        (e.args?.beginData?.stackTrace ?? []).length > 0,
    );
    expect(
      forced.map(
        e =>
          `${e.name} in ${e.args?.beginData?.stackTrace?.[0]?.functionName ?? '?'}`,
      ),
    ).toEqual([]);
    expect(scrollY).toBeGreaterThan(rowHeight);
    expect(counts.frames).toBeGreaterThan(0);
    expect(counts.reads).toBeGreaterThan(0);
    expect(counts.reads).toBeLessThanOrEqual(counts.frames);
  } finally {
    await story.close();
  }
});

test('a drop measures the rows in one pass, before its writes, whatever their count', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'the layout trace is Chromium CDP');
  const story = await openFinePointerStory(browser, LONG_STORY);
  try {
    const {page} = story;
    const order = await labels(page);
    expect(order.length).toBeGreaterThanOrEqual(20);
    const {at, rowHeight} = await handleOf(page, order[3]);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x, at.y + rowHeight * 4.5, {steps: 12});
    await expect(page.locator('[data-astryx-reorder-preview]')).toHaveCount(1);
    const {passes, events, rounds} = await forcedPassesDuring(
      browser,
      page,
      async () => {
        await page.mouse.up();
        await expect.poll(async () => labels(page)).not.toEqual(order);
        // The commit's rebase runs before the next frame.
        await page.evaluate(
          async () =>
            new Promise(resolve => {
              requestAnimationFrame(() => requestAnimationFrame(resolve));
            }),
        );
      },
    );
    // The trace saw the drop: its release, and the page's rendering after it.
    expect(events.has('pointerup')).toBe(true);
    expect(rounds).toBeGreaterThan(0);
    // The reorder's own reads, in the drop and in its commit, are one
    // measurement pass at most. Moving the focused row makes React and the
    // browser force passes of their own, outside the reorder.
    const reorders = passesUnder(passes, ['drop', 'commit']);
    expect(reorders.length, describePasses(passes)).toBeLessThanOrEqual(1);
  } finally {
    await story.close();
  }
});

test('a row held near the bottom of a box the list scrolls in scrolls that box, not the page', async ({
  browser,
}) => {
  const story = await openFinePointerStory(browser, LONG_STORY);
  try {
    const {page} = story;
    // The list scrolls in a 400 px box instead of the page.
    const boxBottom = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('#storybook-root');
      if (root == null) {
        return null;
      }
      root.style.blockSize = '400px';
      root.style.overflowY = 'auto';
      return (
        root.getBoundingClientRect().top + root.clientTop + root.clientHeight
      );
    });
    expect(boxBottom).not.toBeNull();
    const order = await labels(page);
    // Item 4: an earlier one's name is a prefix of a later row's.
    const {at} = await handleOf(page, order[3]);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x, (boxBottom ?? 0) - 4, {steps: 12});
    await expect
      .poll(
        async () =>
          page.evaluate(
            () => document.querySelector('#storybook-root')?.scrollTop ?? 0,
          ),
        {timeout: 3000},
      )
      .toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.keyboard.press('Escape');
    await page.mouse.up();
  } finally {
    await story.close();
  }
});

for (const outer of [
  'the page',
  'the box around it',
  'the page under a fixed box',
  'the page under a stuck sticky box',
  'the page under a sticky box before it sticks',
] as const) {
  test(`a wheel at the end of a box the list scrolls in scrolls ${outer} during a drag, and the drop lands under the pointer`, async ({
    browser,
  }) => {
    const story = await openFinePointerStory(browser, LONG_STORY);
    try {
      const {page} = story;
      const wrapped = outer === 'the box around it';
      const fixed = outer === 'the page under a fixed box';
      const sticky = outer.includes('sticky');
      const spaced = outer.endsWith('before it sticks');
      // The list scrolls in a 400 px box, scrolled to its end. What is around
      // it can scroll too: the page, or a box that is the box's direct parent.
      // A fixed box, or a stuck sticky one, stays put while the page scrolls
      // under it. A sticky box below its sticking point moves with the page.
      await page.evaluate(
        ([inBox, isFixed, isSticky, isSpaced]) => {
          const root = document.querySelector<HTMLElement>('#storybook-root');
          if (root == null) {
            return;
          }
          root.style.blockSize = '400px';
          root.style.overflowY = 'auto';
          if (isFixed) {
            root.style.position = 'fixed';
            root.style.insetBlockStart = '0';
            root.style.insetInlineStart = '0';
            root.style.inlineSize = '800px';
          }
          if (isSticky) {
            root.style.position = 'sticky';
            root.style.insetBlockStart = '0';
          }
          if (isSpaced) {
            root.style.marginBlockStart = '300px';
          }
          if (inBox) {
            const around = document.createElement('div');
            around.id = 'reorder-around';
            around.style.blockSize = '600px';
            around.style.overflowY = 'auto';
            const room = document.createElement('div');
            room.style.blockSize = '2000px';
            root.before(around);
            around.append(root, room);
          } else {
            // Room inside the body, so a sticky box has room to stick.
            const room = document.createElement('div');
            room.style.blockSize = '2000px';
            root.after(room);
          }
          root.scrollTop = root.scrollHeight;
        },
        [wrapped, fixed, sticky, spaced] as const,
      );
      const order = await labels(page);
      const target = order[order.length - 4];
      const {at, rowHeight} = await handleOf(page, target);
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      await page.mouse.move(at.x, at.y - rowHeight * 1.5, {steps: 8});
      await expect(page.locator('[data-astryx-reorder-preview]')).toHaveCount(
        1,
      );
      // Two rows: what is around the box moves it up, and the pointer stays
      // over it.
      await page.mouse.wheel(0, rowHeight * 2);
      // Rendered frames, not time: the wheel's scroll would start within them.
      await page.evaluate(
        async () =>
          new Promise<void>(resolve => {
            let frames = 0;
            const tick = () => {
              frames += 1;
              if (frames >= 30) {
                resolve();
              } else {
                requestAnimationFrame(tick);
              }
            };
            requestAnimationFrame(tick);
          }),
      );
      // The box is at its end, so the wheel scrolls what is around it, as
      // browsers do.
      expect(
        await page.evaluate(
          inBox =>
            inBox
              ? (document.getElementById('reorder-around')?.scrollTop ?? 0)
              : window.scrollY,
          wrapped,
        ),
      ).toBeGreaterThan(rowHeight);
      const pointerY = at.y - rowHeight * 1.5;
      // The pointer is still over the box.
      const box = await page.locator('#storybook-root').boundingBox();
      if (box == null) {
        throw new Error('no box');
      }
      expect(box.y + box.height).toBeGreaterThan(pointerY);
      // The preview stays under the pointer as the box moves.
      const preview = await page
        .locator('[data-astryx-reorder-preview]')
        .boundingBox();
      if (preview == null) {
        throw new Error('no preview');
      }
      expect(preview.y).toBeLessThanOrEqual(pointerY);
      expect(preview.y + preview.height).toBeGreaterThanOrEqual(pointerY);
      await page.mouse.up();
      // The row lands under the pointer.
      await expect
        .poll(
          async () =>
            page.evaluate(
              ({label, y}) => {
                const row = Array.from(
                  document.querySelectorAll('#storybook-root ul > li'),
                ).find(element => element.textContent?.trim() === label);
                const box = row?.getBoundingClientRect();
                return box != null && box.top <= y && y <= box.bottom;
              },
              {label: target, y: pointerY},
            ),
          {message: 'the dropped row lands under the pointer', timeout: 600},
        )
        .toBe(true);
    } finally {
      await story.close();
    }
  });
}

test('a checked radio in the dragged row stays checked through the drag and a drop in place', async ({
  browser,
}) => {
  const story = await openFinePointerStory(browser);
  try {
    const {page} = story;
    // Each row holds a radio of one group, and the first row's is checked.
    await page.evaluate(() => {
      const rows = document.querySelectorAll('#storybook-root ul > li');
      rows.forEach((row, index) => {
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'pick';
        radio.value = String(index);
        radio.checked = index === 0;
        row.append(radio);
      });
    });
    const checked = async () =>
      page.evaluate(() =>
        Array.from(
          document.querySelectorAll<HTMLInputElement>(
            '#storybook-root ul > li:not([data-astryx-leaving]) input[type="radio"]',
          ),
          radio => radio.checked,
        ),
      );
    const order = await labels(page);
    const {at, rowHeight} = await handleOf(page, order[0]);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x, at.y + rowHeight * 0.4, {steps: 4});
    await expect(page.locator('[data-astryx-reorder-preview]')).toHaveCount(1);
    const during = await checked();
    // Back to its place, and dropped there.
    await page.mouse.move(at.x, at.y, {steps: 4});
    await page.mouse.up();
    await expect(page.locator('[data-astryx-reorder-preview]')).toHaveCount(0);
    const after = await checked();
    expect(await labels(page)).toEqual(order);
    expect(during[0], 'during the drag').toBe(true);
    expect(after[0], 'after the drop').toBe(true);
    expect(after.filter(Boolean)).toHaveLength(1);
  } finally {
    await story.close();
  }
});

for (const dir of ['ltr', 'rtl'] as const) {
  test(`${dir}: the preview and the insertion line run along a dragged row set in from the list's start`, async ({
    browser,
  }) => {
    const story = await openFinePointerStory(browser);
    try {
      const {page} = story;
      // Each row is set in 32 px from the list's inline start.
      await page.evaluate(direction => {
        const list = document.querySelector<HTMLElement>('#storybook-root ul');
        if (list == null) {
          return;
        }
        list.dir = direction;
        for (const row of Array.from(list.children)) {
          (row as HTMLElement).style.marginInlineStart = '32px';
        }
      }, dir);
      const before = await labels(page);
      const {at, rowHeight} = await handleOf(page, before[0]);
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      await page.mouse.move(at.x, at.y + rowHeight * 1.5, {steps: 8});
      const edges = await page.evaluate(() => {
        const list = document.querySelector<HTMLElement>('#storybook-root ul');
        const row = document.querySelector<HTMLElement>(
          '#storybook-root [data-astryx-reorder-source]',
        );
        const preview = document.querySelector<HTMLElement>(
          '#storybook-root [data-astryx-reorder-preview]',
        );
        if (list == null || row == null || preview == null) {
          return null;
        }
        const after = getComputedStyle(list, '::after');
        const listBox = list.getBoundingClientRect();
        const start = parseFloat(after.insetInlineStart);
        const width = parseFloat(after.width);
        // The line's own edges in the viewport, from its inline start.
        const lineLeft =
          list.dir === 'rtl'
            ? listBox.right - list.clientLeft - start - width
            : listBox.left + list.clientLeft + start;
        const rowBox = row.getBoundingClientRect();
        const previewBox = preview.getBoundingClientRect();
        return {
          row: [rowBox.left, rowBox.right],
          preview: [previewBox.left, previewBox.right],
          line: [lineLeft, lineLeft + width],
        };
      });
      await page.keyboard.press('Escape');
      await page.mouse.up();
      expect(edges).not.toBeNull();
      for (const part of ['preview', 'line'] as const) {
        const [left, right] = edges?.[part] ?? [NaN, NaN];
        const [rowLeft, rowRight] = edges?.row ?? [NaN, NaN];
        expect(Math.abs(left - rowLeft), `${part} left`).toBeLessThan(1);
        expect(Math.abs(right - rowRight), `${part} right`).toBeLessThan(1);
      }
    } finally {
      await story.close();
    }
  });
}

for (const dir of ['ltr', 'rtl'] as const) {
  test(`${dir}: the insertion line runs along the dragged row in a list set in from its container`, async ({
    browser,
  }) => {
    const story = await openFinePointerStory(browser);
    try {
      const {page} = story;
      // The list sits 40 px in from its container, which stays its offset
      // parent until a drag positions the list.
      await page.evaluate(direction => {
        const list = document.querySelector<HTMLElement>('#storybook-root ul');
        if (list != null) {
          list.dir = direction;
          list.style.marginInlineStart = '40px';
        }
      }, dir);
      const before = await labels(page);
      const {at, rowHeight} = await handleOf(page, before[0]);
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      await page.mouse.move(at.x, at.y + rowHeight * 1.5, {steps: 8});
      const line = await page.evaluate(() => {
        const list = document.querySelector<HTMLElement>('#storybook-root ul');
        const row = document.querySelector<HTMLElement>(
          '#storybook-root [data-astryx-reorder-source]',
        );
        if (list == null || row == null) {
          return null;
        }
        const after = getComputedStyle(list, '::after');
        const listBox = list.getBoundingClientRect();
        const rowBox = row.getBoundingClientRect();
        const start = parseFloat(after.insetInlineStart);
        const width = parseFloat(after.width);
        // The line's own edges in the viewport, from its inline start.
        const left =
          list.dir === 'rtl'
            ? listBox.right - list.clientLeft - start - width
            : listBox.left + list.clientLeft + start;
        return {
          left,
          right: left + width,
          rowLeft: rowBox.left,
          rowRight: rowBox.right,
        };
      });
      await page.keyboard.press('Escape');
      await page.mouse.up();
      expect(line).not.toBeNull();
      expect(
        Math.abs((line?.left ?? NaN) - (line?.rowLeft ?? NaN)),
      ).toBeLessThan(1);
      expect(
        Math.abs((line?.right ?? NaN) - (line?.rowRight ?? NaN)),
      ).toBeLessThan(1);
    } finally {
      await story.close();
    }
  });
}

test('a pen drags a row from its handle at once, as a mouse does, where the primary pointer is fine', async ({
  browser,
}) => {
  const story = await openFinePointerStory(browser);
  try {
    const {page} = story;
    const driver = await webInputDriver(page);
    test.skip(!driver.pens, PEN_SKIP);
    const before = await labels(page);
    expect(before.length).toBeGreaterThanOrEqual(3);
    const {at, rowHeight} = await handleOf(page, before[0]);
    await driver.pen(strokeDown(at, rowHeight * 2.5));
    await expect.poll(async () => labels(page)).toEqual(movedTwoDown(before));
  } finally {
    await story.close();
  }
});

test('a pen keeps the hold where the primary pointer is coarse: a quick stroke moves nothing, and a held one moves the row', async ({
  page,
}) => {
  await openStory(page, storybook(), STORY);
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(true);
  const driver = await webInputDriver(page);
  test.skip(!driver.pens, PEN_SKIP);
  const before = await labels(page);
  expect(before.length).toBeGreaterThanOrEqual(3);
  const {at, rowHeight} = await handleOf(page, before[0]);
  await driver.pen(strokeDown(at, rowHeight * 2.5));
  await page.waitForTimeout(300);
  expect(await labels(page)).toEqual(before);
  // The same stroke, after the pen rests on the handle past the claim delay.
  await driver.pen([
    {x: at.x, y: at.y, t: 0},
    ...strokeDown(at, rowHeight * 2.5, HOLD_MS),
  ]);
  await expect.poll(async () => labels(page)).toEqual(movedTwoDown(before));
});

test("with a mouse the handle keeps a plain button's text selection and callout", async ({
  browser,
}) => {
  const story = await openFinePointerStory(browser);
  try {
    const {page} = story;
    const handle = page.getByRole('button', {name: 'Reorder Inbox'});
    await expect(handle).toBeVisible();
    const styles = await handle.evaluate(element => {
      const read = (el: Element) => {
        const style = getComputedStyle(el) as CSSStyleDeclaration & {
          webkitUserSelect?: string;
        };
        return {
          userSelect: style.userSelect,
          webkitUserSelect: style.webkitUserSelect ?? '',
          callout: style.getPropertyValue('-webkit-touch-callout'),
        };
      };
      const plain = document.createElement('button');
      element.parentElement?.append(plain);
      const result = {handle: read(element), plain: read(plain)};
      plain.remove();
      return result;
    });
    // No style of its own: a held finger's lock comes from the gesture host.
    // Chromium has no `-webkit-touch-callout`, so that value is compared in
    // WebKit only.
    expect(styles.handle).toEqual(styles.plain);
  } finally {
    await story.close();
  }
});
