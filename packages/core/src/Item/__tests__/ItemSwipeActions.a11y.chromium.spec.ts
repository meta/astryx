// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file ItemSwipeActions.a11y.chromium.spec.ts
 * @input The checked-in Core/Item › Swipe Actions story, a built Storybook and
 *   real Chromium touch input on a phone-sized viewport
 * @output Pixel and geometry proof of Item's swipe actions: no pixel of a
 *   panel at rest, the panel painting exactly the space the row vacates while
 *   the row translates, none again when the drag comes back to its start
 *   without lifting, the row resting open with a real button that fires on a
 *   tap and closes the row, the panel's edge moving with the row on the spring
 *   back, a fling opening the row without firing anything, and a drag past the
 *   commit point firing the outermost entry
 * @position Browser-only regression test for Item's swipeActions. jsdom can
 *   hold the declared rules but not the paint or the geometry, and a real
 *   device has already disagreed with jsdom once on this gesture. The swipe
 *   reads each touch's pointer, the same on every device; the context's
 *   touchscreen gives Chromium a phone's (a coarse primary pointer).
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
// @ts-expect-error -- pngjs ships no declarations; runtime support is pinned.
import {PNG} from 'pngjs';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

// The gesture is touch only: Chromium accepts dispatched touch points only on
// a context that has a touchscreen. A phone-sized viewport keeps the commit
// point within a finger's reach.
test.use({hasTouch: true, viewport: {height: 800, width: 420}});

/** Opens the story under a finger: the context's touchscreen makes the primary pointer coarse. */
async function openUnderFinger(page: Page, url: string) {
  await page.goto(url, {waitUntil: 'load'});
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(true);
}

type Rgb = [number, number, number];

/** The leading panel sits at the inline start: in this LTR story, the left edge. */
const EDGE_BAND_PX = 8;
/** Per-channel distance beyond which two pixels are different colours. */
const DISTINCT = 24;

interface Shot {
  width: number;
  height: number;
  data: Uint8Array;
}

function decode(buffer: Buffer): Shot {
  const png = PNG.sync.read(buffer);
  return {width: png.width, height: png.height, data: png.data};
}

function pixel(shot: Shot, x: number, y: number): Rgb {
  const i = (y * shot.width + x) * 4;
  return [shot.data[i], shot.data[i + 1], shot.data[i + 2]];
}

function isDistinct(a: Rgb, b: Rgb): boolean {
  return (
    Math.abs(a[0] - b[0]) > DISTINCT ||
    Math.abs(a[1] - b[1]) > DISTINCT ||
    Math.abs(a[2] - b[2]) > DISTINCT
  );
}

/**
 * How many pixels in the row's leading edge band are not the row's own
 * background. The background is sampled at the row's bottom-right corner,
 * which holds neither text nor the panel.
 */
function paintedAtEdge(buffer: Buffer): number {
  const shot = decode(buffer);
  const ground = pixel(shot, shot.width - 2, shot.height - 2);
  let count = 0;
  for (let y = 0; y < shot.height; y += 1) {
    for (let x = 0; x < Math.min(EDGE_BAND_PX, shot.width); x += 1) {
      if (isDistinct(pixel(shot, x, y), ground)) {
        count += 1;
      }
    }
  }
  return count;
}

/** The row's horizontal translation, from its computed transform. */
async function translationOf(row: Locator): Promise<number> {
  return row.evaluate(node => {
    const matrix = new DOMMatrix(getComputedStyle(node).transform);
    return matrix.e;
  });
}

/** The fill of a side's panel: the track inside the panel's window. */
const trackOf = (panel: Locator) => panel.locator(':scope > div').first();

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('the element has no box');
  }
  return box;
}

