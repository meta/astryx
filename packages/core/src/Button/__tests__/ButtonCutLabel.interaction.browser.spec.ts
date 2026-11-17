// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ButtonCutLabel.interaction.browser.spec.ts
 * @input The built Button Truncation story in a real browser
 * @output Proof that keyboard focus on a Button whose label is cut shows the
 *   full label in an undescribed tooltip, also when focus arrives before the
 *   tooltip's module has loaded; that Escape closes it; and that a hover or a
 *   fitting label shows nothing
 * @position Interaction evidence for Button FR18 and
 *   packages/core/src/Text/cutTextOnKeyboardFocus.tsx
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
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

test.use({
  viewport: {width: 900, height: 700},
  isMobile: false,
  hasTouch: false,
});

const LONG = 'A very long button label that overflows';
const story = () =>
  `${storybook.origin}/iframe.html?id=core-button--truncation&viewMode=story`;

test('keyboard focus on a cut label shows it in full, undescribed, and Escape closes it', async ({
  page,
}) => {
  await page.goto(story());
  const button = page.getByRole('button', {name: LONG});
  await button.waitFor();
  await page.waitForTimeout(500);
  await page.keyboard.press('Tab');
  await expect(button).toBeFocused();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toHaveText(LONG);
  // The tooltip repeats the name, so it adds no description.
  expect(await button.getAttribute('aria-describedby')).toBeNull();
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
});

test('a keyboard focus that arrives as the page loads shows the tooltip once its module loads', async ({
  page,
}) => {
  await page.goto(story(), {waitUntil: 'commit'});
  const button = page.getByRole('button', {name: LONG});
  await button.waitFor();
  await page.keyboard.press('Tab');
  await expect(button).toBeFocused();
  await expect(page.getByRole('tooltip')).toHaveText(LONG);
});

test('a hover, or keyboard focus on a fitting label, shows nothing', async ({
  page,
}) => {
  await page.goto(story());
  const button = page.getByRole('button', {name: LONG});
  await button.waitFor();
  await page.waitForTimeout(500);
  await button.hover();
  await page.waitForTimeout(800);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.getByRole('button', {name: 'Cancel'}).first().focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', {name: 'Cancel'}).first(),
  ).toBeFocused();
  await page.waitForTimeout(300);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});
