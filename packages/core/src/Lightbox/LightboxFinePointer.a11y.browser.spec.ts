// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LightboxFinePointer.a11y.browser.spec.ts
 * @input The built Lightbox "with zoom" story, a desktop browser (a fine
 *   primary pointer) and real mouse input; in Chromium, pen input
 * @output Evidence that the gestures take every pointer where the primary
 *   pointer is fine too. It covers the zoom's touches as on a phone, and a
 *   photo without zoom that leaves touches to the page. It also covers the
 *   double-click's 2× zoom, the keyboard's spring, pen and mouse drags, and a
 *   gallery's Next, arrows, dark-area click, counter and caption band
 * @position Cross-browser proof for Lightbox under a fine primary pointer
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {
  armHold,
  releaseAnimations,
  seekAnimations,
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

const PHOTO = {width: 3000, height: 2000};

/** A landscape test photo: a checker with a red disc at its centre. */
function photoSvg(width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#fff"/><circle cx="${width / 2}" cy="${height / 2}" r="${height / 4}" fill="#d22"/></svg>`;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Opens the story's viewer with the mouse and waits for the photo. */
async function openViewer(page: Page) {
  await page.route(/\/sample-[a-z]+-\d+x\d+[^/]*\.svg/, async route =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: photoSvg(PHOTO.width, PHOTO.height),
    }),
  );
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-lightbox--with-zoom&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Open with zoom'}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const stage = dialog.getByRole('button', {name: 'Zoom'});
  const img = dialog.getByRole('img', {name: 'Forest path'});
  await expect
    .poll(async () => img.evaluate(el => (el as HTMLImageElement).naturalWidth))
    .toBe(PHOTO.width);
  await settled(page);
  const fitted = await boxOf(img);
  const stageBox = await boxOf(stage);
  return {dialog, stage, img, fitted, stageBox};
}

async function boxOf(locator: {
  evaluate: <R>(fn: (el: Element) => R) => Promise<R>;
}): Promise<Box> {
  return locator.evaluate(el => {
    const r = el.getBoundingClientRect();
    return {x: r.x, y: r.y, width: r.width, height: r.height};
  });
}

/** Waits until the photo's box holds still for six frames (at most 3 s). */
async function settled(page: Page): Promise<void> {
  await page.evaluate(
    async () =>
      new Promise<void>(resolve => {
        const img = document.querySelector('dialog img');
        const started = performance.now();
        let last = '';
        let still = 0;
        const tick = (now: number) => {
          const r = img?.getBoundingClientRect();
          const key = r ? `${r.x},${r.y},${r.width},${r.height}` : '';
          still = key === last ? still + 1 : 0;
          last = key;
          if (still >= 6 || now - started > 3000) {
            resolve();
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      }),
  );
}

function centre(box: Box) {
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

test("the zoom target's focus ring sits inside the stage, which a clipping group holds", async ({
  page,
}) => {
  const {stage} = await openViewer(page);
  await stage.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(stage).toBeFocused();
  // The zoom target is the photo's box on the stage's one page. The stage
  // clips it, as a gallery's.
  const ring = await stage.evaluate(el => {
    const style = getComputedStyle(el);
    return {
      width: parseFloat(style.outlineWidth),
      offset: parseFloat(style.outlineOffset),
      clips: getComputedStyle(
        el.closest('[data-lightbox-media] > :first-child') as Element,
      ).overflow,
    };
  });
  expect(ring.clips).toBe('hidden');
  expect(ring.width).toBeGreaterThan(0);
  // The whole ring is drawn inside the stage's box.
  expect(ring.offset).toBeLessThanOrEqual(-ring.width);
});

test("a caption sits in its band under the photo's box, zoomed or not, as in a gallery", async ({
  page,
}) => {
  // A 3:1 panorama leaves the photo's box most of its height free.
  await page.route(/\/sample-[a-z]+-\d+x\d+[^/]*\.svg/, async route =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: photoSvg(3000, 1000),
    }),
  );
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-lightbox--zoom-with-caption&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Open zoom with caption'}).click();
  const dialog = page.getByRole('dialog');
  const img = dialog.getByRole('img', {name: 'Forest path'});
  await expect
    .poll(async () => img.evaluate(el => (el as HTMLImageElement).naturalWidth))
    .toBe(3000);
  const caption = dialog.locator('[data-lightbox-caption]');
  const stage = dialog.getByRole('button', {name: 'Zoom'});
  // The band starts where the photo's box ends, and the fitted photo centres
  // in that box, clear of the band.
  const band = async () =>
    caption.evaluate(el => {
      const r = (el.parentElement as HTMLElement).getBoundingClientRect();
      return {top: r.top, height: r.height};
    });
  const stageBox = await boxOf(stage);
  const fitted = await band();
  expect(Math.abs(fitted.top - (stageBox.y + stageBox.height))).toBeLessThan(
    0.5,
  );
  const photo = await boxOf(img);
  expect(photo.y + photo.height).toBeLessThanOrEqual(fitted.top + 0.5);
  // Zoomed, the photo fills its box, and the band and caption stay put.
  const captionBox = await boxOf(caption);
  await page.mouse.dblclick(centre(stageBox).x, centre(stageBox).y);
  await expect(stage).toHaveAttribute('aria-pressed', 'true');
  await settled(page);
  expect(await band()).toEqual(fitted);
  expect(await boxOf(caption)).toEqual(captionBox);
});

/** Opens the gallery story (zoom on) at its first photo with the mouse. */
async function openGallery(page: Page) {
  await page.route(/\/sample-[a-z]+-\d+x\d+[^/]*\.svg/, async route =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: photoSvg(PHOTO.width, PHOTO.height),
    }),
  );
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-lightbox--gallery-with-zoom&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Open gallery with zoom'}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('1 / 4');
  const current = dialog.locator('[data-current] img');
  await expect
    .poll(async () =>
      current.evaluate(el => (el as HTMLImageElement).naturalWidth),
    )
    .toBe(PHOTO.width);
  await settled(page);
  return {dialog, current};
}

