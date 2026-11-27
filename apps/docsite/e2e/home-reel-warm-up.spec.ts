// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file home-reel-warm-up.spec.ts
 * @input Production docsite home page at a phone size and at a desktop size
 * @output Proof of which hero reel photos the built page requests: at a
 *   phone size, those of another slide only after a touch moves sideways on
 *   the reel, a press moves it, or the keyboard reaches its dots; at a
 *   desktop size, those of every slide once, with no input. At both sizes
 *   the page requests each photo once, at the width that the browser selects
 *   for a card: a slide shows the file that the reel loaded ahead.
 * @position Docsite browser tests. hero-reel-warm-up.test.tsx covers the
 *   fonts and each rule of the reel; only a browser sends real touches,
 *   tells keyboard focus from a press, and counts real requests.
 */

import {expect, test, type Page} from '@playwright/test';
import {expectTooltipsLive} from './liveTooltips';

// The reel's slides in their order. Each photo's file name starts with one
// of these names.
const SLIDES = ['neutral', 'matcha', 'butter', 'gothic', 'y2k'];
const PHOTOS_PER_SLIDE = 3;

/**
 * Records each request for a reel photo: its file name, and the width that
 * the request asks the image optimizer for.
 */
function watchReelPhotos(page: Page) {
  const requests: Array<{file: string; width: string | null}> = [];
  page.on('request', request => {
    const url = new URL(request.url());
    const file =
      /^\/landing\/hero\/((?:neutral|matcha|butter|gothic|y2k)-[a-z]+)\.webp$/u.exec(
        url.searchParams.get('url') ?? url.pathname,
      );
    if (file != null) {
      requests.push({file: file[1], width: url.searchParams.get('w')});
    }
  });
  const files = () => requests.map(request => request.file);
  return {
    /** How many photos of each slide the page asked for. */
    bySlide: () =>
      SLIDES.map(
        slide =>
          new Set(files().filter(file => file.startsWith(`${slide}-`))).size,
      ),
    /** Each request for a photo that the page had asked for before. */
    repeated: () =>
      requests.filter(
        (request, index) => files().indexOf(request.file) !== index,
      ),
    /** The widths of the requests for the photos of `slide`, in order. */
    widthsOf: (slide: string) =>
      requests
        .filter(request => request.file.startsWith(`${slide}-`))
        .map(request => request.width)
        .sort(),
  };
}

/**
 * Checks that the page asked for the photos of each slide in `slides` at the
 * widths of the first slide's photos. The browser selects those for the
 * first slide's cards with no load ahead, and the cards give the photos of
 * every slide the same `sizes`. A count of requests does not find a file
 * that is too wide: Chromium shows a wider file that it has, and does not
 * ask for the narrower one.
 */
function expectWidthsOfFirstSlide(
  photos: ReturnType<typeof watchReelPhotos>,
  slides: ReadonlyArray<string>,
) {
  for (const slide of slides) {
    expect(photos.widthsOf(slide), slide).toEqual(photos.widthsOf(SLIDES[0]));
  }
}

/**
 * Whether the reel draws the photos of `slide`, each one complete. A card
 * keeps the file of the slide before it until the file of its slide loads.
 */
function showsPhotosOf(page: Page, slide: string) {
  return page.evaluate(name => {
    const drawn = Array.from(document.images).filter(
      img =>
        img.getBoundingClientRect().width > 0 &&
        /\/landing\/hero\/(?!avatar-)/u.test(
          decodeURIComponent(img.currentSrc),
        ),
    );
    return (
      drawn.length > 0 &&
      drawn.every(
        img =>
          img.complete &&
          decodeURIComponent(img.currentSrc).includes(`/landing/hero/${name}-`),
      )
    );
  }, slide);
}

/** The reel's dot for the slide at `position`, from 1. */
function dot(page: Page, position: number) {
  return page
    .getByRole('navigation', {name: 'Preview Astryx themes'})
    .getByRole('radio', {name: `Page ${position}`});
}

/**
 * Waits until the page's shell is live: a hover on a header control opens
 * the control's tooltip.
 */
async function shellIsLive(page: Page) {
  await expectTooltipsLive(
    page,
    page
      .getByRole('navigation', {name: 'Astryx navigation'})
      .getByRole('button', {name: 'Search'})
      .filter({visible: true})
      .first(),
  );
}

/** Waits until the page has loaded and has been idle. */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(
    () =>
      new Promise(resolve => {
        requestIdleCallback(() => resolve(null), {timeout: 5000});
      }),
  );
  await page.waitForLoadState('networkidle');
}

