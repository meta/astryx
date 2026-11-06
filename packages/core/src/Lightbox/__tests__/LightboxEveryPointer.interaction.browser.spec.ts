// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LightboxEveryPointer.interaction.browser.spec.ts
 * @input The built "With zoom" and "Default" Lightbox stories, with a
 *   3000 × 2000 test photo. A desktop context (1280 × 800, a fine primary
 *   pointer) has a mouse and a trackpad's wheel. Chromium also has timed
 *   mouse events through the Chrome DevTools Protocol
 * @output Proofs that Lightbox's gestures work for every pointer. A ctrl-wheel
 *   zooms, and a trackpad's scroll pans a zoomed photo and stops at its edge.
 *   A mouse wheel's notch leaves it in place, and a mouse drag's release
 *   stops it
 * @position Interaction tests for Lightbox (browser), beside
 *   LightboxZoomModes.interaction.browser.spec.ts
 */

import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  frames,
  openStory,
  waitForRest,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

type Story = 'with-zoom' | 'default';

const TRIGGER: Record<Story, string> = {
  'with-zoom': 'Open with zoom',
  default: 'Open lightbox',
};

function photoSvg(width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#5f7fa6"/><circle cx="${width / 2}" cy="${height / 2}" r="${height / 4}" fill="#fff" fill-opacity="0.35"/></svg>`;
}

interface Point {
  x: number;
  y: number;
}

/** Opens a story's viewer in a desktop context: a mouse, no touch. */
async function openDesktop(
  browser: Browser,
  story: Story,
  {reducedMotion = false}: {reducedMotion?: boolean} = {},
) {
  const context = await browser.newContext({
    viewport: {width: 1280, height: 800},
    hasTouch: false,
    isMobile: false,
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  // A fine primary pointer in this context (the interaction config can report
  // a coarse one without touch).
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(false);
  await page.route('https://picsum.photos/**', async route =>
    route.fulfill({contentType: 'image/svg+xml', body: photoSvg(3000, 2000)}),
  );
  await openStory(page, storybook(), `core-lightbox--${story}`);
  await page.getByRole('button', {name: TRIGGER[story]}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const img = dialog.getByRole('img').first();
  await expect
    .poll(async () => img.evaluate(el => (el as HTMLImageElement).naturalWidth))
    .toBe(3000);
  await frames(page, 2);
  const box = await boxOf(img);
  // A wheel delta as the page receives it, in CSS pixels. Chromium's input
  // divides Playwright's by the device pixel ratio, and WebKit's does not. A
  // mouse wheel's notch is a whole 100 px only as the page sees it.
  const scale =
    page.context().browser()?.browserType().name() === 'chromium'
      ? await page.evaluate(() => window.devicePixelRatio)
      : 1;
  return {
    wheel: async (dx: number, dy: number) =>
      page.mouse.wheel(dx * scale, dy * scale),
    context,
    page,
    dialog,
    img,
    centre: {x: box.x + box.width / 2, y: box.y + box.height / 2},
  };
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('no box');
  }
  return box;
}

/**
 * Mouse or pen events with exact timestamps through the Chrome DevTools
 * Protocol: a release's velocity is the move's, whatever the runner's pace.
 */
async function timedPointer(page: Page, pointerType: 'mouse' | 'pen') {
  const cdp = await page.context().newCDPSession(page);
  let clock = await page.evaluate(
    () => performance.timeOrigin + performance.now(),
  );
  return async (
    type: 'mousePressed' | 'mouseMoved' | 'mouseReleased',
    at: Point,
    afterMs: number,
  ) => {
    clock += afterMs;
    await cdp.send('Input.dispatchMouseEvent', {
      type,
      x: at.x,
      y: at.y,
      button: 'left',
      buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: type === 'mouseMoved' ? 0 : 1,
      pointerType,
      timestamp: clock / 1000,
    });
  };
}

test('a ctrl-wheel zooms the photo', async ({browser}) => {
  const {wheel, context, page, dialog, img, centre} = await openDesktop(
    browser,
    'with-zoom',
  );
  try {
    const fitted = await boxOf(img);
    await page.mouse.move(centre.x, centre.y);
    await page.keyboard.down('Control');
    for (let i = 0; i < 3; i++) {
      await wheel(0, -20);
      await frames(page, 1);
    }
    await page.keyboard.up('Control');
    await expect(dialog.getByRole('button', {name: 'Zoom'})).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await waitForRest(img);
    expect((await boxOf(img)).width).toBeGreaterThan(fitted.width * 1.05);
  } finally {
    await context.close();
  }
});

const WHEEL_DRIVERS =
  "Chromium's driver sends each wheel as a mouse wheel's notch; WebKit's sends a trackpad's precise deltas.";

test("a trackpad's scroll pans a zoomed photo", async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'webkit', WHEEL_DRIVERS);
  const {wheel, context, page, dialog, img, centre} = await openDesktop(
    browser,
    'with-zoom',
  );
  try {
    await dialog.getByRole('button', {name: 'Zoom'}).focus();
    await page.keyboard.press('+');
    await waitForRest(img);
    const zoomed = await boxOf(img);
    await page.mouse.move(centre.x, centre.y);
    // A trackpad's stream of small deltas. One 120 px delta over a 360
    // legacy delta reads as a mouse wheel's notch.
    for (const dy of [12, 12, 12, 12, 12, 12, 11, 10, 9, 8]) {
      await wheel(0, dy);
    }
    await expect
      .poll(async () => (await boxOf(img)).y, {timeout: 3000})
      .toBeLessThan(zoomed.y - 20);
    await expect(dialog).toBeVisible();
  } finally {
    await context.close();
  }
});

