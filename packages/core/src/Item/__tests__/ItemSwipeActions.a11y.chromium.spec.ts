// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file ItemSwipeActions.a11y.chromium.spec.ts
 * @input The checked-in Core/Item › Swipe Actions story, a built Storybook and
 *   real Chromium touch input on a phone-sized viewport
 * @output Pixel and geometry proof of Item's swipe actions: the panel at rest,
 *   in motion, resting open and on the spring back. A long drag from a closed
 *   two-entry row rests it open and fires nothing, and so does a fling. A drag
 *   from the open row fires the outermost entry. From the confirm, Archive is
 *   drawn whole or not at all, and no entry's colour shows behind another.
 * @position Browser-only regression test for Item's swipeActions. jsdom can
 *   hold the declared rules but not the paint or the geometry, and a real
 *   device has already disagreed with jsdom once on this gesture. The swipe
 *   reads each touch's pointer, the same on every device; the context's
 *   touchscreen gives Chromium a phone's (a coarse primary pointer).
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

/** The row's horizontal translation as drawn: its transform and its `translate`. */
async function translationOf(row: Locator): Promise<number> {
  return row.evaluate(node => {
    // A settle holds its end in the transform and animates `translate` on
    // the compositor, so the row is drawn at the sum.
    const style = getComputedStyle(node);
    const translate =
      style.translate === 'none' ? 0 : parseFloat(style.translate);
    return new DOMMatrix(style.transform).e + translate;
  });
}

/** The fill of a side's panel: the track inside the panel's window. */
const trackOf = (panel: Locator) => panel.locator(':scope > div').first();

/** How far a side opens: its entries' widths together, as the row reads them. */
const openWidthOf = async (panel: Locator) =>
  trackOf(panel).evaluate(node =>
    Array.from(node.children).reduce(
      (width, entry) => width + (entry as HTMLElement).offsetWidth,
      0,
    ),
  );

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
  // Past the 25 px the swipe needs to begin, clearly horizontal, short of the
  // commit point. The swipe is the travel past those 25 px.
  await dragTo([6, 14, 28, 50, 70, 90]);

  // Under the drag, the row has caught up with the finger, which it follows on
  // a spring. The panel's window is fixed over the row's resting box. Its fill
  // ends exactly at the row's moved edge, and its colour fills the vacated
  // edge.
  await expect.poll(async () => translationOf(row)).toBeGreaterThan(55);
  const dragged = await boxOf(panel);
  expect(Math.abs(dragged.x - rest.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(dragged.width - rest.width)).toBeLessThanOrEqual(1);
  const fill = await boxOf(trackOf(panel));
  expect(
    Math.abs(fill.x + fill.width - (rest.x + (await translationOf(row)))),
  ).toBeLessThanOrEqual(1);
  expect(paintedAtEdge(await shoot())).toBeGreaterThan(0);

  // Back to the start and past it without lifting. The row is home and the fill
  // is beside the window again, so nothing of it paints.
  await dragTo([60, 30, 10, -6]);
  await expect.poll(async () => translationOf(row)).toBe(0);
  await expect.poll(async () => paintedAtEdge(await shoot())).toBe(0);

  // Out again past half the panel, then released: the row rests open at the
  // panel's width with its entry a real, focusable button.
  await dragTo([30, 60, 90, 110]);
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

  // The spring back: a short drag released before half the panel, coming back
  // as it lifts. The row and each part of its panel play on one clock. So
  // mid-flight, the gap the row has not yet covered is exactly the fill.
  await installTimerGate(page);
  await touch('touchStart', startX);
  await dragTo([10, 30, 50, 45]);
  await expect.poll(async () => translationOf(row)).toBeGreaterThan(15);
  // The scene stops in the lift's own task, before the row hears the lift,
  // and moves on 60 ms by its own clock. A read sent after the lift comes a
  // round trip late, and a loaded runner can find the spring back over.
  await freezePageOn(page, 'touchend');
  await touch('touchEnd');
  await advanceFrozenPage(page, 60);
  const midFlight = await row.evaluate((node, selector) => {
    const track = node.querySelector(selector) as HTMLElement;
    const parent = node.parentElement as HTMLElement;
    const left = parent.getBoundingClientRect().left;
    return {
      fillEnd: track.getBoundingClientRect().right - left,
      rowX: node.getBoundingClientRect().left - left,
    };
  }, '[data-swipe-panel="leading"] > div');
  await thawPage(page);
  expect(midFlight.rowX).toBeGreaterThan(2);
  expect(Math.abs(midFlight.fillEnd - midFlight.rowX)).toBeLessThanOrEqual(1);
  await expect.poll(async () => translationOf(row)).toBe(0);
  await expect.poll(async () => paintedAtEdge(await shoot())).toBe(0);
});

