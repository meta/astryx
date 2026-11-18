// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListReorderTouch.interaction.browser.spec.ts
 * @input The built List reorder stories and real touch input through the
 *   interaction harness (Chromium CDP or WebKit's input command). Also the
 *   claim delay from the UIKit constants table (motion/uikit/reorder.ts)
 * @output Interaction proofs for a reorderable List under a finger. A hold on
 *   a handle then a drag moves the row, and the drop settles it into its new
 *   place. While the finger holds the drag, the rows stay still, the source
 *   dims, a preview follows and an insertion line marks the drop position. A
 *   flick on a handle scrolls and moves nothing. A cancelled drag puts the
 *   row back. With Reduce Motion the drop takes its place without travel. A
 *   flush row's handle stays inside the list. A finger held on a handle
 *   refuses text selection on the list until it lifts. A drag that crosses
 *   rows forces no style or layout pass, and neither does the pick-up. A
 *   drop measures the rows in one pass, before their glides start. The
 *   preview follows the finger one to one and stops at the list's top. The
 *   drop's glides keep moving while the main thread is blocked. A focused
 *   handle shows one whole ring. Its finger target grows toward 44 pt and
 *   stops halfway to the next one's, and its row is no taller for it
 * @position Interaction evidence for List's reorder (List/listReorderEngine.tsx,
 *   List/ListReorderTouch.ts, List/ListReorderHandle.tsx) in the touch phone
 *   context
 */

import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  blockMainThread,
  busyWindowProof,
  castStep,
  controlColor,
  drag,
  flick,
  holdThenDrag,
  markElement,
  MARKER_RGB,
  openStory,
  requireFrames,
  startBusyControl,
  startScreencast,
  toTouchEvents,
  touchDriver,
  trackMarkers,
  withStorybook,
  writeEvidence,
  type TouchEventStep,
} from '@astryxdesign/interaction-harness';
import {solveSpring, toSpring} from '../../motion/spring';
import {reorder} from '../../motion/uikit/reorder';
import {springs} from '../../motion/uikit/springs';
import {describePasses, forcedPassesDuring, passesUnder} from './forcedPasses';

const storybook = withStorybook(test);

/** Past the claim delay: the hold claims the drag. */
const HOLD_MS = reorder.claim.delayMs + 150;
/**
 * Long enough for a drop's glide to settle: it plays the shared settle role,
 * springs.settle (spec:AST-105 FR4).
 */
const SETTLE_MS =
  solveSpring(toSpring(springs.settle), {from: 0, to: 1}).settleTime(0.001) *
    1000 +
  300;

const isTouch = async (page: Page) =>
  page.evaluate(() => matchMedia('(pointer: coarse)').matches);

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

/**
 * A hold on `at` then a drag to `to`, all but the lift, sent through
 * Chromium's CDP on the script's own clock. The harness's player takes only
 * scripts that end with every finger lifted. Resolves when the lift would
 * have come, with the session that ends the touch.
 */
async function holdAndDragWithoutLift(
  page: Page,
  at: {x: number; y: number},
  to: {x: number; y: number},
): Promise<CDPSession> {
  const events = toTouchEvents(
    holdThenDrag(at, to, {holdMs: HOLD_MS, durationMs: 400, restMs: 120}),
  );
  const lift = events[events.length - 1];
  const cdp = await page.context().newCDPSession(page);
  let now = 0;
  for (const step of events.slice(0, -1)) {
    await page.waitForTimeout(step.t - now);
    now = step.t;
    await cdp.send('Input.dispatchTouchEvent', {
      type: step.type,
      touchPoints: step.fingers.map(f => ({
        x: f.x,
        y: f.y,
        id: f.id,
        radiusX: 1,
        radiusY: 1,
        force: 1,
      })),
    });
  }
  await page.waitForTimeout(lift.t - now);
  return cdp;
}