/** Opens the "Gallery with captions" story with the mouse and waits for the photo. */
async function openCaptionGallery(page: Page) {
  await page.route(/\/sample-[a-z]+-\d+x\d+[^/]*\.svg/, async route =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: photoSvg(PHOTO.width, PHOTO.height),
    }),
  );
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-lightbox--gallery-with-captions&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Open gallery with captions'}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const current = dialog.locator('[data-current] img');
  await expect
    .poll(async () =>
      current.evaluate(el => (el as HTMLImageElement).naturalWidth),
    )
    .toBe(PHOTO.width);
  await settled(page);
  return {dialog, current};
}

/** The current page's caption band and its caption. */
async function captionBoxes(
  dialog: Locator,
): Promise<{band: Box; caption: Box}> {
  return dialog.evaluate(viewer => {
    const caption = viewer.querySelector(
      '[data-current] [data-lightbox-caption]',
    );
    const band = caption?.parentElement;
    if (caption == null || band == null) {
      throw new Error('no caption band');
    }
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return {x: r.x, y: r.y, width: r.width, height: r.height};
    };
    return {band: box(band), caption: box(caption)};
  });
}

/** Clicks `point`, which must be the dark area, and expects the viewer gone. */
async function expectBackdropClickCloses(
  page: Page,
  dialog: Locator,
  point: {x: number; y: number},
): Promise<void> {
  const hit = await page.evaluate(({x, y}) => {
    const el = document.elementFromPoint(x, y);
    return {
      isControl: el?.closest('button, a, input') != null,
      isPhoto: el instanceof HTMLImageElement,
      inDialog: el?.closest('dialog') != null,
    };
  }, point);
  expect(hit).toEqual({isControl: false, isPhoto: false, inDialog: true});
  await page.mouse.click(point.x, point.y);
  await expect(dialog).toBeHidden();
}

/** The computed touch-action of the photo and each ancestor below the dialog. */
async function touchActionsAbove(photo: Locator): Promise<string[]> {
  return photo.evaluate(el => {
    const actions: string[] = [];
    for (
      let node: Element | null = el;
      node != null && node.tagName !== 'DIALOG';
      node = node.parentElement
    ) {
      actions.push(getComputedStyle(node).touchAction);
    }
    return actions;
  });
}