test.describe('at a phone size', () => {
  test.use({
    viewport: {width: 390, height: 844},
    hasTouch: true,
    isMobile: true,
  });

  test('the home page requests the photos of another reel slide only after a touch moves sideways on the reel', async ({
    page,
  }) => {
    const photos = watchReelPhotos(page);
    await page.goto('/');
    await shellIsLive(page);
    await settle(page);
    expect(photos.bySlide()).toEqual([PHOTOS_PER_SLIDE, 0, 0, 0, 0]);

    const cdp = await page.context().newCDPSession(page);
    const touch = async (type: string, x?: number, y?: number) => {
      await cdp.send('Input.dispatchTouchEvent', {
        type: type as 'touchStart' | 'touchMove' | 'touchEnd',
        touchPoints: x == null || y == null ? [] : [{x, y}],
      });
      await page.waitForTimeout(20);
    };

    // A touch that starts on the reel and scrolls the page.
    await touch('touchStart', 195, 600);
    for (let y = 560; y >= 300; y -= 40) {
      await touch('touchMove', 195, y);
    }
    await touch('touchEnd');
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(100);
    await settle(page);
    expect(photos.bySlide()).toEqual([PHOTOS_PER_SLIDE, 0, 0, 0, 0]);

    // A touch that starts to move sideways: the slides before and after the
    // first one load before the swipe ends.
    await page.evaluate(() => window.scrollTo(0, 0));
    await touch('touchStart', 300, 300);
    await touch('touchMove', 270, 302);
    await expect
      .poll(() => photos.bySlide())
      .toEqual([PHOTOS_PER_SLIDE, PHOTOS_PER_SLIDE, 0, 0, PHOTOS_PER_SLIDE]);

    // The swipe ends on the second slide, so the third slide loads too.
    for (let x = 240; x >= 120; x -= 40) {
      await touch('touchMove', x, 302);
    }
    await touch('touchEnd');
    await expect(dot(page, 2)).toBeChecked();
    await expect
      .poll(() => photos.bySlide())
      .toEqual([
        PHOTOS_PER_SLIDE,
        PHOTOS_PER_SLIDE,
        PHOTOS_PER_SLIDE,
        0,
        PHOTOS_PER_SLIDE,
      ]);

    // The second slide shows the files that the touch loaded ahead: the page
    // asks for none of its photos again, at that width or at another.
    await expect.poll(() => showsPhotosOf(page, SLIDES[1])).toBe(true);
    await settle(page);
    expect(photos.repeated()).toEqual([]);
    expectWidthsOfFirstSlide(photos, [SLIDES[1], SLIDES[2], SLIDES[4]]);
  });

  test('a press on a dot loads its slide and the two slides next to it', async ({
    page,
  }) => {
    const photos = watchReelPhotos(page);
    await page.goto('/');
    await shellIsLive(page);
    await settle(page);

    // The reel can become live after the shell.
    await expect(async () => {
      await dot(page, 4).tap();
      await expect(dot(page, 4)).toBeChecked({timeout: 1000});
    }).toPass();
    await expect
      .poll(() => photos.bySlide())
      .toEqual([
        PHOTOS_PER_SLIDE,
        0,
        PHOTOS_PER_SLIDE,
        PHOTOS_PER_SLIDE,
        PHOTOS_PER_SLIDE,
      ]);
    await expect.poll(() => showsPhotosOf(page, SLIDES[3])).toBe(true);
    await settle(page);
    expect(photos.repeated()).toEqual([]);
    expectWidthsOfFirstSlide(photos, [SLIDES[2], SLIDES[3], SLIDES[4]]);
  });

  test('keyboard focus loads the two slides next to the first one at the dots, and nothing at a link', async ({
    page,
  }) => {
    const photos = watchReelPhotos(page);
    await page.goto('/');
    await shellIsLive(page);
    await settle(page);

    // The last link of the hero text, which is before the dots.
    await page.getByRole('link', {name: 'StyleX', exact: true}).focus();
    await settle(page);
    expect(photos.bySlide()).toEqual([PHOTOS_PER_SLIDE, 0, 0, 0, 0]);

    await page.keyboard.press('Tab');
    await expect(dot(page, 1)).toBeFocused();
    await expect
      .poll(() => photos.bySlide())
      .toEqual([PHOTOS_PER_SLIDE, PHOTOS_PER_SLIDE, 0, 0, PHOTOS_PER_SLIDE]);
    expect(photos.repeated()).toEqual([]);
    expectWidthsOfFirstSlide(photos, [SLIDES[1], SLIDES[4]]);
  });
});

test.describe('at a desktop size', () => {
  test.use({viewport: {width: 1440, height: 900}});

  test('the home page requests the photos of every reel slide once, with no input', async ({
    page,
  }) => {
    const photos = watchReelPhotos(page);
    await page.goto('/');
    await shellIsLive(page);
    await settle(page);
    await expect
      .poll(() => photos.bySlide())
      .toEqual(SLIDES.map(() => PHOTOS_PER_SLIDE));
    await settle(page);
    expect(photos.repeated()).toEqual([]);
    expectWidthsOfFirstSlide(photos, SLIDES.slice(1));
  });
});