/** The layout top of each row, by label, once nothing animates. */
async function settledTops(page: Page): Promise<Record<string, number>> {
  return page
    .locator('#storybook-root li:not([data-astryx-leaving])')
    .evaluateAll(rows => {
      const tops: Record<string, number> = {};
      for (const row of rows) {
        tops[row.textContent?.trim() ?? ''] = Math.round(
          row.getBoundingClientRect().top,
        );
      }
      return tops;
    });
}

test.describe('under a finger', () => {
  test.beforeEach(async ({page}) => {
    await openStory(page, storybook(), 'core-list--reorderable');
    test.skip(
      !(await isTouch(page)),
      'this engine reports a fine primary pointer; the touch hold applies under (pointer: coarse)',
    );
  });

  test('a hold on a handle then a drag moves the row, and the drop settles it into its new place', async ({
    page,
  }) => {
    const before = await settledTops(page);
    const {at, rowHeight} = await handleOf(page, 'Inbox');
    const driver = await touchDriver(page);
    await driver.play(
      holdThenDrag(
        at,
        {x: at.x, y: at.y + rowHeight * 2},
        {holdMs: HOLD_MS, durationMs: 400, restMs: 120},
      ),
    );
    await page.waitForTimeout(SETTLE_MS);
    expect(await labels(page)).toEqual([
      'Sent',
      'Drafts',
      'Inbox',
      'Archive',
      'Spam',
      'Trash',
    ]);
    // Settled: the dropped row sits in the third place, nothing moving.
    const after = await settledTops(page);
    expect(after.Inbox).toBe(before.Drafts);
    expect(
      await page
        .locator('#storybook-root li')
        .evaluateAll(rows =>
          rows.some(row =>
            row
              .getAnimations({subtree: true})
              .some(animation => animation.playState === 'running'),
          ),
        ),
    ).toBe(false);
  });

  test('while the finger holds a drag, the rows stay still: the source dims in place, a preview follows, and an insertion line marks the drop position', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'the held finger lifts through Chromium CDP',
    );
    const before = await settledTops(page);
    const {at, rowHeight} = await handleOf(page, 'Inbox');
    const cdp = await holdAndDragWithoutLift(page, at, {
      x: at.x,
      y: at.y + rowHeight * 2,
    });
    expect(await settledTops(page)).toEqual(before);
    const state = await page.evaluate(() => {
      const source = document.querySelector<HTMLElement>(
        '[data-astryx-reorder-source]',
      );
      const preview = document.querySelector<HTMLElement>(
        '[data-astryx-reorder-preview]',
      );
      // The insertion line is the list's own ::after (no element joins the
      // list), placed by a translate from the list's padding box.
      const list = document.querySelector<HTMLElement>('#storybook-root ul');
      const line = list == null ? null : getComputedStyle(list, '::after');
      const lineY =
        line == null ? Number.NaN : parseFloat(line.translate.split(' ')[1]);
      return {
        sourceOpacity: source == null ? null : getComputedStyle(source).opacity,
        previewTop: preview?.getBoundingClientRect().top ?? null,
        lineShown: line != null && line.display !== 'none',
        lineTop:
          list == null
            ? null
            : list.getBoundingClientRect().top + list.clientTop + lineY,
      };
    });
    expect(Number(state.sourceOpacity)).toBeLessThan(1);
    expect(state.previewTop).toBeGreaterThan(before.Inbox + rowHeight);
    expect(state.lineShown).toBe(true);
    // In the gap after Drafts, where Inbox would land.
    expect(
      Math.abs((state.lineTop ?? Number.NaN) - (before.Drafts + rowHeight)),
    ).toBeLessThan(4);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await page.waitForTimeout(SETTLE_MS);
    expect(await labels(page)).toEqual([
      'Sent',
      'Drafts',
      'Inbox',
      'Archive',
      'Spam',
      'Trash',
    ]);
    expect(
      await page.evaluate(
        () =>
          document.querySelector(
            '[data-astryx-reorder-preview], [data-astryx-reorder-line]',
          ) == null,
      ),
    ).toBe(true);
  });

  test('picking a row up forces no style or layout pass before its first frame', async ({
    page,
    browser,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'the layout trace and the held finger go through Chromium CDP',
    );
    const {at} = await handleOf(page, 'Inbox');
    const cdp = await page.context().newCDPSession(page);
    const touch = async (
      type: 'touchStart' | 'touchMove' | 'touchEnd',
      y?: number,
    ) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints:
          y == null
            ? []
            : [{x: at.x, y, id: 1, radiusX: 1, radiusY: 1, force: 1}],
      });
    await touch('touchStart', at.y);
    // The trace starts after the touch lands, and before the hold picks the
    // row up.
    await browser.startTracing(page, {
      categories: [
        'devtools.timeline',
        'disabled-by-default-devtools.timeline',
        'disabled-by-default-devtools.timeline.stack',
      ],
    });
    await page.waitForTimeout(HOLD_MS);
    await touch('touchMove', at.y + 4);
    await expect(page.locator('[data-astryx-reorder-preview]')).toHaveCount(1);
    await page.waitForTimeout(100);
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
    await touch('touchEnd');
    await page.waitForTimeout(SETTLE_MS);
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
  });

  test('a drag forces no style or layout pass as it crosses rows', async ({
    page,
    browser,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'the layout trace and the held finger go through Chromium CDP',
    );
    const {at, rowHeight} = await handleOf(page, 'Inbox');
    const cdp = await page.context().newCDPSession(page);
    const touch = async (
      type: 'touchStart' | 'touchMove' | 'touchEnd',
      y?: number,
    ) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints:
          y == null
            ? []
            : [{x: at.x, y, id: 1, radiusX: 1, radiusY: 1, force: 1}],
      });
    await touch('touchStart', at.y);
    await page.waitForTimeout(HOLD_MS);
    await touch('touchMove', at.y + 4);
    await expect(page.locator('[data-astryx-reorder-preview]')).toHaveCount(1);
    // Only the crossings are traced: the pick-up reads the rows once.
    await browser.startTracing(page, {
      categories: [
        'devtools.timeline',
        'disabled-by-default-devtools.timeline',
        'disabled-by-default-devtools.timeline.stack',
      ],
    });
    for (let step = 1; step <= 24; step += 1) {
      await touch('touchMove', at.y + 4 + (rowHeight * 3 * step) / 24);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(150);
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
    await touch('touchEnd');
    await page.waitForTimeout(SETTLE_MS);
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
    // The drag did cross: Inbox lands three rows down.
    expect((await labels(page)).indexOf('Inbox')).toBe(3);
  });

  test('a drop measures the rows in one pass, before their glides start', async ({
    page,
    browser,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'the layout trace is Chromium CDP');
    const {at, rowHeight} = await handleOf(page, 'Inbox');
    const driver = await touchDriver(page);
    const {passes, events, rounds} = await forcedPassesDuring(
      browser,
      page,
      async () => {
        await driver.play(
          holdThenDrag(
            at,
            {x: at.x, y: at.y + rowHeight * 3},
            {holdMs: HOLD_MS, durationMs: 400, restMs: 120},
          ),
        );
        await expect.poll(async () => (await labels(page))[0]).toBe('Sent');
        // The commit's glides start before the next frame.
        await page.evaluate(
          async () =>
            new Promise(resolve => {
              requestAnimationFrame(() => requestAnimationFrame(resolve));
            }),
        );
      },
    );
    // The trace saw the drop: the finger's lift, and the rendering after it.
    expect(events.has('pointerup')).toBe(true);
    expect(rounds).toBeGreaterThan(0);
    // The drop's own reads, in the drop and in the commit that applies it,
    // are one measurement pass at most.
    expect(
      passesUnder(passes, ['drop', 'commit']).length,
      describePasses(passes),
    ).toBeLessThanOrEqual(1);
  });

  test('a cancelled drag puts the row back and moves nothing', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'the cancel is a touchcancel through Chromium CDP',
    );
    const before = await settledTops(page);
    const {at, rowHeight} = await handleOf(page, 'Inbox');
    // The cancel comes when the lift would have.
    const cdp = await holdAndDragWithoutLift(page, at, {
      x: at.x,
      y: at.y + rowHeight * 2,
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchCancel',
      touchPoints: [],
    });
    await page.waitForTimeout(SETTLE_MS);
    expect(await labels(page)).toEqual([
      'Inbox',
      'Sent',
      'Drafts',
      'Archive',
      'Spam',
      'Trash',
    ]);
    expect((await settledTops(page)).Inbox).toBe(before.Inbox);
  });

  test('with Reduce Motion the drop takes its place without travel', async ({
    page,
  }) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    const before = await settledTops(page);
    const {at, rowHeight} = await handleOf(page, 'Inbox');
    const driver = await touchDriver(page);
    await driver.play(
      holdThenDrag(
        at,
        {x: at.x, y: at.y + rowHeight * 2},
        {holdMs: HOLD_MS, durationMs: 400, restMs: 120},
      ),
    );
    // Two frames after the lift: already in place, nothing travelling.
    await page.evaluate(
      async () =>
        new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(await labels(page)).toEqual([
      'Sent',
      'Drafts',
      'Inbox',
      'Archive',
      'Spam',
      'Trash',
    ]);
    expect((await settledTops(page)).Inbox).toBe(before.Drafts);
    // Nothing travels. A running animation may only fade: the rows the drop
    // passed take Reduce Motion's opacity dip in their new places
    // (design:reduced-motion), and none moves.
    expect(
      await page
        .locator('#storybook-root li')
        .evaluateAll(rows =>
          rows.some(row =>
            row
              .getAnimations({subtree: true})
              .some(
                animation =>
                  animation.playState === 'running' &&
                  animation.effect instanceof KeyframeEffect &&
                  animation.effect
                    .getKeyframes()
                    .some(frame =>
                      ['translate', 'transform', 'top', 'insetBlockStart'].some(
                        property => frame[property] != null,
                      ),
                    ),
              ),
          ),
        ),
    ).toBe(false);
  });
});

