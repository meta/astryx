// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file home-photo-sizes.spec.ts
 * @input Production docsite home page at a desktop size, at three pixel
 *   densities, and at a phone size
 * @output Proof that the browser loads each home page photo at a width for
 *   its slot and its screen: the reel photos once each, also after the reel
 *   moves, and no photo of any slide with fewer image pixels than the screen
 *   has
 * @position Docsite browser tests. The unit tests prove the `srcset` and the
 *   `sizes` of each photo; only a browser selects a file and requests it.
 */

import {expect, test, type Page} from '@playwright/test';

// The reel's slides in their order. Each photo's file name starts with one
// of these names.
const SLIDES = ['neutral', 'matcha', 'butter', 'gothic', 'y2k'];
const SLIDE_COUNT = SLIDES.length;
const PHOTOS_PER_SLIDE = 3;

interface PhotoRequest {
  /** The file in `public` that the request is for. */
  file: string;
  /** The width that the request asks the optimizer for; 0 for the file itself. */
  width: number;
}

/** Records each request for a photo whose path starts with `prefix`. */
function watchPhotos(page: Page, prefix: string) {
  const requests: PhotoRequest[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    const file =
      url.pathname === '/_next/image'
        ? (url.searchParams.get('url') ?? '')
        : url.pathname;
    if (file.startsWith(prefix)) {
      requests.push({file, width: Number(url.searchParams.get('w') ?? 0)});
    }
  });
  return requests;
}

