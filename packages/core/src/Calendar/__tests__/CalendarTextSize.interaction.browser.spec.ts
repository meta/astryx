// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CalendarTextSize.interaction.browser.spec.ts
 * @input The built Calendar story, with the day numbers' text enlarged while
 *   the element sizes stay put, as iOS Dynamic Type does
 * @output Real-browser evidence that a day button grows with its number, so
 *   a day's number stays inside its own tap target and never covers the day
 *   below, and that the default text size keeps the element sizes
 * @position Browser proof of Calendar FR2's size clause (AST-102 FR4)
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

async function openCalendar(page: Page): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-calendar--default&viewMode=story`,
  );
  await page.locator('[role="grid"] button').first().waitFor();
}

/** Each day button's box against its number's glyph box. */
async function readDays(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[role="grid"] button')].map(
      day => {
        const range = document.createRange();
        range.selectNodeContents(day);
        const number = range.getBoundingClientRect();
        const box = day.getBoundingClientRect();
        return {
          name: day.getAttribute('aria-label') ?? day.textContent ?? '',
          width: box.width,
          height: box.height,
          minHeight: parseFloat(getComputedStyle(day).minHeight),
          above: box.top - number.top,
          below: number.bottom - box.bottom,
        };
      },
    ),
  );
}

test('at the default text size each day keeps its element size', async ({
  page,
}) => {
  await openCalendar(page);
  for (const day of await readDays(page)) {
    expect(Math.round(day.height), day.name).toBe(Math.round(day.minHeight));
    expect(Math.round(day.width), day.name).toBe(Math.round(day.minHeight));
  }
});

test('an enlarged day number stays inside its day button', async ({page}) => {
  await openCalendar(page);
  // Grows the day numbers' text, but not the element sizes, the way iOS
  // Dynamic Type grows theme text at its accessibility sizes.
  await page.addStyleTag({
    content: '[role="grid"] button { font-size: 40px; line-height: 54px; }',
  });
  const days = await readDays(page);
  expect(days.length).toBeGreaterThan(0);
  for (const day of days) {
    expect(day.above, day.name).toBeLessThanOrEqual(1);
    expect(day.below, day.name).toBeLessThanOrEqual(1);
  }
});