test.describe('a row that reorders and has a menu', () => {
  test.beforeEach(async ({page, browserName}) => {
    await openStory(page, storybook(), 'core-list--reorder-from-your-ui');
    test.skip(
      !(await isTouch(page)),
      'this engine reports a fine primary pointer; the touch hold applies under (pointer: coarse)',
    );
    test.skip(
      browserName !== 'chromium',
      'the held finger lifts through Chromium CDP',
    );
  });

  /** A finger held still at `at` for `ms`, read while it is down, then lifted. */
  async function holdStill(
    page: Page,
    at: {x: number; y: number},
    ms: number,
  ): Promise<{picked: boolean; menu: boolean}> {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        {x: at.x, y: at.y, id: 0, radiusX: 1, radiusY: 1, force: 1},
      ],
    });
    await page.waitForTimeout(ms);
    const held = await page.evaluate(() => ({
      picked: document.querySelector('[data-astryx-reorder-preview]') != null,
      menu: Array.from(document.querySelectorAll('[role="menu"]')).some(
        element => element.getBoundingClientRect().height > 0,
      ),
    }));
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    return held;
  }

  const menuShown = async (page: Page) =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="menu"]')).some(
        element => element.getBoundingClientRect().height > 0,
      ),
    );

  test('a finger held on a handle refuses a text selection on the list from its touch-down until it lifts', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'the held finger lifts through Chromium CDP',
    );
    const {at} = await handleOf(page, 'Inbox');
    // A selection that starts on another row: the lock covers the whole list.
    const refused = async () =>
      page.evaluate(() => {
        const row = Array.from(
          document.querySelectorAll('#storybook-root li'),
        ).find(element => element.textContent?.trim() === 'Sent');
        const event = new Event('selectstart', {
          bubbles: true,
          cancelable: true,
        });
        row?.dispatchEvent(event);
        return event.defaultPrevented;
      });
    expect(await refused()).toBe(false);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        {x: at.x, y: at.y, id: 0, radiusX: 1, radiusY: 1, force: 1},
      ],
    });
    // Before the hold claims the drag, as when iOS starts its own selection.
    expect(await refused()).toBe(true);
    await page.waitForTimeout(HOLD_MS);
    expect(await refused()).toBe(true);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await page.waitForTimeout(SETTLE_MS);
    expect(await refused()).toBe(false);
  });

  test('a hold on the reorder handle picks the row up and opens no menu', async ({
    page,
  }) => {
    const order = await labels(page);
    const {at} = await handleOf(page, 'Inbox');
    // Held still past the row menu's long press (500 ms).
    const held = await holdStill(page, at, 800);
    expect(held.picked).toBe(true);
    expect(held.menu).toBe(false);
    await page.waitForTimeout(SETTLE_MS);
    expect(await menuShown(page)).toBe(false);
    expect(await labels(page)).toEqual(order);
  });

  test('a hold anywhere else on the row opens its menu and picks nothing up', async ({
    page,
  }) => {
    const row = page
      .locator('#storybook-root li:not([data-astryx-leaving])')
      .filter({hasText: 'Inbox'})
      .first();
    const box = await row.boundingBox();
    if (box == null) {
      throw new Error('no row');
    }
    const held = await holdStill(
      page,
      {x: box.x + 40, y: box.y + box.height / 2},
      800,
    );
    expect(held.picked).toBe(false);
    expect(held.menu).toBe(true);
    await page.keyboard.press('Escape');
  });
});