test('rests a two-entry row open on a long drag from closed past the confirm point, and fires nothing', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-item--swipe-actions&viewMode=story`,
    {waitUntil: 'load'},
  );
  const rows = page.locator('.astryx-item');
  const row = rows.first();
  const panel = row.locator('[data-swipe-panel="trailing"]');
  await expect(panel).toBeAttached();
  const before = await rows.count();
  const rest = await boxOf(row);
  const y = rest.y + rest.height / 2;
  const from = rest.x + rest.width - 24;
  const openWidth = await openWidthOf(panel);
  const driver = await touchDriver(page);
  // Slow and deliberate, far past the confirm point, held, then lifted. A
  // side with two entries confirms only from the open row.
  await driver.play(
    drag(
      {x: from, y},
      {x: from - (rest.width - 40), y},
      {durationMs: 1400, hz: 60, restMs: 400},
    ),
  );
  await expect
    .poll(async () => Math.abs((await translationOf(row)) + openWidth))
    .toBeLessThanOrEqual(1);
  await expect
    .poll(async () =>
      row.evaluate(node => node.getAnimations({subtree: true}).length),
    )
    .toBe(0);
  await expect(rows).toHaveCount(before);
  await expect(panel.getByRole('button', {name: 'Delete'})).toBeVisible();
});

test('rests open on a fling and fires nothing; a drag from the open row past the confirm point fires the outermost entry and the row leaves', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-item--swipe-actions&viewMode=story`,
    {waitUntil: 'load'},
  );
  const rows = page.locator('.astryx-item');
  const row = rows.first();
  await expect(row.getByText('Message 1')).toBeVisible();
  const panel = row.locator('[data-swipe-panel="trailing"]');
  await expect(panel).toBeAttached();
  const before = await rows.count();
  const rest = await boxOf(row);
  const y = rest.y + rest.height / 2;
  const openWidth = await openWidthOf(panel);
  const driver = await touchDriver(page);

  // Toward the inline start: the trailing panel, Delete outermost. A slow
  // start claims the drag, and the last steps throw it: a fling short of the
  // confirm point. It opens the row and fires nothing.
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
  // confirm point fires the outermost entry; the story removes the row.
  const fromOpen = rest.x + rest.width - openWidth - 24;
  await driver.play(
    drag({x: fromOpen, y}, {x: fromOpen - 220, y}, {durationMs: 880, hz: 60}),
  );
  await expect(page.getByText('Message 1')).toHaveCount(0);
  await expect(rows).toHaveCount(before - 1);
});

