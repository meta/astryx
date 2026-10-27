// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListReorderTouch.interaction.browser.spec.ts
 * @input The built List reorder stories, real touch input (Chromium CDP /
 *   WebKit's input command) through the interaction harness, and the claim
 *   delay from the UIKit constants table (motion/uikit/reorder.ts)
 * @output Interaction proofs for a reorderable List under a finger
 *   (spec:AST-103 verification): a hold on a handle then a drag moves the row
 *   and the drop settles it into its new place; while the finger holds the
 *   drag the rows stay still, the source dims, a preview follows and an
 *   insertion line marks the drop position; a flick on a handle scrolls
 *   and moves nothing; a cancelled drag puts the row back; with Reduce Motion
 *   the drop takes its place without travel; and a flush row's handle stays
 *   inside the list
 * @position Interaction evidence for List's reorder (List/listReorderEngine.tsx,
 *   List/ListReorderTouch.ts, List/ListReorderHandle.tsx) in the touch phone
 *   context (./touchStory.ts)
 */

import {expect, test, type CDPSession, type Page} from '@playwright/test';
import {
  flick,
  holdThenDrag,
  toTouchEvents,
  touchDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';
import {solveSpring, toSpring} from '../../motion/spring';
import {reorder} from '../../motion/uikit/reorder';
import {springs} from '../../motion/uikit/springs';
import {openStory} from './touchStory';

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
 * Chromium's CDP on the script's own clock: the harness's player takes only
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
      const line = document.querySelector<HTMLElement>(
        '[data-astryx-reorder-line]',
      );
      return {
        sourceOpacity: source == null ? null : getComputedStyle(source).opacity,
        previewTop: preview?.getBoundingClientRect().top ?? null,
        lineShown: line != null && !line.hidden,
        lineTop: line?.getBoundingClientRect().top ?? null,
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
