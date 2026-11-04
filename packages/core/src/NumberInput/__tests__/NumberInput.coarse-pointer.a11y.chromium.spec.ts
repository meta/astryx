// Copyright (c) Meta Platforms, Inc. and affiliates.

/** Real-browser proof of NumberInput's coarse-pointer stepper presentation. */

import {expect, test} from '@playwright/test';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
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

test.afterAll(async () => storybook?.close());

for (const width of [390, 1280]) {
  for (const hasTouch of [false, true]) {
    test(`${hasTouch ? 'coarse' : 'fine'} pointer at ${width}px preserves entry and the appropriate end padding`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: {width, height: 800},
        hasTouch,
      });
      try {
        const page = await context.newPage();
        await page.goto(
          `${storybook.origin}/iframe.html?id=core-numberinput--with-number-steppers&viewMode=story`,
        );
        await holdMotionStill(page);
        const input = page.getByRole('spinbutton', {name: 'Quantity'});
        const increment = page.locator(
          'button[aria-label="Increment Quantity"]',
        );
        const decrement = page.locator(
          'button[aria-label="Decrement Quantity"]',
        );
        const control = page.locator('.astryx-number-input');
        await expect(input).toBeVisible();
        expect(
          await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
        ).toBe(hasTouch);

        // Public padding tokens still apply when the compact stepper lane is
        // hidden. Use a non-default value to catch a hardcoded restoration.
        await control.evaluate(element => {
          element.style.setProperty(
            '--astryx-number-input-padding-inline-end',
            '20px',
          );
        });
        for (const direction of ['ltr', 'rtl']) {
          await control.evaluate((element, dir) => {
            element.setAttribute('dir', dir);
          }, direction);
          await expect(control).toHaveCSS('direction', direction);
          await expect(control).toHaveCSS(
            'padding-inline-end',
            hasTouch ? '20px' : '0px',
          );
          if (hasTouch) {
            await expect(increment).toBeHidden();
            await expect(decrement).toBeHidden();
            await expect(
              page.getByRole('button', {
                name: /^(Increment|Decrement) Quantity$/,
              }),
            ).toHaveCount(0);
          } else {
            await expect(increment).toBeVisible();
            await expect(decrement).toBeVisible();
          }
        }

        if (!hasTouch) {
          await increment.click();
          await expect(input).toHaveValue('3');
          await decrement.click();
          await expect(input).toHaveValue('2');
        }
        await input.focus();
        await input.press('ArrowUp');
        await expect(input).toHaveValue('3');
        await input.press('ArrowDown');
        await expect(input).toHaveValue('2');
        await input.fill('7');
        await input.press('Enter');
        await expect(input).toHaveAttribute('aria-valuenow', '7');
        await expect(input).toHaveAttribute('inputmode', 'decimal');
      } finally {
        await context.close();
      }
    });
  }
}