test('covers the panel from the confirm: every frame draws Archive whole or not at all, never blended over Delete\u2019s colour', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-item--swipe-actions&viewMode=story`,
    {waitUntil: 'load'},
  );
  const row = page.locator('.astryx-item').first();
  const panel = row.locator('[data-swipe-panel="trailing"]');
  await expect(panel).toBeAttached();
  const rest = await boxOf(row);
  const y = rest.y + rest.height / 2;
  const from = rest.x + rest.width - 24;
  const openWidth = await openWidthOf(panel);
  const driver = await touchDriver(page);
  // Open it, then log Archive's opacity and the cover fill's at every frame.
  await driver.play(
    drag(
      {x: from, y},
      {x: from - (openWidth + 20), y},
      {durationMs: 500, hz: 60, restMs: 300},
    ),
  );
  await expect
    .poll(async () => Math.abs((await translationOf(row)) + openWidth))
    .toBeLessThanOrEqual(1);
  await trackOf(panel).evaluate(node => {
    const archive = node.firstElementChild as HTMLElement;
    const seen: {archive: number; cover: number}[] = [];
    const sample = () => {
      seen.push({
        archive: Number(getComputedStyle(archive).opacity),
        cover: Number(getComputedStyle(node, '::before').opacity),
      });
      if (seen.length < 600) {
        requestAnimationFrame(sample);
      }
    };
    requestAnimationFrame(sample);
    Object.assign(window, {__swipeCover: seen});
  });
  // From the open row past the confirm point, held while the row runs
  // ahead, then backed out short of it.
  const fromOpen = rest.x + rest.width - openWidth - 24;
  const out = drag(
    {x: fromOpen, y},
    {x: fromOpen - 220, y},
    {durationMs: 880, hz: 60, restMs: 500},
  ).slice(0, -1);
  const last = out[out.length - 1];
  const back = drag(
    last.fingers[0],
    {x: fromOpen - 40, y},
    {durationMs: 400, hz: 60, restMs: 300},
  ).map(frame => ({...frame, t: frame.t + last.t + 16}));
  await driver.play([...out, ...back.slice(1)]);
  const seen = await page.evaluate(
    () =>
      (window as unknown as {__swipeCover: {archive: number; cover: number}[]})
        .__swipeCover,
  );
  // Never a frame between: Archive half drawn over Delete's colour.
  expect(
    seen.filter(
      frame =>
        (frame.archive > 0 && frame.archive < 1) ||
        (frame.cover > 0 && frame.cover < 1),
    ),
  ).toEqual([]);
  // It covered, and uncovered.
  expect(seen.some(frame => frame.cover === 1 && frame.archive === 0)).toBe(
    true,
  );
  expect(seen.at(-1)).toEqual({archive: 1, cover: 0});
});

test('the trailing panel: Delete is outermost, the track wears no entry\u2019s colour, and past the open width every uncovered pixel is an entry\u2019s', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-item--swipe-actions&viewMode=story`,
    {waitUntil: 'load'},
  );
  const row = page.locator('.astryx-item').first();
  const panel = row.locator('[data-swipe-panel="trailing"]');
  await expect(panel).toBeAttached();
  const rest = await boxOf(row);
  const y = rest.y + rest.height / 2;
  const from = rest.x + rest.width - 24;
  const openWidth = await openWidthOf(panel);
  const driver = await touchDriver(page);
  // A slow drag 40 px past the open width, short of the confirm point, then
  // a rest before the lift.
  const played = driver.play(
    drag(
      {x: from, y},
      {x: from - (openWidth + 40 + 25), y},
      {durationMs: 740, hz: 60, restMs: 1500},
    ),
  );
  await expect
    .poll(async () => translationOf(row))
    .toBeLessThan(-(openWidth + 30));
  // The window is fixed over the row's resting box; the track starts at the
  // row's moved trailing edge.
  const dragged = await boxOf(panel);
  expect(
    Math.abs(dragged.x + dragged.width - (rest.x + rest.width)),
  ).toBeLessThanOrEqual(1);
  const travel = await translationOf(row);
  const fill = await boxOf(trackOf(panel));
  expect(Math.abs(fill.x - (rest.x + rest.width + travel))).toBeLessThanOrEqual(
    1,
  );
  // Archive then Delete toward the outer edge. Delete, the outermost, paints
  // its colour beside itself out to the edge. The track paints the surface
  // the entries sit on, and its cover fill stays hidden: nothing covers.
  const [trackColor, coverOpacity, extensionColor, deleteColor, archiveColor] =
    await trackOf(panel).evaluate(node => {
      const buttons = Array.from(node.querySelectorAll('button'));
      const last = buttons[buttons.length - 1];
      const first = buttons[0];
      return [
        getComputedStyle(node).backgroundColor,
        getComputedStyle(node, '::before').opacity,
        getComputedStyle(last, '::after').backgroundColor,
        getComputedStyle(last).backgroundColor,
        getComputedStyle(first).backgroundColor,
      ];
    });
  expect(extensionColor).toBe(deleteColor);
  expect(coverOpacity).toBe('0');
  expect(trackColor).not.toBe(deleteColor);
  expect(archiveColor).not.toBe(deleteColor);
  const archiveBox = await boxOf(panel.getByRole('button', {name: 'Archive'}));
  const deleteBox = await boxOf(panel.getByRole('button', {name: 'Delete'}));
  expect(deleteBox.x).toBeGreaterThan(archiveBox.x);
  // Past the open width the entries ride the row: Archive sits at its moved
  // trailing edge.
  expect(
    Math.abs(archiveBox.x - (rest.x + rest.width + travel)),
  ).toBeLessThanOrEqual(1);
  // No pixel from the row's edge to Delete is Delete's colour. Delete's own
  // is read in its padding, clear of its label and corners.
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
  const between = decode(
    await page.screenshot({
      clip: {
        x: archiveBox.x + 1,
        y: archiveBox.y + 4,
        width: Math.max(1, Math.floor(deleteBox.x - archiveBox.x) - 2),
        height: Math.floor(archiveBox.height) - 8,
      },
    }),
  );
  let deleteColoured = 0;
  for (let py = 0; py < between.height; py += 1) {
    for (let px = 0; px < between.width; px += 1) {
      if (!isDistinct(pixel(between, px, py), deletePixel)) {
        deleteColoured += 1;
      }
    }
  }
  expect(deleteColoured).toBe(0);
  await played;
});
