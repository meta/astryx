// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LightboxEveryPointer.interaction.browser.spec.ts
 * @input The built "With zoom", "Gallery with zoom" and "Default" Lightbox
 *   stories in a desktop context. It has a mouse and a trackpad's wheel, and
 *   in Chromium a pen and timed mouse events
 * @output Proofs for Lightbox's gestures under every pointer. A ctrl-wheel
 *   zooms, and a trackpad's scroll pans a zoomed photo and stops at its edge.
 *   A mouse wheel's notch leaves it in place, and a mouse drag's release
 *   stops it. A mouse's sideways drag and a trackpad's sideways scroll leave a
 *   gallery on its photo. A drag down by a mouse, a pen or a trackpad, or a
 *   wheel's notch, leaves a fitted photo in place
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
  requireFrames,
  waitForRest,
  webInputDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

type Story = 'with-zoom' | 'gallery-with-zoom' | 'default';

const TRIGGER: Record<Story, string> = {
  'with-zoom': 'Open with zoom',
  'gallery-with-zoom': 'Open gallery with zoom',
  default: 'Open lightbox',
};

function photoSvg(width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#5f7fa6"/><circle cx="${width / 2}" cy="${height / 2}" r="${height / 4}" fill="#fff" fill-opacity="0.35"/></svg>`;
}

interface Point {
  x: number;
  y: number;
}

/** The gap from the photo's bottom edge to its stage's, read by the page. */
interface EdgeSample {
  /** After a scroll event, on a frame, or at the stream's end. */
  kind: 'event' | 'frame' | 'end';
  /** When the page read it, page ms. */
  t: number;
  gap: number;
}

interface EdgeRecord {
  samples: EdgeSample[];
  stop: () => void;
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
  const img =
    story === 'gallery-with-zoom'
      ? dialog.locator('[data-current] img')
      : dialog.getByRole('img').first();
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

/** A mouse pressed at `from` and moved to `to` in `steps`, one a frame. */
async function mouseDrag(page: Page, from: Point, to: Point, steps: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * i) / steps,
      from.y + ((to.y - from.y) * i) / steps,
    );
    await frames(page, 1);
  }
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

test('a mouse drag down leaves a fitted photo and the viewer in place, as on main', async ({
  browser,
}) => {
  // The drag to close belongs to the touch presentation. Where the primary
  // pointer is fine, a mouse drag leaves the photo where it is.
  const {context, page, dialog, img, centre} = await openDesktop(
    browser,
    'with-zoom',
  );
  try {
    const before = await boxOf(img);
    await mouseDrag(page, centre, {x: centre.x, y: centre.y + 150}, 10);
    expect(Math.abs((await boxOf(img)).y - before.y)).toBeLessThan(1);
    await page.mouse.up();
    await frames(page, 30);
    await expect(dialog).toBeVisible();
    expect(Math.abs((await boxOf(img)).y - before.y)).toBeLessThan(1);
  } finally {
    await context.close();
  }
});

test('a mouse drag sideways leaves a gallery on its photo, as on main', async ({
  browser,
}) => {
  const {context, page, dialog, centre} = await openDesktop(
    browser,
    'gallery-with-zoom',
  );
  try {
    const counter = dialog.getByText(/^\d+ \/ \d+$/);
    await expect(counter).toHaveText('1 / 4');
    // Past half a page from the photo's right side: under a finger, the
    // release pages on its travel alone.
    await mouseDrag(page, {x: 1100, y: centre.y}, {x: 250, y: centre.y}, 17);
    await page.mouse.up();
    await frames(page, 30);
    await expect(counter).toHaveText('1 / 4');
  } finally {
    await context.close();
  }
});

const WHEEL_DRIVERS =
  "Chromium's driver sends each wheel as a mouse wheel's notch; WebKit's sends a trackpad's precise deltas.";

test('a trackpad’s horizontal scroll leaves a gallery on its photo', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'webkit', WHEEL_DRIVERS);
  const {wheel, context, page, dialog, centre} = await openDesktop(
    browser,
    'gallery-with-zoom',
  );
  try {
    const counter = dialog.getByText(/^\d+ \/ \d+$/);
    await expect(counter).toHaveText('1 / 4');
    await page.mouse.move(centre.x, centre.y);
    // Past half a page, which pages under a finger. No delta is a multiple
    // of 40 px, which would read as a mouse wheel's notch.
    for (let i = 0; i < 24; i++) {
      await wheel(30, 0);
      await frames(page, 1);
    }
    await frames(page, 30);
    await expect(counter).toHaveText('1 / 4');
  } finally {
    await context.close();
  }
});

