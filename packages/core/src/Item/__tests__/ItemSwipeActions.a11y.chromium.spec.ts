// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file ItemSwipeActions.a11y.chromium.spec.ts
 * @input The checked-in Core/Item › Swipe Actions story, a built Storybook and
 *   real Chromium touch input on a phone-sized viewport
 * @output Pixel and geometry proof of Item's swipe actions: the panel at rest,
 *   in motion, resting open and on the spring back. A fling opens the row and
 *   fires nothing; a drag from the open row fires the outermost entry. No
 *   entry's colour shows behind another.
 * @position Browser-only regression test for Item's swipeActions. jsdom can
 *   hold the declared rules but not the paint or the geometry, and a real
 *   device has already disagreed with jsdom once on this gesture.
 */

import {expect, test, type Locator} from '@astryxdesign/a11y-spec/playwright';
// @ts-expect-error -- pngjs ships no declarations; runtime support is pinned.
import {PNG} from 'pngjs';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {
  advanceFrozenPage,
  drag,
  freezePageOn,
  installPageFreeze,
  installTimerGate,
  thawPage,
  touchDriver,
  type TouchScript,
} from '@astryxdesign/interaction-harness';

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
  // The page clock that lets the scene stop at the spring back's lift,
  // installed before the story loads.
  await installPageFreeze(page);
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-item--swipe-actions&viewMode=story`,
    {waitUntil: 'load'},
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

  await touch('touchStart', startX);
  // Past the axis lock and clearly horizontal, short of the commit point.
  await dragTo([6, 14, 28, 44, 60]);

  // Under the drag: the row has moved by the travel, the panel is fixed at
  // the row's resting edge (counter-translated) and exactly as wide as the
  // travel, and its colour fills the vacated edge.
  await expect.poll(async () => translationOf(row)).toBeGreaterThan(50);
  const dragged = await boxOf(panel);
  expect(Math.abs(dragged.x - rest.x)).toBeLessThanOrEqual(1);
  expect(
    Math.abs(dragged.width - (await translationOf(row))),
  ).toBeLessThanOrEqual(1);
  expect(paintedAtEdge(await shoot())).toBeGreaterThan(0);

  // Back to the start and past it without lifting: the row is home and the
  // panel is a zero-width box again, so nothing of it paints.
  await dragTo([40, 20, 4, -6]);
  await expect.poll(async () => translationOf(row)).toBe(0);
  await expect.poll(async () => paintedAtEdge(await shoot())).toBe(0);

  // Out again past half the panel, then released: the row rests open at the
  // panel's width with its entry a real, focusable button.
  await dragTo([10, 30, 45, 60]);
  await touch('touchEnd');
  await expect(panel).not.toHaveAttribute('inert');
  const entry = panel.getByRole('button', {name: 'Read'});
  await expect(entry).toBeVisible();
  await expect.poll(async () => translationOf(row)).toBe(72);
  expect(Math.abs((await boxOf(panel)).width - 72)).toBeLessThanOrEqual(1);
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

  // The spring back: a short drag released before half the panel. The row
  // slides home on its clock and the panel's width runs on the same one, so
  // mid-flight the gap the row has not yet covered is still the panel.
  await installTimerGate(page);
  await touch('touchStart', startX);
  await dragTo([8, 16, 24, 30]);
  await expect.poll(async () => translationOf(row)).toBeGreaterThan(20);
  // The scene stops in the lift's own task, before the row hears the lift,
  // and moves on 60 ms by its own clock. A read sent after the lift comes a
  // round trip late, and a loaded runner can find the spring back over.
  await freezePageOn(page, 'touchend');
  await touch('touchEnd');
  await advanceFrozenPage(page, 60);
  const midFlight = await row.evaluate((node, selector) => {
    const panelEl = node.querySelector(selector) as HTMLElement;
    const matrix = new DOMMatrix(getComputedStyle(node).transform);
    return {
      panelWidth: parseFloat(getComputedStyle(panelEl).width),
      rowX: Math.abs(matrix.e),
    };
  }, '[data-swipe-panel="leading"]');
  await thawPage(page);
  expect(midFlight.rowX).toBeGreaterThan(2);
  expect(Math.abs(midFlight.panelWidth - midFlight.rowX)).toBeLessThanOrEqual(
    6,
  );
  await expect.poll(async () => translationOf(row)).toBe(0);
  await expect.poll(async () => paintedAtEdge(await shoot())).toBe(0);
});

test('rests open on a fling and fires nothing; a drag from the open row past the commit point fires the outermost entry and the row leaves', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-item--swipe-actions&viewMode=story`,
    {waitUntil: 'load'},
  );
  const rows = page.locator('.astryx-item');
  const row = rows.first();
  await expect(row.getByText('Message 1')).toBeVisible();
  // The gesture arrives with the lazily loaded swipe layer; its panel is the
  // sign the row can be dragged.
  const panel = row.locator('[data-swipe-panel="trailing"]');
  await expect(panel).toBeAttached();
  const before = await rows.count();
  const rest = await boxOf(row);
  const y = rest.y + rest.height / 2;
  const driver = await touchDriver(page);

  // Toward the inline start: the trailing panel, Delete outermost. A slow
  // start claims the drag, and the last steps throw it: a fling short of the
  // commit point. It opens the row and fires nothing.
  const from = rest.x + rest.width - 24;
  const at = (t: number, dx: number) => ({
    t,
    fingers: [{id: 0, x: from - dx, y}],
  });
  const fling: TouchScript = [
    at(0, 0),
    at(40, 6),
    at(80, 14),
    at(120, 28),
    at(128, 44),
    at(136, 90),
    {t: 138, fingers: []},
  ];
  await driver.play(fling, {pacing: 'spacing'});
  const openWidth = await panel.evaluate(
    node => (node.firstElementChild as HTMLElement).offsetWidth,
  );
  await expect
    .poll(async () => Math.abs((await translationOf(row)) + openWidth))
    .toBeLessThanOrEqual(1);
  // The settle has finished: nothing is left to move, or to fire.
  await expect
    .poll(async () =>
      row.evaluate(node => node.getAnimations({subtree: true}).length),
    )
    .toBe(0);
  await expect(rows).toHaveCount(before);
  await expect(panel.getByRole('button', {name: 'Delete'})).toBeVisible();

  // From the open row, a deliberate drag on the row's content past the
  // commit point fires the outermost entry; the story removes the row.
  const fromOpen = rest.x + rest.width - openWidth - 24;
  await driver.play(
    drag({x: fromOpen, y}, {x: fromOpen - 160, y}, {durationMs: 640, hz: 60}),
  );
  await expect(page.getByText('Message 1')).toHaveCount(0);
  await expect(rows).toHaveCount(before - 1);
});