test('the zoom target takes its touches as on a phone where the primary pointer is fine too', async ({
  page,
}) => {
  const {stage, img} = await openViewer(page);
  // Gestures attach for every pointer. A touchscreen laptop's finger pinches
  // and pans the photo as on a phone, so the zoom target claims its touches,
  // as under a coarse pointer.
  expect(await stage.evaluate(el => getComputedStyle(el).touchAction)).toBe(
    'none',
  );
  // As in a gallery, the photo's box claims them and the track, the zoom
  // stage's surface, leaves only the page's pinch-zoom. The last is the media
  // surface, which has no box.
  expect(await touchActionsAbove(img)).toEqual([
    'auto',
    'none',
    'auto',
    'pinch-zoom',
    'auto',
    'auto',
    'auto',
    'auto',
  ]);
});

test('a photo without zoom leaves its touches to the page where the primary pointer is fine, as on main', async ({
  page,
}) => {
  // The drag to close belongs to the touch presentation, which a coarse
  // primary pointer brings. A touchscreen laptop's finger scrolls and zooms
  // the page around a photo without zoom, as on main.
  await page.route(/\/sample-[a-z]+-\d+x\d+[^/]*\.svg/, async route =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: photoSvg(PHOTO.width, PHOTO.height),
    }),
  );
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-lightbox--default&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Open lightbox'}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const photo = dialog.getByRole('img').first();
  // The photo's page, its track and the stage sit between them. The last is
  // the media surface, which has no box.
  expect(await touchActionsAbove(photo)).toEqual([
    'auto',
    'auto',
    'auto',
    'auto',
    'auto',
    'auto',
    'auto',
    'auto',
  ]);
});

test('a gallery leaves its sideways touches to the page where the primary pointer is fine', async ({
  page,
}) => {
  // The current photo's row claims its touches for the zoom, as under a
  // coarse pointer. The track, the zoom stage's surface, leaves only the
  // page's pinch-zoom. The drag paging is the touch presentation's, so the
  // pager's viewport claims no pan.
  const {current} = await openGallery(page);
  // The last is the media surface, which has no box.
  expect(await touchActionsAbove(current)).toEqual([
    'auto',
    'none',
    'auto',
    'pinch-zoom',
    'auto',
    'auto',
    'auto',
    'auto',
  ]);
});

for (const via of ['the Next button', 'the arrow key'] as const) {
  test(`${via} shows the next photo at once where the primary pointer is fine`, async ({
    page,
  }) => {
    const {dialog} = await openGallery(page);
    // The track's place every frame from the press on. Under a finger the
    // pager slides; with a mouse or the keyboard the new photo shows at once,
    // as it always has. The sampler is installed and awaited before the press,
    // since a press the page gets first would leave it waiting. It runs for
    // 600 ms and at least 12 frames, since a busy runner paints few frames.
    // At half the test's timeout it gives up, so too few frames fail by name.
    const giveUpMs = test.info().timeout / 2;
    await page.evaluate(giveUpMs => {
      (window as unknown as {__places: Promise<number[]>}).__places =
        new Promise<number[]>(resolve => {
          const track = document.querySelector(
            'dialog [data-lightbox-page]',
          )?.parentElement;
          const places: number[] = [];
          let start: number | null = null;
          const begin = () => {
            start = performance.now();
            window.setTimeout(() => resolve(places), giveUpMs);
          };
          window.addEventListener('click', begin, {capture: true, once: true});
          window.addEventListener('keydown', begin, {
            capture: true,
            once: true,
          });
          const tick = (now: number) => {
            if (start != null && track != null) {
              places.push(Math.round(track.getBoundingClientRect().x));
            }
            if (start == null || now - start < 600 || places.length < 12) {
              requestAnimationFrame(tick);
            } else {
              resolve(places);
            }
          };
          requestAnimationFrame(tick);
        });
    }, giveUpMs);
    if (via === 'the Next button') {
      await dialog.getByRole('button', {name: 'Next'}).click();
    } else {
      await page.keyboard.press('ArrowRight');
    }
    const places = await page.evaluate(
      async () => (window as unknown as {__places: Promise<number[]>}).__places,
    );
    await expect(dialog).toContainText('2 / 4');
    expect(places.length, 'too few frames to judge').toBeGreaterThanOrEqual(12);
    // One place from the first frame after the press: no frame in between.
    expect(new Set(places).size).toBe(1);
  });
}

test('a mouse click above the photo closes the viewer with zoom on, as before', async ({
  page,
}) => {
  // A window taller than the photo's fitted height leaves the dark area
  // above it, outside the media, where a click closes the viewer.
  await page.setViewportSize({width: 1280, height: 1000});
  const {dialog, img} = await openViewer(page);
  const shown = await boxOf(img);
  expect(shown.y).toBeGreaterThan(40);
  await expectBackdropClickCloses(page, dialog, {
    x: shown.x + shown.width / 2,
    y: shown.y / 2,
  });
});

