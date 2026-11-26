// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/ScrollableArea ^(packages/core/src/hooks/useScrollableArea|apps/storybook/stories/ScrollableArea)

/**
 * @file ScrollableAreaKeyboard.a11y.chromium.spec.ts
 * @input The built Storybook's ScrollableArea stories, driven with trusted
 *   key presses in Chromium
 * @output Real-browser proof that the viewport takes a tab stop only while it
 *   scrolls, that the keyboard then scrolls it in both directions, and that
 *   losing overflow keeps focus where it is
 * @position Ongoing browser check for ScrollableArea; jsdom cannot drive
 *   native keyboard scrolling
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const CONDITIONAL = '[data-evidence="conditional-tabindex"]';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

async function open(page: Page, story: string, direction = 'ltr') {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-scrollablearea--${story}&viewMode=story&globals=astryxTheme:neutral;colorMode:light;direction:${direction}`,
    {waitUntil: 'load'},
  );
}

async function focusedEvidence(page: Page) {
  return page.evaluate(() =>
    document.activeElement?.getAttribute('data-evidence'),
  );
}

test('the viewport takes a tab stop only while its content overflows', async ({
  page,
}) => {
  await open(page, 'conditional-keyboard-access');
  // A measured fitting viewport reports both block edges.
  await expect(page.locator(CONDITIONAL)).toHaveAttribute(
    'data-scroll-block-end',
    'true',
  );
  const toggle = page.getByRole('button', {name: 'Make content overflow'});
  await toggle.focus();
  await page.keyboard.press('Tab');
  expect(await focusedEvidence(page)).not.toBe('conditional-tabindex');

  await toggle.click();
  await expect(page.locator(CONDITIONAL)).toHaveAttribute('tabindex', '0');
  await page.getByRole('button', {name: 'Make content fit'}).focus();
  await page.keyboard.press('Tab');
  expect(await focusedEvidence(page)).toBe('conditional-tabindex');
  await expect(
    page.getByRole('region', {name: 'Conditional activity list'}),
  ).toBeFocused();
});

test('arrow, Page Down and End keys scroll the focused viewport', async ({
  page,
}) => {
  await open(page, 'conditional-keyboard-access');
  await page.getByRole('button', {name: 'Make content overflow'}).click();
  const viewport = page.locator(CONDITIONAL);
  await expect(viewport).toHaveAttribute('tabindex', '0');
  await viewport.focus();
  const scrollTop = async () => viewport.evaluate(element => element.scrollTop);

  await page.keyboard.press('ArrowDown');
  await expect.poll(scrollTop).toBeGreaterThan(0);
  const afterArrow = await scrollTop();
  await page.keyboard.press('PageDown');
  await expect.poll(scrollTop).toBeGreaterThan(afterArrow);
  await page.keyboard.press('End');
  await expect(viewport).toHaveAttribute('data-scroll-block-end', 'true');
});

test('arrow keys scroll an inline viewport toward its inline end in both directions', async ({
  page,
}) => {
  for (const direction of ['ltr', 'rtl'] as const) {
    await open(page, 'rtl-behavior-probe', direction);
    const viewport = page.locator('[data-rtl-scroll-probe="true"]');
    await expect(viewport).toHaveAttribute('data-scrollable-inline', 'true');
    await viewport.focus();
    await page.keyboard.press(direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight');
    await expect(viewport).not.toHaveAttribute('data-scroll-inline-start');
  }
});

test('losing overflow keeps focus on the viewport and drops its future tab stop', async ({
  page,
}) => {
  await open(page, 'conditional-keyboard-access');
  await page.getByRole('button', {name: 'Make content overflow'}).click();
  const viewport = page.locator(CONDITIONAL);
  await expect(viewport).toHaveAttribute('tabindex', '0');
  await viewport.focus();
  // A pointer click on the toggle would move focus. A dispatched click
  // changes the content while the viewport keeps focus.
  await page
    .getByRole('button', {name: 'Make content fit'})
    .dispatchEvent('click');
  await expect(viewport).toHaveAttribute('tabindex', '-1');
  expect(await focusedEvidence(page)).toBe('conditional-tabindex');
});
