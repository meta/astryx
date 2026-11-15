// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/DateInput

/**
 * @file DateInputSheetMonthArrowFocus.a11y.chromium.spec.ts
 * @input The built `Core/DateInput` WithMinMax story (min January 15, max
 *   February 15) in its bottom-sheet presentation, on a phone profile
 * @output Real-engine proof that Enter on a sheet month arrow that steps to
 *   the end of the range keeps focus in the sheet, on the other arrow, in both
 *   directions (component:DateInput FR22)
 * @position A hidden element loses focus only in a real engine; jsdom keeps
 *   it. DateInputTouch.test.tsx holds the destination rule.
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

test.use({hasTouch: true, isMobile: true, viewport: {width: 390, height: 800}});

async function openSheet(page: Page) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-dateinput--with-min-max&viewMode=story&args=presentation:adaptive-bottom-sheet`,
  );
  await page.locator('input').first().click();
  const header = page.locator('dialog[open] [data-title="month-year"]');
  await expect(header).toBeVisible();
  return header;
}

/**
 * The focused element's accessible label, or its tag when it has none, read
 * after two frames: the engine moves focus off an element hidden by a step
 * only once it renders that step.
 */
async function focusedAfterRender(page: Page) {
  return page.evaluate(
    async () =>
      new Promise<string>(resolve => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const active = document.activeElement as HTMLElement | null;
            resolve(
              active?.getAttribute('aria-label') ?? active?.tagName ?? '',
            );
          }),
        );
      }),
  );
}

test('Enter on Previous month at the first month moves focus to Next month', async ({
  page,
}) => {
  const header = await openSheet(page);
  await expect(header).toHaveText('February 2026');
  await page.getByRole('button', {name: 'Previous month'}).focus();
  await page.keyboard.press('Enter');
  await expect(header).toHaveText('January 2026');
  expect(await focusedAfterRender(page)).toBe('Next month');
});

test('Enter on Next month at the last month moves focus to Previous month', async ({
  page,
}) => {
  const header = await openSheet(page);
  await page.getByRole('button', {name: 'Previous month'}).click();
  await expect(header).toHaveText('January 2026');
  await page.getByRole('button', {name: 'Next month'}).focus();
  await page.keyboard.press('Enter');
  await expect(header).toHaveText('February 2026');
  expect(await focusedAfterRender(page)).toBe('Previous month');
});