/** The reel's dot for the slide at `position`, from 1. */
function dot(page: Page, position: number) {
  return page
    .getByRole('navigation', {name: 'Preview Astryx themes'})
    .getByRole('radio', {name: `Page ${position}`});
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

interface DrawnPhoto {
  file: string;
  /** How wide the page draws the photo, in CSS pixels. */
  width: number;
  /** The width that the browser asked the optimizer for. */
  requested: number;
  /** Image pixels for each CSS pixel, on the axis that has fewer. */
  density: number;
  /** The file is narrower than the request: it has the photo's own pixels. */
  isOwnSize: boolean;
}

/**
 * Each hero, blog and themes card photo that the page draws, with the pixels
 * of the file that the browser selected.
 */
async function drawnPhotos(page: Page): Promise<DrawnPhoto[]> {
  // The page is in view from top to bottom once, so that each photo loads.
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle');
  return page.evaluate(async () => {
    const photos: DrawnPhoto[] = [];
    for (const img of Array.from(document.images)) {
      const selected = new URL(img.currentSrc || img.src, location.href);
      const file = selected.searchParams.get('url') ?? '';
      const box = img.getBoundingClientRect();
      if (
        !/^\/(landing\/hero|landing\/themes|blog)\//u.test(file) ||
        box.width === 0
      ) {
        continue;
      }
      // An image with a `srcset` reports its size divided by the density
      // that the browser selected. A second image with the same URL and no
      // `srcset` reports the pixels of the file.
      const pixels = new Image();
      pixels.src = selected.href;
      await pixels.decode();
      const across = pixels.naturalWidth / box.width;
      const down = pixels.naturalHeight / box.height;
      const requested = Number(selected.searchParams.get('w'));
      photos.push({
        file,
        width: box.width,
        requested,
        density:
          getComputedStyle(img).objectFit === 'contain'
            ? Math.max(across, down)
            : Math.min(across, down),
        isOwnSize: pixels.naturalWidth < requested,
      });
    }
    return photos;
  });
}

test.describe('at a desktop size', () => {
  test.use({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});

  test('the home page requests each reel photo once at the width of its slot, and no more when the reel moves', async ({
    page,
  }) => {
    const reel = watchPhotos(page, '/landing/hero/');
    await page.goto('/');
    await settle(page);
    const photos = () =>
      reel.filter(request => !request.file.includes('/avatar-'));
    await expect
      .poll(() => new Set(photos().map(request => request.file)).size)
      .toBe(SLIDE_COUNT * PHOTOS_PER_SLIDE);
    // Two card photos at 384 px for a 258 px slot, and the buy card's
    // thumbnail at 128 px for a slot of up to 66 px, for each slide.
    expect(
      photos()
        .map(request => request.width)
        .sort((a, b) => a - b),
    ).toEqual([
      ...Array.from({length: SLIDE_COUNT}, () => 128),
      ...Array.from({length: SLIDE_COUNT * 2}, () => 384),
    ]);

    // The warm-up loaded the file that each slide shows. The reel moves to
    // the dot that has the focus, and the focus needs no pointer: a pointer
    // that rests on a dot can open a tooltip over the next one.
    for (let slide = 2; slide <= SLIDE_COUNT; slide += 1) {
      await expect(async () => {
        await dot(page, slide).focus();
        await expect(dot(page, slide)).toBeChecked({timeout: 1000});
      }).toPass();
      await settle(page);
    }
    expect(photos()).toHaveLength(SLIDE_COUNT * PHOTOS_PER_SLIDE);
  });

  test('the home page requests the blog covers and the themes card photos at the width of their slots', async ({
    page,
  }) => {
    const covers = watchPhotos(page, '/blog/');
    const store = watchPhotos(page, '/landing/themes/');
    await page.goto('/');
    const photos = await drawnPhotos(page);
    // A cover that the optimizer converts loads at 1080 px in the feature
    // card, which is 825 px wide, and at 640 px in a compact card of 344 px.
    // The newest posts can have no such cover: the unit tests then hold the
    // rule.
    const drawnCovers = photos.filter(photo => photo.file.startsWith('/blog/'));
    expect(
      drawnCovers.filter(
        cover => cover.requested !== (cover.width > 500 ? 1080 : 640),
      ),
    ).toEqual([]);
    expect(covers.filter(request => request.width > 1080)).toEqual([]);
    // A store photo is 86 px wide.
    expect(store.map(request => request.width)).toEqual(
      Array.from({length: 6}, () => 128),
    );
  });
});

for (const {name, viewport, density, isMobile} of [
  {name: 'a desktop', viewport: {width: 1440, height: 900}, density: 2},
  {name: 'a desktop', viewport: {width: 1440, height: 900}, density: 3},
  {
    name: 'a phone',
    viewport: {width: 390, height: 844},
    density: 3,
    isMobile: true,
  },
]) {
  test.describe(`on ${name} with ${density} screen pixels for each CSS pixel`, () => {
    test.use({
      viewport,
      deviceScaleFactor: density,
      isMobile: isMobile ?? false,
      hasTouch: isMobile ?? false,
    });

    test('each home page photo of each slide has that many image pixels, or its own pixels', async ({
      page,
    }) => {
      await page.goto('/');
      const photos = await drawnPhotos(page);
      const count = (all: DrawnPhoto[], folder: string) =>
        all.filter(photo => photo.file.startsWith(folder)).length;
      expect(count(photos, '/landing/hero/')).toBe(PHOTOS_PER_SLIDE);
      expect(count(photos, '/landing/themes/')).toBe(9);

      // The size of a reel card depends on the theme of its slide.
      for (let slide = 2; slide <= SLIDE_COUNT; slide += 1) {
        await expect(async () => {
          await dot(page, slide).focus();
          await expect(dot(page, slide)).toBeChecked({timeout: 1000});
        }).toPass();
        // A card shows the file of the slide before it until the file of
        // this slide loads.
        await expect
          .poll(() =>
            page.evaluate(
              name =>
                Array.from(document.images)
                  .filter(
                    img =>
                      img.getBoundingClientRect().width > 0 &&
                      /\/landing\/hero\/(?!avatar-)/u.test(
                        decodeURIComponent(img.currentSrc),
                      ),
                  )
                  .every(
                    img =>
                      img.complete &&
                      decodeURIComponent(img.currentSrc).includes(
                        `/landing/hero/${name}-`,
                      ),
                  ),
              SLIDES[slide - 1],
            ),
          )
          .toBe(true);
        const reel = (await drawnPhotos(page)).filter(photo =>
          photo.file.startsWith('/landing/hero/'),
        );
        expect(reel).toHaveLength(PHOTOS_PER_SLIDE);
        photos.push(...reel);
      }
      expect(
        photos.filter(photo => photo.density < density && !photo.isOwnSize),
      ).toEqual([]);
    });
  });
}
