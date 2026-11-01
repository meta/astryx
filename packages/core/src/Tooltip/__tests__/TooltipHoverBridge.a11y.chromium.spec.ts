// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file TooltipHoverBridge.a11y.chromium.spec.ts
 * @input The `Core/Tooltip` Default story in a built Storybook and real mouse
 *   input.
 * @output Real-engine proof that a pointer moving from the trigger onto the
 *   tooltip in one step keeps the tooltip open (WCAG 2.2 1.4.13 Content on
 *   Hover or Focus, hoverable), and that leaving the tooltip still hides it.
 * @position Run with `pnpm test:a11y-contract`. The defect lives in the order
 *   the engine dispatches mouseout and mouseleave on one pointer step, which
 *   only a real engine produces.
 */

import {expect, test, type Page} from '@playwright/test';
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

test.afterAll(async () => {
  await storybook?.close();
});

const STORY = 'core-tooltip--default';

async function openTooltip(page: Page) {
  await page.setViewportSize({width: 900, height: 600});
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  await holdMotionStill(page);
  const trigger = page.getByRole('button', {name: 'Hover me'});
  await trigger.hover();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  const t = await trigger.boundingBox();
  const s = await tooltip.boundingBox();
  if (t == null || s == null) {
    throw new Error('the trigger or the tooltip has no layout box');
  }
  return {tooltip, s};
}

test('a one-step move from the trigger onto the tooltip keeps it open', async ({
  page,
}) => {
  const {tooltip, s} = await openTooltip(page);

  // One mousemove event straight onto the tooltip, as a quick hand makes.
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  // Well past the 100ms hover bridge.
  await page.waitForTimeout(400);

  await expect(tooltip).toBeVisible();
});

test('leaving the tooltip for the page still hides it', async ({page}) => {
  const {tooltip, s} = await openTooltip(page);

  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await page.waitForTimeout(200);
  await page.mouse.move(5, 5);

  await expect(tooltip).toBeHidden();
});
