// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file LightboxKeyboard.a11y.browser.spec.ts
 * @input Built Lightbox stories (LTR and the RTL story global) and real
 *   Chromium/WebKit keyboard input
 * @output Browser evidence that the gallery's Left/Right arrow keys move in
 *   the direction of the matching on-screen button, in both directions, that
 *   Tab and Shift+Tab wrap inside the open viewer at both ends, and that the
 *   zoom keys work and are announced inside the open viewer
 * @position Cross-browser proof for Lightbox's direction-aware gallery keys
 *   (design:bidirectionality DR6, DR11)
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
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

// Opens the gallery story at its second photo ("2 / 4").
async function openGallery(page: Page, direction: 'ltr' | 'rtl') {
  // The story's photos are remote; the keys do not need them to load.
  await page.route(/picsum\.photos/, async route => route.abort());
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-lightbox--gallery&viewMode=story${
      direction === 'rtl' ? '&globals=direction:rtl' : ''
    }`,
  );
  await page.getByRole('img', {name: 'Mountain lake'}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('2 / 4');
  const previous = page.getByRole('button', {name: 'Previous'});
  const next = page.getByRole('button', {name: 'Next'});
  return {dialog, previous, next};
}

async function centerX(locator: ReturnType<Page['getByRole']>) {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('no box');
  }
  return box.x + box.width / 2;
}

for (const direction of ['ltr', 'rtl'] as const) {
  test(`${direction}: each arrow key moves toward the button on its side`, async ({
    page,
  }) => {
    const {dialog, previous, next} = await openGallery(page, direction);
    const nextIsOnTheLeft = (await centerX(next)) < (await centerX(previous));
    // The buttons swap sides in RTL; the keys must follow them.
    expect(nextIsOnTheLeft).toBe(direction === 'rtl');
    const towardNext = nextIsOnTheLeft ? 'ArrowLeft' : 'ArrowRight';
    const towardPrevious = nextIsOnTheLeft ? 'ArrowRight' : 'ArrowLeft';

    await page.keyboard.press(towardNext);
    await expect(dialog).toContainText('3 / 4');
    await page.keyboard.press(towardPrevious);
    await page.keyboard.press(towardPrevious);
    await expect(dialog).toContainText('1 / 4');
    // At the start of the range the key toward Previous does nothing, like
    // the disabled button it matches.
    await page.keyboard.press(towardPrevious);
    await expect(dialog).toContainText('1 / 4');
  });
}

// Focuses the viewer's last tabbable control, presses Tab, and expects the
// first; then the reverse with Shift+Tab. Focus must never reach the page or
// the browser's own UI.
async function expectTabWrapsInside(page: Page) {
  const ends = async () =>
    page.evaluate(() => {
      const dialog = document.querySelector('dialog[open]');
      if (dialog == null) {
        return null;
      }
      const tabbable = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]',
        ),
      ].filter(
        el =>
          el.tabIndex >= 0 &&
          !el.hasAttribute('disabled') &&
          el.getClientRects().length > 0,
      );
      tabbable.forEach((el, i) => el.setAttribute('data-tab-index', String(i)));
      return tabbable.length;
    });
  const count = await ends();
  expect(count).toBeGreaterThan(0);
  const at = (i: number) =>
    page.locator(`dialog[open] [data-tab-index="${i}"]`);
  const last = (count ?? 1) - 1;

  await at(last).focus();
  await page.keyboard.press('Tab');
  await expect(at(0)).toBeFocused();

  await at(0).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(at(last)).toBeFocused();
}

test('Tab and Shift+Tab wrap inside an open gallery', async ({page}) => {
  await openGallery(page, 'ltr');
  await expectTabWrapsInside(page);
});

test('Tab and Shift+Tab wrap inside an open single image, zoomed or not', async ({
  page,
}) => {
  await page.route(/picsum\.photos/, async route => route.abort());
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-lightbox--with-zoom&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Open with zoom'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectTabWrapsInside(page);

  // Zoomed in, the same controls stay the only stops.
  await page.locator('dialog[open] [tabindex="0"]').first().focus();
  await page.keyboard.press('+');
  await expectTabWrapsInside(page);
});

test('+ zooms and is announced inside the viewer, and 0 returns to the fitted size', async ({
  page,
}) => {
  // A local picture stands in for the remote photo, so the zoom has a size.
  await page.route(/picsum\.photos/, async route =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#5b7f6a"/></svg>',
    }),
  );
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-lightbox--with-zoom&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Open with zoom'}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const zoom = dialog.getByRole('button', {name: 'Zoom'});
  await expect(zoom).toHaveAttribute('aria-pressed', 'false');

  await page.keyboard.press('+');
  await expect(zoom).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.locator('dialog[open] > [data-astryx-modal-live-region="polite"]'),
  ).toContainText('Zoomed in');

  await page.keyboard.press('0');
  await expect(zoom).toHaveAttribute('aria-pressed', 'false');
});