test('the trailing panel: Delete is outermost, the panel wears no colour of its own, and past the open width every uncovered pixel is an entry\u2019s', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-item--swipe-actions&viewMode=story`,
    {waitUntil: 'load'},
  );
  const row = page.locator('.astryx-item').first();
  const panel = row.locator('[data-swipe-panel="trailing"]');
  // The gesture arrives with the lazily loaded swipe layer.
  await expect(panel).toBeAttached();
  const rest = await boxOf(row);
  const y = rest.y + rest.height / 2;
  const startX = rest.x + rest.width - 24;
  const driver = await touchDriver(page);
  // A slow drag past the open width, short of the commit point, then a rest
  // before the lift. A side with two entries never arms from a closed row.
  const played = driver.play(
    drag(
      {x: startX, y},
      {x: startX - 185, y},
      {durationMs: 740, hz: 60, restMs: 1500},
    ),
  );
  await expect.poll(async () => translationOf(row)).toBeLessThan(-160);
  // The panel wears no entry's colour, so none can show behind another.
  // The entries run Archive then Delete toward the outer edge.
  const [panelColor, deleteColor, archiveColor] = await panel.evaluate(node => {
    const buttons = Array.from(node.querySelectorAll('button'));
    const last = buttons[buttons.length - 1];
    const first = buttons[0];
    return [
      getComputedStyle(node).backgroundColor,
      getComputedStyle(last).backgroundColor,
      getComputedStyle(first).backgroundColor,
    ];
  });
  expect(panelColor).toBe('rgba(0, 0, 0, 0)');
  expect(archiveColor).not.toBe(deleteColor);
  const panelBox = await boxOf(panel);
  const archiveBox = await boxOf(panel.getByRole('button', {name: 'Archive'}));
  const deleteBox = await boxOf(panel.getByRole('button', {name: 'Delete'}));
  expect(deleteBox.x).toBeGreaterThan(archiveBox.x);
  // Past the open width, the entries grow to fill the panel.
  expect(Math.abs(archiveBox.x - panelBox.x)).toBeLessThanOrEqual(1);
  expect(
    Math.abs(deleteBox.x + deleteBox.width - (panelBox.x + panelBox.width)),
  ).toBeLessThanOrEqual(1);
  // No pixel beside Archive, at the panel's inline start, is Delete's colour.
  // Delete's own fill is read in its padding, clear of its label and corners.
  const deletePixel = pixel(
    decode(
      await page.screenshot({
        clip: {
          x: deleteBox.x + 3,
          y: deleteBox.y + Math.floor(deleteBox.height / 2),
          width: 2,
          height: 2,
        },
      }),
    ),
    0,
    0,
  );
  const beside = decode(
    await page.screenshot({
      clip: {
        x: panelBox.x + 1,
        y: panelBox.y + 4,
        width: 4,
        height: Math.floor(panelBox.height) - 8,
      },
    }),
  );
  let deleteColoured = 0;
  for (let py = 0; py < beside.height; py += 1) {
    for (let px = 0; px < beside.width; px += 1) {
      if (!isDistinct(pixel(beside, px, py), deletePixel)) {
        deleteColoured += 1;
      }
    }
  }
  expect(deleteColoured).toBe(0);
  await played;
});
