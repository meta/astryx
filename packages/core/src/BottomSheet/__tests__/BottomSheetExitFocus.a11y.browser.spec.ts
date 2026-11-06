// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file BottomSheetExitFocus.a11y.browser.spec.ts
 * @input The `Core/BottomSheet` exit-focus fixtures in a built Storybook: Done
 *   closes the sheet, and during the exit the Done control is removed or
 *   disabled.
 * @output Real-engine proof that a closing sheet that held focus goes inert
 *   and aria-hidden as soon as that focus drops to the page (removed case);
 *   when the control is disabled, focus stays on Done during the exit and
 *   returns to Open sheet when the sheet closes (FR9).
 * @position Chromium and WebKit. The removed case needs a real engine: React
 *   drops Chromium's focusout for an element it removes, and WebKit sends none.
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

/**
 * Opens the fixture, closes it from Done with the keyboard, and resolves with
 * whether the still-open dialog was ever inert and aria-hidden with focus
 * outside it before it closed. The exit is short, so the page watches every
 * attribute change instead of polling.
 */
async function sawInertExit(page: Page, story: string): Promise<boolean> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-bottomsheet--${story}&viewMode=story`,
  );
  const opener = page.getByRole('button', {name: 'Open sheet', exact: true});
  await opener.focus();
  await page.keyboard.press('Enter');
  const done = page.getByRole('button', {name: 'Done', exact: true});
  await expect(done).toBeVisible();
  // A close during the entrance reverses it; let the sheet settle first so
  // the close plays a full exit.
  const dialog = page.locator('dialog[aria-label="Exit focus"]');
  await expect
    .poll(async () =>
      dialog.evaluate(node => node.getAnimations({subtree: true}).length),
    )
    .toBe(0);
  await done.focus();
  const result = page.evaluate(
    async () =>
      new Promise<boolean>(resolve => {
        const dialog = document.querySelector<HTMLDialogElement>(
          'dialog[aria-label="Exit focus"]',
        );
        if (dialog == null) {
          resolve(false);
          return;
        }
        const check = () => {
          if (!dialog.open) {
            observer.disconnect();
            resolve(false);
          } else if (
            dialog.hasAttribute('inert') &&
            dialog.getAttribute('aria-hidden') === 'true' &&
            !dialog.contains(document.activeElement)
          ) {
            observer.disconnect();
            resolve(true);
          }
        };
        const observer = new MutationObserver(check);
        observer.observe(dialog, {
          attributes: true,
          attributeFilter: ['open', 'inert', 'aria-hidden'],
        });
      }),
  );
  await page.keyboard.press('Enter');
  return result;
}

test('goes inert once its focused control is removed during the exit', async ({
  page,
}) => {
  expect(await sawInertExit(page, 'exit-focus-control-removed')).toBe(true);
});

test('keeps focus on Done when disabled during the exit and returns to Open sheet when closed', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-bottomsheet--exit-focus-control-disabled&viewMode=story`,
  );
  const opener = page.getByRole('button', {name: 'Open sheet', exact: true});
  await opener.focus();
  await page.keyboard.press('Enter');
  const done = page.getByRole('button', {name: 'Done', exact: true});
  await expect(done).toBeVisible();
  const dialog = page.locator('dialog[aria-label="Exit focus"]');
  await expect
    .poll(async () =>
      dialog.evaluate(node => node.getAnimations({subtree: true}).length),
    )
    .toBe(0);
  await done.focus();
  await page.keyboard.press('Enter');

  // Done becomes disabled during the exit motion; focus stays on Done (FR9).
  await expect(done).toHaveAttribute('aria-disabled', 'true');
  await expect(done).toBeFocused();

  // Once the exit ends, the dialog closes and focus returns to the opener.
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});
