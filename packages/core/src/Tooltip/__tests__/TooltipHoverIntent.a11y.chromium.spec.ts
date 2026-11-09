// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file TooltipHoverIntent.a11y.chromium.spec.ts
 * @input NeighbouringTriggers Storybook scene and real pointer and keyboard input
 * @output Browser proof of delayed entry, immediate handoff and restored delay
 * @position Tooltip hover-intent regression coverage
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
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

test.beforeEach(async ({page}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tooltip--neighbouring-triggers&viewMode=story`,
  );
  await holdMotionStill(page);
  await expect(page.getByRole('button', {name: 'First action'})).toBeVisible();
  await page.clock.install();
  await page.clock.pauseAt(new Date());
});

test('a neighbouring trigger skips the delay, then leaving restores it', async ({
  page,
}) => {
  const first = page.getByRole('button', {name: 'First action'});
  const second = page.getByRole('button', {name: 'Second action'});
  const firstTip = page.getByRole('tooltip', {name: 'First hint'});
  const secondTip = page.getByRole('tooltip', {name: 'Second hint'});

  await first.hover();
  await page.clock.runFor(999);
  await expect(firstTip).toBeHidden();
  await page.clock.runFor(1);
  await expect(firstTip).toBeVisible();

  await second.hover();
  await expect(secondTip).toBeVisible();
  await expect(firstTip).toBeHidden();
  await expect(page.getByRole('tooltip')).toHaveCount(1);

  await page.mouse.move(1, 1);
  await page.clock.runFor(100);
  await expect(secondTip).toBeHidden();
  await first.hover();
  await page.clock.runFor(999);
  await expect(firstTip).toBeHidden();
  await page.clock.runFor(1);
  await expect(firstTip).toBeVisible();
});

test('keyboard focus remains immediate and Escape still dismisses the hint', async ({
  page,
}) => {
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', {name: 'First action'})).toBeFocused();
  await expect(page.getByRole('tooltip', {name: 'First hint'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip', {name: 'First hint'})).toBeHidden();
});
