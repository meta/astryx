// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/BottomSheet|apps/storybook/stories/BottomSheet)

/**
 * @file BottomSheetOpenViewport.a11y.chromium.spec.ts
 * @input Built BottomSheet stories on a phone page zoomed through CDP, so
 *   the visual viewport can scroll
 * @output Browser evidence that opening a modal sheet leaves the visual
 *   viewport where it was on every frame. Focus still lands where Chromium's
 *   own focusing steps put it: the panel, or a `data-autofocus` field.
 * @position Chromium proof for the sheet's open focus
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {openStory} from '@astryxdesign/interaction-harness';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

// A phone: the viewport meta applies and the page can zoom.
test.use({
  hasTouch: true,
  isMobile: true,
  viewport: {width: 390, height: 844},
  deviceScaleFactor: 3,
});

/**
 * Zooms the page to twice its size about its top left, as a pinch would. The
 * visual viewport is then half the layout viewport's height, so it can scroll.
 */
async function zoomIn(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setPageScaleFactor', {pageScaleFactor: 2});
  await expect
    .poll(async () => page.evaluate(() => window.visualViewport?.scale))
    .toBe(2);
}

/**
 * Opens the story's sheet from its "Open sheet" button, as a keyboard press
 * would. No pointer is used, so the press scrolls nothing itself. Then it
 * reads the visual viewport's offset on every frame until the entrance is
 * over.
 */
async function openAndSampleViewport(page: Page): Promise<number[][]> {
  return page.evaluate(async () => {
    const opener = [...document.querySelectorAll('button')].find(
      button => button.textContent?.trim() === 'Open sheet',
    );
    const viewport = window.visualViewport;
    if (opener == null || viewport == null) {
      throw new Error('no opener or no visual viewport');
    }
    opener.focus({preventScroll: true});
    const samples = [[viewport.offsetTop, viewport.offsetLeft]];
    opener.click();
    const end = performance.now() + 1500;
    while (performance.now() < end) {
      await new Promise(requestAnimationFrame);
      samples.push([viewport.offsetTop, viewport.offsetLeft]);
    }
    return samples;
  });
}

/** The frames whose offset differs from the first frame's by over 0.5 px. */
function moved(samples: number[][]): number[][] {
  const [[top, left]] = samples;
  return samples.filter(
    ([sampleTop, sampleLeft]) =>
      Math.abs(sampleTop - top) > 0.5 || Math.abs(sampleLeft - left) > 0.5,
  );
}

test('opening a modal sheet on a zoomed page leaves the visual viewport where it was, and focuses the panel', async ({
  page,
}) => {
  await openStory(page, storybook.origin, 'core-bottomsheet--showcase');
  await zoomIn(page);
  const samples = await openAndSampleViewport(page);
  const dialog = page.getByRole('dialog', {name: 'Filters'});
  await expect(dialog).toBeVisible();
  expect(moved(samples), JSON.stringify(samples.slice(0, 3))).toEqual([]);
  await expect(dialog.locator('.astryx-bottom-sheet').first()).toBeFocused();
});

test('a modal sheet that opens on a data-autofocus field leaves the visual viewport where it was', async ({
  page,
}) => {
  await openStory(page, storybook.origin, 'core-bottomsheet--modal-autofocus');
  await zoomIn(page);
  const samples = await openAndSampleViewport(page);
  const dialog = page.getByRole('dialog', {name: 'Edit note'});
  await expect(dialog).toBeVisible();
  expect(moved(samples), JSON.stringify(samples.slice(0, 3))).toEqual([]);
  await expect(dialog.getByRole('textbox', {name: 'Note'})).toBeFocused();
});