test('in a gallery, a mouse click beside a large photo shown smaller, level with it, closes the viewer', async ({
  page,
}) => {
  // A photo wider than the viewer is shown smaller. The media is the shown
  // photo, not its natural width, so a click beside it is the backdrop's.
  const {dialog, current} = await openGallery(page);
  const shown = await boxOf(current);
  expect(shown.x).toBeGreaterThan(40);
  const level = shown.y + shown.height * 0.15;
  await expectBackdropClickCloses(page, dialog, {x: shown.x / 2, y: level});
});

test('at 1280 × 800, a mouse click 4 or 20 px beside a gallery photo scaled down to fit closes the viewer, and one on the photo or its caption band keeps it open', async ({
  page,
}) => {
  await page.setViewportSize({width: 1280, height: 800});
  // The story's own photo size, which the window scales down to fit.
  await page.route(/\/sample-[a-z]+-\d+x\d+[^/]*\.svg/, async route =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: photoSvg(1200, 800),
    }),
  );
  const open = async () => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-lightbox--gallery-with-zoom&viewMode=story`,
    );
    await page.getByRole('button', {name: 'Open gallery with zoom'}).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const current = dialog.locator('[data-current] img');
    await expect
      .poll(async () =>
        current.evaluate(el => (el as HTMLImageElement).naturalWidth),
      )
      .toBe(1200);
    await settled(page);
    return {dialog, shown: await boxOf(current)};
  };
  let {dialog, shown} = await open();
  expect(shown.width).toBeLessThan(1200);
  const level = shown.y + shown.height / 2;
  for (const gap of [4, 20]) {
    await expectBackdropClickCloses(page, dialog, {x: shown.x - gap, y: level});
    ({dialog, shown} = await open());
  }
  expect(await staysOpenAfterClick(page, centre(shown))).toBe(true);
  const {band, caption} = await captionBoxes(dialog);
  expect(band.x).toBeLessThan(caption.x - 12);
  expect(
    await staysOpenAfterClick(page, {
      x: band.x + 12,
      y: caption.y + caption.height / 2,
    }),
  ).toBe(true);
});

test('a mouse click on the gallery counter leaves the viewer open, as on main', async ({
  page,
}) => {
  // A window taller than the photo's fitted height leaves the dark area
  // above it, where the counter sits and a click beside the photo closes.
  await page.setViewportSize({width: 1280, height: 1000});
  const {dialog, current} = await openGallery(page);
  const counter = dialog.getByText('1 / 4', {exact: true});
  await expect(counter).toBeVisible();
  const box = await boxOf(counter);
  expect(box.width).toBeGreaterThan(0);
  expect(box.y + box.height).toBeLessThan((await boxOf(current)).y);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(400);
  await expect(dialog).toBeVisible();
});

test('without zoom, a mouse click at the far edge beside a large gallery photo closes the viewer', async ({
  page,
}) => {
  await page.setViewportSize({width: 1280, height: 800});
  await page.route(/\/sample-[a-z]+-\d+x\d+[^/]*\.svg/, async route =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: photoSvg(PHOTO.width, PHOTO.height),
    }),
  );
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-lightbox--gallery&viewMode=story`,
  );
  await page.locator('#storybook-root img').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const current = dialog.locator('[data-current] img');
  await expect
    .poll(async () =>
      current.evaluate(el => (el as HTMLImageElement).naturalWidth),
    )
    .toBe(PHOTO.width);
  await settled(page);
  const shown = await boxOf(current);
  // The photo leaves dark area at the window's right edge, level with it.
  expect(1280 - (shown.x + shown.width)).toBeGreaterThan(20);
  await expectBackdropClickCloses(page, dialog, {
    x: 1276,
    y: shown.y + shown.height / 2,
  });
});