test("a mouse wheel's notches leave a gallery on its photo", async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', WHEEL_DRIVERS);
  const {wheel, context, page, dialog, centre} = await openDesktop(
    browser,
    'gallery-with-zoom',
  );
  try {
    const counter = dialog.getByText(/^\d+ \/ \d+$/);
    await expect(counter).toHaveText('1 / 4');
    await page.mouse.move(centre.x, centre.y);
    for (let i = 0; i < 8; i++) {
      await wheel(120, 0);
      await frames(page, 1);
    }
    // The host ends a notch's stream 100 ms after its last event. Fifteen
    // frames pass that at up to 120 Hz.
    await frames(page, 15);
    await expect(counter).toHaveText('1 / 4');
  } finally {
    await context.close();
  }
});

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
  const {context, page, dialog, img, centre} = await openDesktop(
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
    // The page records the gap after every scroll event it receives, once
    // the stage's own listener has panned the photo, and on every frame.
    await img.evaluate(el => {
      const stage = el.parentElement as HTMLElement;
      const samples: EdgeSample[] = [];
      const read = (kind: EdgeSample['kind']) => {
        samples.push({
          kind,
          t: performance.now(),
          gap:
            stage.getBoundingClientRect().bottom -
            el.getBoundingClientRect().bottom,
        });
      };
      const onWheel = () => read('event');
      // On the window, the event's last stop: after the stage's listener.
      window.addEventListener('wheel', onWheel, {passive: true});
      let recording = true;
      const look = () => {
        if (recording) {
          read('frame');
          requestAnimationFrame(look);
        }
      };
      requestAnimationFrame(look);
      (window as unknown as {edgeRecord?: EdgeRecord}).edgeRecord = {
        samples,
        stop: () => {
          recording = false;
          window.removeEventListener('wheel', onWheel);
          read('end');
        },
      };
    });
    // A trackpad's stream that runs far past the photo's bottom edge, sent on
    // its own schedule rather than one awaited step at a time. Under a fine
    // pointer each scroll event pans and stops at the edge by itself. So the
    // stream need not reach the page as one gesture.
    const driver = await webInputDriver(page);
    await driver.wheelBurst({
      ...centre,
      steps: Array.from({length: 60}, () => ({dy: 12})),
    });
    const samples = await page.evaluate(() => {
      const {edgeRecord} = window as unknown as {edgeRecord: EdgeRecord};
      edgeRecord.stop();
      return edgeRecord.samples;
    });
    const gaps = samples.map(sample => sample.gap);
    // The give past the edge belongs to the touch presentation. The photo's
    // edge stops at the stage's and stays there.
    expect(Math.max(...gaps), JSON.stringify(samples)).toBeLessThan(0.5);
    expect(gaps.at(-1)).toBeGreaterThan(-0.5);
    // The stream went on pressing the photo against its edge: scroll events
    // reached the page after the photo stopped there. WebKit merges the
    // events it holds while the page is busy, so two are asked for.
    requireFrames(samples, {
      min: 2,
      during: 'scroll events press the photo against its edge',
      where: sample => sample.kind === 'event' && Math.abs(sample.gap) < 0.5,
    });
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

test('a pen drag down leaves a fitted photo and the viewer in place', async ({
  browser,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Pen input is dispatched through the Chrome DevTools Protocol.',
  );
  const {context, page, dialog, img, centre} = await openDesktop(
    browser,
    'with-zoom',
  );
  try {
    const before = await boxOf(img);
    const pen = await timedPointer(page, 'pen');
    await pen('mouseMoved', centre, 0);
    await pen('mousePressed', centre, 16);
    for (let i = 1; i <= 8; i++) {
      await pen('mouseMoved', {x: centre.x, y: centre.y + 20 * i}, 24);
    }
    expect(Math.abs((await boxOf(img)).y - before.y)).toBeLessThan(1);
    await pen('mouseReleased', {x: centre.x, y: centre.y + 160}, 8);
    await frames(page, 30);
    await expect(dialog).toBeVisible();
  } finally {
    await context.close();
  }
});

test("a trackpad's scroll down leaves a fitted photo and the viewer in place", async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'webkit', WHEEL_DRIVERS);
  const {wheel, context, page, dialog, img, centre} = await openDesktop(
    browser,
    'with-zoom',
  );
  try {
    const before = await boxOf(img);
    await page.mouse.move(centre.x, centre.y);
    const lowest = page.evaluate(
      async () =>
        new Promise<number>(resolve => {
          const photo = document.querySelector('dialog img');
          let low = photo?.getBoundingClientRect().y ?? 0;
          const t0 = performance.now();
          const tick = () => {
            low = Math.max(low, photo?.getBoundingClientRect().y ?? low);
            if (performance.now() - t0 < 400) {
              requestAnimationFrame(tick);
            } else {
              resolve(low);
            }
          };
          requestAnimationFrame(tick);
        }),
    );
    // A trackpad's swipe down, under natural scrolling. No delta is a
    // multiple of 40 px, which would read as a mouse wheel's notch.
    for (let i = 0; i < 10; i++) {
      await wheel(0, -12);
      await frames(page, 1);
    }
    // The drag to close belongs to the touch presentation: the photo stays.
    expect(await lowest).toBeLessThan(before.y + 1);
    await frames(page, 30);
    await expect(dialog).toBeVisible();
  } finally {
    await context.close();
  }
});

test("a mouse wheel's notch leaves a fitted photo and the viewer in place", async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', WHEEL_DRIVERS);
  const {wheel, context, page, dialog, img, centre} = await openDesktop(
    browser,
    'with-zoom',
  );
  try {
    const before = await boxOf(img);
    await page.mouse.move(centre.x, centre.y);
    await wheel(0, -100);
    // The host ends a notch's stream 100 ms after its last event. Fifteen
    // frames pass that at up to 120 Hz.
    await frames(page, 15);
    expect(Math.abs((await boxOf(img)).y - before.y)).toBeLessThan(1);
    await expect(dialog).toBeVisible();
  } finally {
    await context.close();
  }
});