test('paints no panel at rest, keeps the panel fixed while the row moves, rests open on a real button, and springs back with the panel', async ({
  page,
}) => {
  await openUnderFinger(
    page,
    `${storybook.origin}/iframe.html?id=core-item--swipe-actions&viewMode=story`,
  );
  const row = page.locator('.astryx-item').first();
  await expect(row).toBeVisible();
  const panel = row.locator('[data-swipe-panel="leading"]');
  await expect(panel).toBeAttached();
  // The row's resting footprint: every paint sample is of this rectangle,
  // which the row vacates as it moves.
  const rest = await boxOf(row);
  const shoot = async () => page.screenshot({clip: rest});

  // At rest: inert, and the row's leading edge is nothing but its own
  // background — no sliver of a padding box.
  await expect(panel).toHaveAttribute('inert', '');
  expect(paintedAtEdge(await shoot())).toBe(0);

  const y = rest.y + rest.height / 2;
  const startX = rest.x + 24;
  const cdp = await page.context().newCDPSession(page);
  const touch = async (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    x?: number,
  ) =>
    cdp.send('Input.dispatchTouchEvent', {
      touchPoints: x == null ? [] : [{x, y}],
      type,
    });
  const dragTo = async (offsets: number[]) => {
    for (const dx of offsets) {
      await touch('touchMove', startX + dx);
      await page.waitForTimeout(40);
    }
  };
  // A finger coming to rest: UIKit's velocity filter never decays on its
  // own (a finger at rest sends no events, and a browser drops a move that
  // goes nowhere), so the finger creeps a tenth of a pixel a frame until the
  // velocity it reports is nearly zero.
  const holdStill = async (dx: number) => {
    for (let i = 1; i <= 20; i += 1) {
      await touch('touchMove', startX + dx + i / 10);
      await page.waitForTimeout(16);
    }
  };

  await touch('touchStart', startX);
  // Past the 25 px the swipe needs to begin and clearly horizontal, short of
  // the commit point: the swipe is the travel past those 25 px.
  await dragTo([6, 14, 28, 50, 70, 90]);

  // Under the drag: the row has caught up with the finger (it follows on a
  // spring), the panel's window is fixed over the row's resting box, its
  // fill ends exactly at the row's moved edge, and its colour fills the
  // vacated edge.
  await expect.poll(async () => translationOf(row)).toBeGreaterThan(55);
  const dragged = await boxOf(panel);
  expect(Math.abs(dragged.x - rest.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(dragged.width - rest.width)).toBeLessThanOrEqual(1);
  const fill = await boxOf(trackOf(panel));
  expect(
    Math.abs(fill.x + fill.width - (rest.x + (await translationOf(row)))),
  ).toBeLessThanOrEqual(1);
  expect(paintedAtEdge(await shoot())).toBeGreaterThan(0);

  // Back to the start and past it without lifting: the row is home and the
  // fill is beside the window again, so nothing of it paints.
  await dragTo([60, 30, 10, -6]);
  await expect.poll(async () => translationOf(row)).toBe(0);
  await expect.poll(async () => paintedAtEdge(await shoot())).toBe(0);

  // Out again past half the panel, held still, then released: the row rests
  // open at the panel's width with its entry a real, focusable button.
  await dragTo([30, 60, 90, 110]);
  await page.waitForTimeout(100);
  await touch('touchEnd');
  await expect(panel).not.toHaveAttribute('inert');
  const entry = panel.getByRole('button', {name: 'Read'});
  await expect(entry).toBeVisible();
  await expect.poll(async () => translationOf(row)).toBe(72);
  const open = await boxOf(trackOf(panel));
  expect(Math.abs(open.x + open.width - (rest.x + 72))).toBeLessThanOrEqual(1);
  await entry.focus();
  await expect(entry).toBeFocused();

  // A tap on the entry fires it (the story toggles the row's read state) and,
  // without `hasRemoval`, closes the row.
  const entryBox = await boxOf(entry);
  await cdp.send('Input.dispatchTouchEvent', {
    touchPoints: [
      {x: entryBox.x + entryBox.width / 2, y: entryBox.y + entryBox.height / 2},
    ],
    type: 'touchStart',
  });
  await cdp.send('Input.dispatchTouchEvent', {
    touchPoints: [],
    type: 'touchEnd',
  });
  await expect(row.getByText('Read', {exact: true})).toBeVisible();
  await expect(panel).toHaveAttribute('inert', '');
  await expect.poll(async () => translationOf(row)).toBe(0);
  // Focus moved to the row's own content when its panel closed under it, and
  // the row's focus ring is the one thing allowed at its edge: drop it before
  // sampling for the panel.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await expect.poll(async () => paintedAtEdge(await shoot())).toBe(0);

  // The spring back: a short drag held still and released before half the
  // panel. The row and the panel's fill run on one clock, so mid-flight the
  // gap the row has not yet covered is exactly the fill.
  await touch('touchStart', startX);
  await dragTo([10, 30, 40, 50]);
  await expect.poll(async () => translationOf(row)).toBeGreaterThan(20);
  await holdStill(50);
  await touch('touchEnd');
  const midFlight = await row.evaluate(
    async (node, selector) =>
      new Promise<{rowX: number; fillEnd: number}>(resolve => {
        setTimeout(() => {
          const track = node.querySelector(selector) as HTMLElement;
          resolve({
            fillEnd:
              track.getBoundingClientRect().right -
              (node.parentElement as HTMLElement).getBoundingClientRect().left,
            rowX:
              node.getBoundingClientRect().left -
              (node.parentElement as HTMLElement).getBoundingClientRect().left,
          });
        }, 60);
      }),
    '[data-swipe-panel="leading"] > div',
  );
  expect(midFlight.rowX).toBeGreaterThan(2);
  expect(Math.abs(midFlight.fillEnd - midFlight.rowX)).toBeLessThanOrEqual(1);
  await expect.poll(async () => translationOf(row)).toBe(0);
  await expect.poll(async () => paintedAtEdge(await shoot())).toBe(0);
});

test('opens the row on a fling without firing, and fires the outermost trailing entry past the commit point, and the row leaves', async ({
  page,
}) => {
  await openUnderFinger(
    page,
    `${storybook.origin}/iframe.html?id=core-item--swipe-actions&viewMode=story`,
  );
  const rows = page.locator('.astryx-item');
  const row = rows.first();
  await expect(row.getByText('Message 1')).toBeVisible();
  // The gesture arrives with the lazily loaded swipe layer; its panel is the
  // sign the row can be dragged.
  await expect(row.locator('[data-swipe-panel="trailing"]')).toBeAttached();
  const before = await rows.count();
  const rest = await boxOf(row);
  const y = rest.y + rest.height / 2;
  const startX = rest.x + rest.width - 24;
  const cdp = await page.context().newCDPSession(page);
  const at = async (x: number, type: 'touchStart' | 'touchMove') =>
    cdp.send('Input.dispatchTouchEvent', {touchPoints: [{x, y}], type});

  // Toward the inline start: the trailing panel, Delete outermost. A slow
  // start claims the drag; the last step is quick, so the release is a fling
  // short of the commit point: it opens the row, as UIKit's does, and fires
  // nothing.
  await at(startX, 'touchStart');
  for (const dx of [6, 14, 28, 36]) {
    await at(startX - dx, 'touchMove');
    await page.waitForTimeout(40);
  }
  await at(startX - 60, 'touchMove');
  await at(startX - 90, 'touchMove');
  await cdp.send('Input.dispatchTouchEvent', {
    touchPoints: [],
    type: 'touchEnd',
  });
  const panel = row.locator('[data-swipe-panel="trailing"]');
  await expect(panel).not.toHaveAttribute('inert');
  // How far the row opens: the entries (the track's children) together.
  const panelWidth = await trackOf(panel).evaluate(node =>
    Array.from(node.children).reduce(
      (width, entry) => width + entry.getBoundingClientRect().width,
      0,
    ),
  );
  await expect.poll(async () => translationOf(row)).toBeCloseTo(-panelWidth, 0);
  await expect(rows).toHaveCount(before);

  // From open, a drag on past the commit point fires the outermost entry:
  // one beat, the slide out, then the entry fires and the story removes the
  // row.
  const from = rest.x + rest.width - panelWidth - 24;
  await at(from, 'touchStart');
  for (const dx of [10, 30, 60, 120, 180, 240]) {
    await at(from - dx, 'touchMove');
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(100);
  await cdp.send('Input.dispatchTouchEvent', {
    touchPoints: [],
    type: 'touchEnd',
  });
  await expect(page.getByText('Message 1')).toHaveCount(0);
  await expect(rows).toHaveCount(before - 1);
});

test('the trailing panel: Delete is outermost and the panel wears its colour', async ({
  page,
}) => {
  await openUnderFinger(
    page,
    `${storybook.origin}/iframe.html?id=core-item--swipe-actions&viewMode=story`,
  );
  const row = page.locator('.astryx-item').first();
  const panel = row.locator('[data-swipe-panel="trailing"]');
  // The gesture arrives with the lazily loaded swipe layer.
  await expect(panel).toBeAttached();
  const rest = await boxOf(row);
  const y = rest.y + rest.height / 2;
  const startX = rest.x + rest.width - 24;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    touchPoints: [{x: startX, y}],
    type: 'touchStart',
  });
  for (const dx of [6, 14, 28, 44, 60, 80, 100]) {
    await cdp.send('Input.dispatchTouchEvent', {
      touchPoints: [{x: startX - dx, y}],
      type: 'touchMove',
    });
    await page.waitForTimeout(40);
  }
  await expect.poll(async () => translationOf(row)).toBeLessThan(-60);
  // The window is fixed over the row's resting box; the fill starts exactly
  // at the row's moved trailing edge.
  const dragged = await boxOf(panel);
  expect(
    Math.abs(dragged.x + dragged.width - (rest.x + rest.width)),
  ).toBeLessThanOrEqual(1);
  const fill = await boxOf(trackOf(panel));
  expect(
    Math.abs(fill.x - (rest.x + rest.width + (await translationOf(row)))),
  ).toBeLessThanOrEqual(1);
  // The entries run Archive then Delete toward the outer edge. Delete, the
  // outermost, wears its own colour and paints it beside itself out to the
  // edge (its pseudo-element); the track paints the surface the entries sit
  // on and keeps Delete's colour as its confirm fill, hidden until a full
  // swipe confirms.
  const [
    trackColor,
    fillColor,
    fillOpacity,
    extensionColor,
    deleteColor,
    archiveColor,
  ] = await trackOf(panel).evaluate(node => {
    const buttons = Array.from(node.querySelectorAll('button'));
    const last = buttons[buttons.length - 1];
    const first = buttons[0];
    return [
      getComputedStyle(node).backgroundColor,
      getComputedStyle(node, '::before').backgroundColor,
      getComputedStyle(node, '::before').opacity,
      getComputedStyle(last, '::after').backgroundColor,
      getComputedStyle(last).backgroundColor,
      getComputedStyle(first).backgroundColor,
    ];
  });
  expect(extensionColor).toBe(deleteColor);
  expect(fillColor).toBe(deleteColor);
  expect(fillOpacity).toBe('0');
  expect(trackColor).not.toBe(deleteColor);
  expect(archiveColor).not.toBe(deleteColor);
  const deleteBox = await boxOf(panel.getByRole('button', {name: 'Delete'}));
  const archiveBox = await boxOf(panel.getByRole('button', {name: 'Archive'}));
  expect(deleteBox.x).toBeGreaterThan(archiveBox.x);
  await cdp.send('Input.dispatchTouchEvent', {
    touchPoints: [],
    type: 'touchEnd',
  });
});