test('a mouse double-click zooms 2× about the clicked point, and the next zooms back', async ({
  page,
}) => {
  const {stage, img, fitted, stageBox} = await openViewer(page);
  // A quarter of the way in from the photo's top-left corner.
  const click = {
    x: fitted.x + fitted.width / 4,
    y: fitted.y + fitted.height / 4,
  };
  await page.mouse.dblclick(click.x, click.y);
  await expect(stage).toHaveAttribute('aria-pressed', 'true');
  await settled(page);
  const zoomed = await boxOf(img);
  expect(zoomed.width / fitted.width).toBeCloseTo(2, 2);
  // The clicked photo point stays under the pointer on each axis where the
  // zoomed photo overflows the stage. At least one axis does.
  const overflowsX = zoomed.width > stageBox.width + 1;
  const overflowsY = zoomed.height > stageBox.height + 1;
  expect(overflowsX || overflowsY).toBe(true);
  if (overflowsX) {
    expect(zoomed.x + (click.x - fitted.x) * 2).toBeCloseTo(click.x, 0);
  }
  if (overflowsY) {
    expect(zoomed.y + (click.y - fitted.y) * 2).toBeCloseTo(click.y, 0);
  }
  await page.mouse.dblclick(centre(stageBox).x, centre(stageBox).y);
  await expect(stage).toHaveAttribute('aria-pressed', 'false');
  await settled(page);
  const back = await boxOf(img);
  expect(back.width).toBeCloseTo(fitted.width, 1);
  expect(back.x).toBeCloseTo(fitted.x, 1);
});

/**
 * `springs.settle`'s progress `ms` in from rest: SwiftUI's smooth spring
 * (duration 0.5 s, no bounce), critically damped.
 */
function settleProgress(ms: number): number {
  const x = ((2 * Math.PI) / 0.5) * (ms / 1000);
  return 1 - (1 + x) * Math.exp(-x);
}

/**
 * Checks that the photo's zoom, which `act` starts, settles on
 * `springs.settle` from rest. The zoom's own animations on the photo are held
 * as they start, and its width is read at set times on their clock. A busy
 * runner's late frames then move no reading.
 */
async function expectSpringZoom(
  page: Page,
  img: Locator,
  fitted: Box,
  act: () => Promise<void>,
): Promise<void> {
  // The page holds the zoom itself as it starts: a hold sent from the test
  // would reach a busy page late. Runs that an earlier zoom left in their end
  // hold are not this zoom.
  const hold = await armHold(page, img, {
    judges: {target: img, property: 'scale'},
    newOnly: true,
  });
  await act();
  const held = await hold.held();
  expect(
    held.length,
    'the zoom runs as animations on the photo',
  ).toBeGreaterThan(0);
  // Its animations start together, so one instant reads them all.
  expect(held.every(({offsetMs}) => offsetMs === 0)).toBe(true);
  const to = fitted.width * 2;
  const progressAt = async (ms: number) => {
    await seekAnimations(page, ms);
    return ((await boxOf(img)).width - fitted.width) / (to - fitted.width);
  };
  // The spring's own course: about 0.36 at 100 ms, where a 200 ms ease-out
  // is past 0.6, and 0.72 at 200 ms. A spring 5 % slower or faster reads
  // more than 0.02 off at 100 and 200 ms.
  for (const ms of [100, 200, 300]) {
    expect(
      Math.abs((await progressAt(ms)) - settleProgress(ms)),
      `${ms} ms`,
    ).toBeLessThan(0.02);
  }
  // It comes within half a percent of the target near 0.59 s: not yet at
  // 450 ms, and by 800 ms.
  expect(await progressAt(450)).toBeLessThanOrEqual(0.995);
  expect(await progressAt(800)).toBeGreaterThan(0.995);
  await releaseAnimations(page, {finish: true});
}

test('the keyboard’s zoom settles on springs.settle', async ({page}) => {
  const {stage, img, fitted} = await openViewer(page);
  // Unpaused, the keyboard's zoom reaches 2× and returns to the fitted size.
  await stage.focus();
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await boxOf(img)).width)
    .toBeCloseTo(fitted.width * 2, 0);
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await boxOf(img)).width)
    .toBeCloseTo(fitted.width, 0);
  await settled(page);
  // Enter zooms 2× about the centre, on the spring every zoom plays.
  await expectSpringZoom(page, img, fitted, async () => {
    await stage.focus();
    await page.keyboard.press('Enter');
  });
});

test('a mouse double-click settles on springs.settle too', async ({page}) => {
  const {stageBox, img, fitted} = await openViewer(page);
  const middle = centre(stageBox);
  await expectSpringZoom(page, img, fitted, async () => {
    await page.mouse.dblclick(middle.x, middle.y);
  });
});