test("a trackpad's scroll stops a zoomed photo at its edge, with no give, as a mouse drag does", async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'webkit', WHEEL_DRIVERS);
  const {wheel, context, page, dialog, img, centre} = await openDesktop(
    browser,
    'with-zoom',
  );
  try {
    await dialog.getByRole('button', {name: 'Zoom'}).focus();
    await page.keyboard.press('+');
    await waitForRest(img);
    // The gap between the photo's bottom edge and its stage's.
    const gap = async () =>
      img.evaluate(el => {
        const stage = (el.parentElement as HTMLElement).getBoundingClientRect();
        return stage.bottom - el.getBoundingClientRect().bottom;
      });
    // Zoomed 2×, the photo reaches well past the stage's bottom edge.
    expect(await gap()).toBeLessThan(-100);
    await page.mouse.move(centre.x, centre.y);
    // A trackpad's stream that runs far past the photo's bottom edge.
    const gaps: number[] = [];
    for (let i = 0; i < 60; i += 1) {
      await wheel(0, 12);
      gaps.push(await gap());
    }
    // The give past the edge belongs to the touch presentation. The photo's
    // edge stops at the stage's and stays there.
    expect(Math.max(...gaps)).toBeLessThan(0.5);
    expect(gaps.at(-1)).toBeGreaterThan(-0.5);
    await waitForRest(img);
    expect(Math.abs(await gap())).toBeLessThan(0.5);
  } finally {
    await context.close();
  }
});

test("a mouse wheel's notch leaves a zoomed photo in place", async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', WHEEL_DRIVERS);
  const {wheel, context, page, dialog, img, centre} = await openDesktop(
    browser,
    'with-zoom',
  );
  try {
    await dialog.getByRole('button', {name: 'Zoom'}).focus();
    await page.keyboard.press('+');
    await waitForRest(img);
    const zoomed = await boxOf(img);
    await page.mouse.move(centre.x, centre.y);
    await wheel(0, 120);
    // The host ends a notch's stream 100 ms after its last event. Fifteen
    // frames pass that at up to 120 Hz.
    await frames(page, 15);
    await waitForRest(img);
    const after = await boxOf(img);
    expect(Math.abs(after.x - zoomed.x)).toBeLessThan(1);
    expect(Math.abs(after.y - zoomed.y)).toBeLessThan(1);
    await expect(dialog).toBeVisible();
  } finally {
    await context.close();
  }
});

test('a zoomed photo stops at a mouse drag’s release, as on main', async ({
  browser,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Timed mouse events are dispatched through the Chrome DevTools Protocol.',
  );
  const {context, page, dialog, img, centre} = await openDesktop(
    browser,
    'with-zoom',
  );
  try {
    await dialog.getByRole('button', {name: 'Zoom'}).focus();
    await page.keyboard.press('+');
    await waitForRest(img);
    const mouse = await timedPointer(page, 'mouse');
    await mouse('mouseMoved', centre, 0);
    await mouse('mousePressed', centre, 16);
    for (let i = 1; i <= 6; i++) {
      await mouse('mouseMoved', {x: centre.x - 20 * i, y: centre.y}, 16);
    }
    await mouse('mouseReleased', {x: centre.x - 120, y: centre.y}, 4);
    const atRelease = (await boxOf(img)).x;
    await frames(page, 30);
    await waitForRest(img);
    // The coast belongs to the touch presentation: the photo stays where the
    // release left it.
    expect(Math.abs((await boxOf(img)).x - atRelease)).toBeLessThan(1);
  } finally {
    await context.close();
  }
});
