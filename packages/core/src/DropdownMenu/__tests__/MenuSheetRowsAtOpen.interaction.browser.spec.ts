// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MenuSheetRowsAtOpen.interaction.browser.spec.ts
 * @input The built MoreMenu bottom-sheet story (it opens its sheet on load),
 *   with the sheet's row chunk held back so it arrives after the sheet's own
 * @output Real-browser evidence that the sheet never shows without its rows:
 *   at the sheet's first visible frame every action is there, on a first load
 *   and on a second load in the same page
 * @position Browser proof for DropdownMenu/lazyMenuBottomSheet.ts
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

// The MoreMenu audit's own browser setup: a 390 px page at DPR 2.
test.use({
  viewport: {width: 390, height: 844},
  deviceScaleFactor: 2,
  isMobile: false,
  hasTouch: false,
});

/** Waits two animation frames. */
async function nextFrames(page: Page) {
  await page.evaluate(
    async () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
}

/** The sheet's text at its first visible frame, two frames later. */
async function sheetTextAtOpen(page: Page, mode: 'light' | 'dark') {
  await page.emulateMedia({colorScheme: mode, reducedMotion: 'reduce'});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-moremenu--bottom-sheet-presentation&viewMode=story&globals=colorMode:${mode};astryxTheme:neutral;direction:ltr`,
  );
  // The page settles as the MoreMenu audit's does before it looks.
  await page.locator('#storybook-root button').first().waitFor();
  await page.evaluate(async () => document.fonts.ready);
  await nextFrames(page);
  const dialog = page.getByRole('dialog').first();
  await dialog.waitFor({state: 'visible', timeout: 10_000});
  await nextFrames(page);
  return dialog.evaluate(element => element.textContent ?? '');
}

test('the sheet shows its rows at its first visible frame when the row chunk arrives late', async ({
  page,
}) => {
  // The row chunk arrives a quarter second after it is asked for, later than
  // the sheet's own chunk, as on a busy machine.
  await page.route(
    /MenuBottomSheetActionList-[^/]*\.js(\?.*)?$/,
    async route => {
      await new Promise(resolve => {
        setTimeout(resolve, 250);
      });
      await route.continue();
    },
  );
  for (const mode of ['light', 'dark'] as const) {
    const text = await sheetTextAtOpen(page, mode);
    for (const label of ['Edit', 'Duplicate', 'Share', 'Delete']) {
      expect(text, `${mode}: "${label}" row`).toContain(label);
    }
  }
});