test('a flick on a handle scrolls the page and moves nothing', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-list--reorder-long-list');
  test.skip(
    !(await isTouch(page)),
    'this engine reports a fine primary pointer; the touch hold applies under (pointer: coarse)',
  );
  const order = await labels(page);
  const {at} = await handleOf(page, 'Item 8');
  const driver = await touchDriver(page);
  test.skip(
    !driver.drivesNativeGestures,
    "this engine's injected touches drive no native scroll (the harness's drivesNativeGestures)",
  );
  const scrolled = await page.evaluate(() => window.scrollY);
  await driver.play(flick(at, {velocity: {x: 0, y: -1500}}));
  await page.waitForTimeout(SETTLE_MS);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(scrolled);
  expect(await labels(page)).toEqual(order);
});

test('a flush row keeps its handle inside the list', async ({page}) => {
  await openStory(page, storybook(), 'core-list--reorder-flush');
  const handle = page.getByRole('button', {name: 'Reorder Inbox'});
  await expect(handle).toBeVisible();
  const [handleBox, listBox] = await Promise.all([
    handle.boundingBox(),
    page.locator('#storybook-root ul').first().boundingBox(),
  ]);
  if (handleBox == null || listBox == null) {
    throw new Error('no handle or list');
  }
  expect(handleBox.x + handleBox.width).toBeLessThanOrEqual(
    listBox.x + listBox.width + 0.5,
  );
});