test('a pen double-click zooms 2× too', async ({page, browserName}) => {
  test.skip(
    browserName !== 'chromium',
    'Pen input is dispatched through the Chrome DevTools Protocol.',
  );
  const {stage, img, fitted, stageBox} = await openViewer(page);
  const cdp = await page.context().newCDPSession(page);
  const {x, y} = centre(stageBox);
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x,
    y,
    pointerType: 'pen',
  });
  for (const clickCount of [1, 2]) {
    for (const type of ['mousePressed', 'mouseReleased'] as const) {
      await cdp.send('Input.dispatchMouseEvent', {
        type,
        x,
        y,
        button: 'left',
        clickCount,
        pointerType: 'pen',
      });
    }
  }
  await expect(stage).toHaveAttribute('aria-pressed', 'true');
  await settled(page);
  expect((await boxOf(img)).width / fitted.width).toBeCloseTo(2, 2);
});

test('a pen drag pans a zoomed photo through the stage’s pan', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Pen input is dispatched through the Chrome DevTools Protocol.',
  );
  const {stage, img, stageBox} = await openViewer(page);
  const middle = centre(stageBox);
  // 2x about the centre, with room to pan either way.
  await stage.focus();
  await page.keyboard.press('+');
  await expect(stage).toHaveAttribute('aria-pressed', 'true');
  await settled(page);
  const before = await boxOf(img);
  const cdp = await page.context().newCDPSession(page);
  const pen = async (
    type: 'mouseMoved' | 'mousePressed' | 'mouseReleased',
    x: number,
    pressed: boolean,
  ) =>
    cdp.send('Input.dispatchMouseEvent', {
      type,
      x,
      y: middle.y,
      pointerType: 'pen',
      button: type === 'mouseMoved' && !pressed ? 'none' : 'left',
      buttons: pressed ? 1 : 0,
      clickCount: type === 'mouseMoved' ? 0 : 1,
    });
  await pen('mouseMoved', middle.x, false);
  await pen('mousePressed', middle.x, true);
  for (let i = 1; i <= 8; i++) {
    await pen('mouseMoved', middle.x - i * 10, true);
  }
  await pen('mouseReleased', middle.x - 80, false);
  await settled(page);
  const after = await boxOf(img);
  // The stage's pan takes the pen and follows it from the first move.
  expect(after.x - before.x).toBeLessThanOrEqual(-70);
});

test('a mouse drag stops at the photo’s edges instead of carrying it out of view', async ({
  page,
}) => {
  const {stage, img, stageBox} = await openViewer(page);
  const middle = centre(stageBox);
  await page.mouse.dblclick(middle.x, middle.y);
  await expect(stage).toHaveAttribute('aria-pressed', 'true');
  await settled(page);
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.down();
  await page.mouse.move(middle.x + 1500, middle.y + 900, {steps: 12});
  await page.mouse.up();
  await settled(page);
  const dragged = await boxOf(img);
  // The photo's left edge stops on the stage's left edge. It still covers the
  // stage's width, since 2× a fitted photo is wider than the stage.
  expect(dragged.x).toBeLessThanOrEqual(stageBox.x + 0.5);
  expect(dragged.x + dragged.width).toBeGreaterThanOrEqual(
    stageBox.x + stageBox.width - 0.5,
  );
  // Vertically it stays where a zoomed photo may rest: inside the stage
  // where it is shorter, covering it where taller.
  if (dragged.height <= stageBox.height) {
    expect(dragged.y).toBeGreaterThanOrEqual(stageBox.y - 0.5);
    expect(dragged.y + dragged.height).toBeLessThanOrEqual(
      stageBox.y + stageBox.height + 0.5,
    );
  } else {
    expect(dragged.y).toBeLessThanOrEqual(stageBox.y + 0.5);
  }
});

/** Clicks `point` with the mouse; true when the viewer is still open. */
async function staysOpenAfterClick(
  page: Page,
  point: {x: number; y: number},
): Promise<boolean> {
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(400);
  return page.evaluate(() => document.querySelector('dialog')?.open === true);
}

