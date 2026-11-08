// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LightboxSingleCaption.interaction.browser.spec.ts
 * @input The built Lightbox stories with a single photo and with a gallery,
 *   on the phone project and at a desktop size
 * @output Proofs that a single photo presents its caption as a gallery's
 *   page does. The band has the same shape and backing, the text the same
 *   type, and the photo the same box. A long caption ends in "more", and a
 *   photo with no caption has no band. A single photo shows no paging
 *   controls
 * @position Interaction tests for Lightbox's caption (browser), beside
 *   LightboxPaging.interaction.browser.spec.ts
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  frames,
  openStory,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

/** A plain 3:2 photo, served for every story photo. */
const PHOTO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#888"/><circle cx="600" cy="400" r="220" fill="#d9a441"/></svg>';

/** Opens a story's Lightbox and waits for its photos to load. */
async function openViewer(page: Page, story: string, trigger: string) {
  await page.route('https://picsum.photos/**', async route =>
    route.fulfill({contentType: 'image/svg+xml', body: PHOTO_SVG}),
  );
  await openStory(page, storybook(), story);
  await page.getByRole('button', {name: trigger}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect
    .poll(async () =>
      dialog.evaluate(el =>
        [...el.querySelectorAll('[data-current] img')].every(
          img => (img as HTMLImageElement).naturalWidth === 1200,
        ),
      ),
    )
    .toBe(true);
  await frames(page, 2);
  return dialog;
}

/**
 * The current page's photo box, photo and caption band, in what a gallery
 * and a single photo share: no content-dependent size.
 */
async function captionShape(page: Page) {
  return page.getByRole('dialog').evaluate(el => {
    const viewer = el.querySelector('[data-lightbox-viewport]');
    const current = viewer?.querySelector('[data-current]');
    const media = current?.querySelector('[data-lightbox-page-media]');
    const photo = media?.querySelector('img');
    const band = media?.nextElementSibling;
    const caption = band?.querySelector('[data-lightbox-caption]');
    const text = caption?.querySelector('.astryx-text');
    if (
      viewer == null ||
      media == null ||
      photo == null ||
      band == null ||
      text == null
    ) {
      return null;
    }
    const round = (n: number) => Math.round(n * 2) / 2;
    const v = viewer.getBoundingClientRect();
    const m = media.getBoundingClientRect();
    const p = photo.getBoundingClientRect();
    const b = band.getBoundingClientRect();
    const bandStyle = getComputedStyle(band);
    const textStyle = getComputedStyle(text);
    return {
      band: {
        height: round(b.height),
        left: round(b.left - v.left),
        right: round(v.right - b.right),
        bottom: round(v.bottom - b.bottom),
        backgroundColor: bandStyle.backgroundColor,
        paddingBottom: bandStyle.paddingBottom,
      },
      // The photo's row ends where the band starts.
      photoRow: {height: round(m.height), gapToBand: round(b.top - m.bottom)},
      photo: {
        top: round(p.top - v.top),
        left: round(p.left - v.left),
        width: round(p.width),
        height: round(p.height),
      },
      text: {
        fontSize: textStyle.fontSize,
        lineHeight: textStyle.lineHeight,
        fontWeight: textStyle.fontWeight,
        color: textStyle.color,
        textAlign: textStyle.textAlign,
        maxWidth: textStyle.maxWidth,
        paddingTop: textStyle.paddingTop,
        paddingInline: `${textStyle.paddingLeft} ${textStyle.paddingRight}`,
      },
    };
  });
}

for (const size of ['phone', 'desktop'] as const) {
  test.describe(`on a ${size}`, () => {
    if (size === 'desktop') {
      test.use({
        viewport: {width: 1280, height: 800},
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      });
    }

    test('a single photo presents its caption as a gallery page does: the same band, text and photo box', async ({
      page,
    }) => {
      await openViewer(
        page,
        'core-lightbox--gallery-with-captions',
        'Open gallery with captions',
      );
      const gallery = await captionShape(page);
      expect(gallery).not.toBeNull();
      await openViewer(
        page,
        'core-lightbox--with-caption',
        'Open with caption',
      );
      expect(await captionShape(page)).toEqual(gallery);
      await openViewer(
        page,
        'core-lightbox--zoom-with-caption',
        'Open zoom with caption',
      );
      expect(await captionShape(page)).toEqual(gallery);
    });

    test('a single photo’s long caption ends in "more", which opens it in full and "less" closes, as in a gallery', async ({
      page,
    }) => {
      const dialog = await openViewer(
        page,
        'core-lightbox--single-with-long-caption',
        'Open single photo with a long caption',
      );
      const more = dialog.getByRole('button', {name: 'more'});
      await expect(more).toBeVisible();
      await expect(more).toHaveAttribute('aria-expanded', 'false');
      const lines = async () =>
        dialog.evaluate(el => {
          const text = el.querySelector(
            '[data-current] [data-lightbox-caption] .astryx-text',
          );
          if (text == null) {
            return Number.NaN;
          }
          const style = getComputedStyle(text);
          const height =
            text.clientHeight -
            parseFloat(style.paddingTop) -
            parseFloat(style.paddingBottom);
          return Math.round(height / parseFloat(style.lineHeight));
        });
      expect(await lines()).toBe(2);
      await more.click();
      const less = dialog.getByRole('button', {name: 'less'});
      await expect(less).toHaveAttribute('aria-expanded', 'true');
      await expect.poll(lines).toBeGreaterThan(2);
      await less.click();
      await expect(more).toHaveAttribute('aria-expanded', 'false');
      await expect.poll(lines).toBe(2);
    });

    test('a single photo with no caption has no band: its photo box fills the viewer, as a gallery’s with no caption', async ({
      page,
    }) => {
      const dialog = await openViewer(
        page,
        'core-lightbox--with-zoom',
        'Open with zoom',
      );
      const fill = await dialog.evaluate(el => {
        const viewer = el.querySelector('[data-lightbox-viewport]');
        const media = viewer?.querySelector(
          '[data-current] [data-lightbox-page-media]',
        );
        if (viewer == null || media == null) {
          return null;
        }
        return {
          captions: el.querySelectorAll('[data-lightbox-caption]').length,
          band: media.nextElementSibling != null,
          heightGap: Math.round(
            viewer.getBoundingClientRect().height -
              media.getBoundingClientRect().height,
          ),
        };
      });
      expect(fill).toEqual({captions: 0, band: false, heightGap: 0});
    });

    test('a single photo shows no paging controls: no Previous, Next or counter', async ({
      page,
    }) => {
      const dialog = await openViewer(
        page,
        'core-lightbox--with-caption',
        'Open with caption',
      );
      await expect(dialog.getByRole('button', {name: 'Previous'})).toHaveCount(
        0,
      );
      await expect(dialog.getByRole('button', {name: 'Next'})).toHaveCount(0);
      await expect(dialog.getByText('1 / 1')).toHaveCount(0);
      await expect(dialog.locator('[data-lightbox-page]')).toHaveCount(1);
    });
  });
}