/** The dragged row's preview, which follows the finger. */
const PREVIEW = '[data-astryx-reorder-preview]';

const rowOf = (page: Page, label: string) =>
  page
    .locator('#storybook-root li:not([data-astryx-leaving])')
    .filter({hasText: label})
    .first();

const topOf = async (element: Locator) =>
  element.evaluate(el => el.getBoundingClientRect().top);

/** The distance from one row's top to the next row's. */
async function pitchOf(page: Page): Promise<number> {
  return rowOf(page, 'Inbox').evaluate(el => {
    const row = el as HTMLElement;
    const next = row.nextElementSibling as HTMLElement | null;
    return next == null ? row.offsetHeight : next.offsetTop - row.offsetTop;
  });
}

/**
 * Films `marked` while a drag of `travel` rows runs, released at once. The
 * page blocks its own main thread for `blockMs` once the row's glide has run
 * 50 ms on its clock. A block in its first frames would hold the start, by
 * design. The compositor's busy control moves through the block too, so the
 * cast keeps delivering frames while the row stands still. The evidence is
 * written under `evidence`, and `during` names the glide for a starved run.
 */
async function busyProof(
  page: Page,
  marked: Locator,
  travel: number,
  {
    blockMs,
    durationMs = 160,
    evidence,
    during,
  }: {blockMs: number; durationMs?: number; evidence: string; during: string},
) {
  const pitch = await pitchOf(page);
  const {at: from} = await handleOf(page, 'Inbox');
  const unmark = await markElement(marked);
  // Before the glide, so the control is on the compositor first.
  await startBusyControl(page);
  const cast = await startScreencast(page);
  const driver = await touchDriver(page);
  const blocking = blockMainThread(page, blockMs, {
    during: marked,
    minProgressMs: 50,
    property: 'translate',
  });
  await driver.play(
    drag(
      from,
      {x: from.x, y: from.y + travel * pitch},
      {holdMs: HOLD_MS, durationMs, restMs: 150},
    ),
  );
  const block = await blocking;
  // The frames after the lift, which the proof judges.
  await page.waitForTimeout(300);
  const frames = await cast.stop();
  await unmark();
  // The frames on which the compositor presented a new position of the
  // control, searched for in its own strip. The control moves on every frame
  // the machine draws, whatever the row does.
  const [tracked, control] = await trackMarkers(page, frames, {
    colors: [MARKER_RGB, controlColor()],
  });
  const presented = control.filter((frame, i) => {
    const before = control[i - 1]?.box;
    return frame.box != null && before != null && frame.box.x !== before.x;
  });
  const write = async (record: unknown) =>
    writeEvidence(
      `busy-main-thread/${evidence}`,
      {[`${test.info().project.name}.json`]: JSON.stringify(record, null, 1)},
      test.info(),
    );
  // The evidence is written whether the proof returns or throws.
  let proof: ReturnType<typeof busyWindowProof>;
  try {
    proof = busyWindowProof(tracked, block, {
      axis: 'y',
      settledWithin: 2 * castStep(tracked, 'y'),
    });
  } catch (error) {
    await write({block, error: String(error)});
    throw error;
  }
  await write(proof);
  // The checks count three changes of the row, which need four frames in the
  // judged part. Fewer frames of the control there mean a starved run, which
  // fails here by name. A row that stood still while the control moved fails
  // the checks instead.
  requireFrames(presented, {
    min: 4,
    during,
    where: frame => frame.t >= proof.judged.from && frame.t <= proof.judged.to,
  });
  return proof;
}