test('a mouse click beside the fitted photo, level with it, closes the viewer on either side', async ({
  page,
}) => {
  const {dialog, fitted, stageBox} = await openViewer(page);
  // The fitted photo leaves dark stage on both sides, where a click is the
  // backdrop's.
  expect(fitted.x - stageBox.x).toBeGreaterThan(40);
  const level = fitted.y + fitted.height / 2;
  await expectBackdropClickCloses(page, dialog, {x: stageBox.x + 20, y: level});
  const again = await openViewer(page);
  await expectBackdropClickCloses(page, again.dialog, {
    x: again.fitted.x + again.fitted.width + 20,
    y: level,
  });
});

test('with zoom on, a mouse click on the photo leaves the viewer open and one below it closes, as on main', async ({
  page,
}) => {
  await page.setViewportSize({width: 1280, height: 1000});
  const {fitted} = await openViewer(page);
  expect(await staysOpenAfterClick(page, centre(fitted))).toBe(true);
  const bottom = fitted.y + fitted.height;
  expect(1000 - bottom).toBeGreaterThan(40);
  expect(
    await staysOpenAfterClick(page, {
      x: fitted.x + fitted.width / 2,
      y: (bottom + 1000) / 2,
    }),
  ).toBe(false);
});

test('after a 2× double-click, a mouse click on the zoomed photo above the fitted box leaves the viewer open', async ({
  page,
}) => {
  await page.setViewportSize({width: 1280, height: 1000});
  const {stage, img, fitted, stageBox} = await openViewer(page);
  expect(fitted.y - stageBox.y).toBeGreaterThan(40);
  await page.mouse.dblclick(centre(fitted).x, centre(fitted).y);
  await expect(stage).toHaveAttribute('aria-pressed', 'true');
  await settled(page);
  // 30 px from the top: above the fitted box, on the zoomed photo.
  const point = {x: centre(fitted).x, y: stageBox.y + 30};
  const zoomed = await boxOf(img);
  expect(point.y).toBeLessThan(fitted.y);
  expect(point.y).toBeGreaterThan(zoomed.y);
  expect(await staysOpenAfterClick(page, point)).toBe(true);
});

test('a mouse press on the fitted photo released above it closes the viewer, as main’s click does', async ({
  page,
}) => {
  await page.setViewportSize({width: 1280, height: 1000});
  const {fitted} = await openViewer(page);
  expect(fitted.y).toBeGreaterThan(40);
  const middle = centre(fitted);
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.down();
  await page.mouse.move(middle.x, fitted.y / 2, {steps: 5});
  await page.mouse.up();
  await page.waitForTimeout(400);
  expect(
    await page.evaluate(() => document.querySelector('dialog')?.open === true),
  ).toBe(false);
});

test('without zoom, a mouse click beside the photo or above it closes the viewer', async ({
  page,
}) => {
  await page.route(/\/sample-[a-z]+-\d+x\d+[^/]*\.svg/, async route =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: photoSvg(PHOTO.width, PHOTO.height),
    }),
  );
  const open = async () => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-lightbox--default&viewMode=story`,
    );
    await page.getByRole('button', {name: 'Open lightbox'}).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const img = page.getByRole('dialog').getByRole('img').first();
    await expect
      .poll(async () =>
        img.evaluate(el => (el as HTMLImageElement).naturalWidth),
      )
      .toBe(PHOTO.width);
    await settled(page);
    return boxOf(img);
  };
  const fitted = await open();
  expect(fitted.x).toBeGreaterThan(40);
  expect(
    await staysOpenAfterClick(page, {
      x: fitted.x / 2,
      y: fitted.y + fitted.height / 2,
    }),
  ).toBe(false);
  await page.setViewportSize({width: 1280, height: 1100});
  const tall = await open();
  expect(tall.y).toBeGreaterThan(40);
  expect(
    await staysOpenAfterClick(page, {
      x: tall.x + tall.width / 2,
      y: tall.y / 2,
    }),
  ).toBe(false);
});

test('a mouse click on a gallery’s caption band leaves the viewer open, beside its caption or on it', async ({
  page,
}) => {
  await page.setViewportSize({width: 900, height: 1000});
  const {dialog} = await openCaptionGallery(page);
  const {band, caption} = await captionBoxes(dialog);
  // The caption is narrower than its band, so the band shows beside it.
  expect(caption.x - band.x).toBeGreaterThan(40);
  const level = band.y + band.height / 2;
  expect(await staysOpenAfterClick(page, {x: band.x + 12, y: level})).toBe(
    true,
  );
  expect(
    await staysOpenAfterClick(page, {
      x: caption.x + caption.width / 2,
      y: caption.y + 8,
    }),
  ).toBe(true);
});

test('a mouse click between a gallery photo and its caption band closes the viewer', async ({
  page,
}) => {
  // A window taller than the fitted photo leaves dark area between the photo
  // and the band.
  await page.setViewportSize({width: 900, height: 1000});
  const {dialog, current} = await openCaptionGallery(page);
  const photo = await boxOf(current);
  const {band} = await captionBoxes(dialog);
  const gap = band.y - (photo.y + photo.height);
  expect(gap).toBeGreaterThan(40);
  await expectBackdropClickCloses(page, dialog, {
    x: photo.x + photo.width / 2,
    y: photo.y + photo.height + gap / 2,
  });
});

test('with zoom, a mouse double-click on a single photo’s caption zooms the photo, and the caption stays its description', async ({
  page,
}) => {
  await page.route(/\/sample-[a-z]+-\d+x\d+[^/]*\.svg/, async route =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: photoSvg(PHOTO.width, PHOTO.height),
    }),
  );
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-lightbox--zoom-with-caption&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Open zoom with caption'}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const img = dialog.getByRole('img', {name: 'Forest path'});
  await expect
    .poll(async () => img.evaluate(el => (el as HTMLImageElement).naturalWidth))
    .toBe(PHOTO.width);
  await settled(page);
  const fitted = await boxOf(img);
  // The middle of the caption's first word.
  const word = await dialog.evaluate(viewer => {
    const caption = viewer.querySelector(
      '[data-lightbox-caption] .astryx-text',
    );
    const walker = document.createTreeWalker(
      caption ?? viewer,
      NodeFilter.SHOW_TEXT,
    );
    let node = walker.nextNode() as Text | null;
    while (node != null && node.data.trim() === '') {
      node = walker.nextNode() as Text | null;
    }
    if (node == null) {
      throw new Error('no caption text');
    }
    const start = node.data.search(/\S/);
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + 1);
    const r = range.getBoundingClientRect();
    return {x: r.x + r.width / 2, y: r.y + r.height / 2};
  });
  await page.mouse.dblclick(word.x, word.y);
  await expect
    .poll(async () => (await boxOf(img)).width)
    .toBeGreaterThan(fitted.width * 1.5);
  expect(await page.evaluate(() => String(window.getSelection()).trim())).toBe(
    '',
  );
  // Screen readers still read the caption: it is the viewer's description.
  await expect(dialog).toHaveAccessibleDescription(
    'A winding path through the forest',
  );
});

test('in a gallery with zoom, a mouse click beside a narrow photo, level with it, closes the viewer within its caption’s width or past it', async ({
  page,
}) => {
  // A photo narrower than its caption. The caption's band sits under the
  // photo, so the dark space beside the photo is the backdrop's.
  await page.setViewportSize({width: 1280, height: 1100});
  await page.route(/\/sample-[a-z]+-\d+x\d+[^/]*\.svg/, async route =>
    route.fulfill({contentType: 'image/svg+xml', body: photoSvg(200, 1200)}),
  );
  const open = async () => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-lightbox--gallery-with-zoom&viewMode=story`,
    );
    await page.getByRole('button', {name: 'Open gallery with zoom'}).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const img = dialog.getByRole('img').first();
    await expect
      .poll(async () =>
        img.evaluate(el => (el as HTMLImageElement).naturalWidth),
      )
      .toBe(200);
    await settled(page);
    // The current page's own caption.
    const caption = await dialog.evaluate(viewer => {
      const r = viewer
        .querySelector('[data-current] [data-lightbox-caption]')
        ?.getBoundingClientRect();
      return r == null ? null : {x: r.x, width: r.width};
    });
    if (caption == null) {
      throw new Error('no caption');
    }
    return {dialog, photo: await boxOf(img), caption};
  };
  const first = await open();
  const level = first.photo.y + first.photo.height / 2;
  // Within the caption's width, beside the photo.
  expect(first.caption.x).toBeLessThan(first.photo.x - 10);
  await expectBackdropClickCloses(page, first.dialog, {
    x: (first.caption.x + first.photo.x) / 2,
    y: level,
  });
  // Past the caption's width.
  const second = await open();
  expect(second.caption.x).toBeGreaterThan(60);
  await expectBackdropClickCloses(page, second.dialog, {
    x: second.caption.x - 30,
    y: level,
  });
});