test.describe('the preview, the drop and the handle under a finger', () => {
  test.beforeEach(async ({page}) => {
    await openStory(page, storybook(), 'core-list--reorderable');
    test.skip(
      !(await isTouch(page)),
      'this engine reports a fine primary pointer; the touch hold applies under (pointer: coarse)',
    );
  });

  test('after the hold the preview follows the finger one to one and stops with its top at the list top, while the row stays in place', async ({
    page,
  }) => {
    const archive = rowOf(page, 'Archive');
    const {at: from} = await handleOf(page, 'Archive');
    const start = await topOf(archive);
    const listTop = await topOf(page.locator('#storybook-root ul').first());
    const height = await archive.evaluate(
      el => (el as HTMLElement).offsetHeight,
    );
    const driver = await touchDriver(page);
    const errors: number[] = [];
    const stayed: number[] = [];
    const last: {top: number | null} = {top: null};
    // Down 80 px, then far up past the list's top, without a lift between.
    const down = drag(
      from,
      {x: from.x, y: from.y + 80},
      {holdMs: HOLD_MS, durationMs: 300},
    ).slice(0, -1);
    const up = drag(
      {x: from.x, y: from.y + 80},
      {x: from.x, y: 0},
      {durationMs: 300, restMs: 100},
    );
    const offset = down[down.length - 1].t;
    await driver.play(
      [...down, ...up.slice(1).map(frame => ({...frame, t: frame.t + offset}))],
      {
        onEvent: async (step: TouchEventStep) => {
          if (step.type !== 'touchMove' || step.t < HOLD_MS + 20) {
            return;
          }
          const top = await page.evaluate(
            selector =>
              document.querySelector(selector)?.getBoundingClientRect().top ??
              null,
            PREVIEW,
          );
          if (top == null) {
            return;
          }
          stayed.push((await topOf(archive)) - start);
          last.top = top;
          const finger = step.fingers[0].y;
          if (finger > from.y - 40) {
            errors.push(top - start - (finger - from.y));
          }
        },
      },
    );
    expect(errors.length).toBeGreaterThan(5);
    for (const error of errors) {
      expect(Math.abs(error)).toBeLessThan(1);
    }
    // The row itself never leaves its place.
    for (const moved of stayed) {
      expect(Math.abs(moved)).toBeLessThan(0.5);
    }
    // The preview stops with its top on the list's top, never over what is
    // above the list. At the visible edge itself its centre stops there.
    expect(last.top).toBeCloseTo(Math.max(listTop, -height / 2), 0);
  });

  test('the rows the drop moves keep gliding while the main thread is blocked', async ({
    page,
  }) => {
    // Inbox passes Sent, Drafts and Archive in one move, and the finger lifts
    // below them. On the drop, Sent glides up a row while script cannot run.
    const proof = await busyProof(page, rowOf(page, 'Sent'), 3.2, {
      blockMs: 200,
      durationMs: 16,
      evidence: 'list-reorder-slide',
      during: 'Sent glides up a row while the page is blocked',
    });
    expect(proof.changed, JSON.stringify(proof)).toBeGreaterThanOrEqual(3);
    expect(proof.monotonic, JSON.stringify(proof)).toBe(true);
  });

  test('the dropped row keeps gliding while the main thread is blocked', async ({
    page,
  }) => {
    // Released a row and a half down, Inbox glides from where its preview was
    // into its new place.
    const proof = await busyProof(page, rowOf(page, 'Inbox'), 1.49, {
      blockMs: 150,
      evidence: 'list-reorder-drop',
      during: 'the dropped row glides into its place while the page is blocked',
    });
    expect(proof.changed, JSON.stringify(proof)).toBeGreaterThanOrEqual(3);
    expect(proof.monotonic, JSON.stringify(proof)).toBe(true);
  });

  test('a focused handle shows its own ring, whole, and its row shows none', async ({
    page,
  }) => {
    const handle = page.getByRole('button', {name: 'Reorder Inbox'});
    // Keyboard modality, so the next focus is focus-visible.
    await page.keyboard.press('Shift');
    await handle.focus();
    const ring = await handle.evaluate(element => {
      const row = element.closest('li') as HTMLElement;
      const list = element.closest('ul') as HTMLElement;
      const style = getComputedStyle(element);
      const reach =
        parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth);
      const box = element.getBoundingClientRect();
      const bounds = list.getBoundingClientRect();
      return {
        handle: style.outlineStyle,
        row: getComputedStyle(row).outlineStyle,
        left: box.left - reach - bounds.left,
        right: bounds.right - (box.right + reach),
      };
    });
    expect(ring.handle).not.toBe('none');
    // One ring: the row's own focus-within ring stays off for the handle.
    expect(ring.row).toBe('none');
    // Whole: inside the list, which clips its inline overflow.
    expect(ring.left).toBeGreaterThanOrEqual(-0.5);
    expect(ring.right).toBeGreaterThanOrEqual(-0.5);
  });

  test("the handle keeps a small control's size; a finger's target grows toward 44 pt and meets the next handle's halfway, its ring clears its lines, and its row is no taller for it", async ({
    page,
  }) => {
    const handle = page.getByRole('button', {name: 'Reorder Inbox'});
    await page.keyboard.press('Shift');
    await handle.focus();
    // The handle's hit layer takes the insets the shared hit area writes, a
    // frame after layout.
    await expect
      .poll(
        async () =>
          handle.evaluate(element =>
            getComputedStyle(element)
              .getPropertyValue('--astryx-hit-inset-top')
              .trim(),
          ),
        {message: 'the hit area writes its insets', timeout: 5000},
      )
      .not.toBe('');
    const geometry = await handle.evaluate(element => {
      const row = element.closest('li') as HTMLElement;
      const style = getComputedStyle(element);
      const inset =
        -parseFloat(style.outlineOffset) || parseFloat(style.outlineWidth);
      const box = element.getBoundingClientRect();
      const hitInset = (target: Element, side: string) =>
        parseFloat(
          getComputedStyle(target).getPropertyValue(
            `--astryx-hit-inset-${side}`,
          ),
        ) || 0;
      const hit = {
        top: box.top - hitInset(element, 'top'),
        bottom: box.bottom + hitInset(element, 'bottom'),
        left: box.left - hitInset(element, 'left'),
        right: box.right + hitInset(element, 'right'),
      };
      // The next row's handle, and the top of its target.
      const next = row.nextElementSibling?.querySelector<HTMLElement>(
        '[data-astryx-list-reorder]',
      );
      const nextTop =
        next == null
          ? Number.POSITIVE_INFINITY
          : next.getBoundingClientRect().top - hitInset(next, 'top');
      const pitch =
        next == null
          ? Number.POSITIVE_INFINITY
          : next.getBoundingClientRect().top - box.top;
      // A point in the hit layer outside the visible handle, above it.
      const probe = document.elementFromPoint(
        box.left + box.width / 2,
        box.top - (box.top - hit.top) / 2,
      );
      // The lines are the handle's ::before: one bar centred in it, and a
      // shadow of it on each side.
      const lines = getComputedStyle(element, '::before');
      const bar = parseFloat(lines.height);
      const shadows = Array.from(
        lines.boxShadow.matchAll(/(-?[\d.]+)px\s+(-?[\d.]+)px/g),
        ([, , y]) => Math.abs(parseFloat(y)),
      );
      const reach = Math.max(0, ...shadows) + bar / 2;
      const centre = box.top + box.height / 2;
      const glyph = {top: centre - reach, bottom: centre + reach};
      const withHandle = row.getBoundingClientRect().height;
      // The same row without its handle.
      element.style.display = 'none';
      const withoutHandle = row.getBoundingClientRect().height;
      element.style.display = '';
      return {
        ring: style.outlineStyle,
        width: box.width,
        height: box.height,
        hitHeight: hit.bottom - hit.top,
        hitWidth: hit.right - hit.left,
        gapToNext: nextTop - hit.bottom,
        pitch,
        probeHits: probe === element,
        above: glyph.top - (box.top + inset),
        below: box.bottom - inset - glyph.bottom,
        withHandle,
        withoutHandle,
      };
    });
    // A small control for every pointer, as on a desktop.
    expect(geometry.width).toBeLessThan(44);
    expect(geometry.height).toBeLessThan(44);
    // A finger's target grows toward 44 pt through the invisible hit layer.
    // Where the next handle sits closer, the target stops halfway, where it
    // meets the next handle's.
    expect(geometry.hitHeight).toBeLessThanOrEqual(44.5);
    expect(geometry.hitHeight).toBeGreaterThanOrEqual(
      Math.min(44, geometry.pitch) - 0.5,
    );
    expect(geometry.hitWidth).toBeCloseTo(44, 0);
    expect(geometry.gapToNext).toBeGreaterThanOrEqual(-0.5);
    if (geometry.pitch < 44) {
      expect(geometry.gapToNext).toBeLessThanOrEqual(0.5);
    }
    expect(geometry.probeHits).toBe(true);
    // The ring clears the lines above and below. It shows, so the band
    // judged is the ring's.
    expect(geometry.ring).not.toBe('none');
    expect(geometry.above).toBeGreaterThan(0);
    expect(geometry.below).toBeGreaterThan(0);
    // The handle takes only its lines' height in the row's layout.
    expect(geometry.withHandle).toBeCloseTo(geometry.withoutHandle, 1);
  });
});
