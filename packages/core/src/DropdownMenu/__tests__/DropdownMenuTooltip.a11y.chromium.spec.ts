// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/(DropdownMenu|Button|Tooltip|Layer)/|apps/storybook/stories/DropdownMenuTooltipA11y)

/**
 * @file DropdownMenuTooltip.a11y.chromium.spec.ts
 * @input Built DropdownMenuTooltipA11y stories and real Chromium input
 * @output Regression evidence for suppressed trigger tooltips and focus return
 * @position Native popover and focus-modality proof for issue #8965
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
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

async function mount(page: Page, story = 'data'): Promise<Locator> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=a11y-dropdownmenu-tooltip--${story}&viewMode=story`,
  );
  await holdMotionStill(page);
  const trigger = page.getByRole('button', {name: 'Actions', exact: true});
  await expect(trigger).toBeVisible();
  return trigger;
}

function openTooltip(page: Page): Locator {
  return page.locator('[role="tooltip"]:popover-open');
}

async function expectClosedAfterPick(page: Page, trigger: Locator) {
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('status', {name: 'Picks'})).toHaveText('1');
  await page.getByRole('button', {name: 'Elsewhere'}).hover();
  await expect(trigger).toBeFocused();
  expect(
    await trigger.evaluate(el => el.matches(':hover, :focus-visible')),
  ).toBe(false);
  // Cross the default show delay and the hover bridge: an absent tooltip
  // before a still-pending timer runs is not proof that it stays closed.
  await page.waitForTimeout(400);
  await expect(openTooltip(page)).toHaveCount(0);
}

async function pointerPick(page: Page, story: string) {
  const trigger = await mount(page, story);
  await trigger.hover();
  await expect(openTooltip(page)).toBeVisible();
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(openTooltip(page)).toHaveCount(0);
  await page
    .getByRole(story === 'bottom-sheet' ? 'button' : 'menuitem', {
      name: 'Rename',
      exact: true,
    })
    .click();
  await expectClosedAfterPick(page, trigger);

  await trigger.hover();
  await expect(openTooltip(page)).toBeVisible();
  await page.getByRole('button', {name: 'Elsewhere'}).hover();
  await expect(openTooltip(page)).toHaveCount(0);
}

test('a data menu does not resurrect its tooltip after a pointer pick', async ({
  page,
}) => {
  await pointerPick(page, 'data');
});

test('a compound menu does not resurrect its tooltip after a pointer pick', async ({
  page,
}) => {
  await pointerPick(page, 'compound');
});

test('a bottom sheet does not resurrect its tooltip after a pointer pick', async ({
  page,
}) => {
  await pointerPick(page, 'bottom-sheet');
});

test('opening before the hover delay expires cancels the pending tooltip', async ({
  page,
}) => {
  const trigger = await mount(page);
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.waitForTimeout(400);
  await expect(openTooltip(page)).toHaveCount(0);
  await page.getByRole('menuitem', {name: 'Rename', exact: true}).click();
  await expectClosedAfterPick(page, trigger);
});

async function keyboardPick(page: Page, story: string) {
  const trigger = await mount(page, story);
  await page.keyboard.press('Tab');
  await expect(trigger).toBeFocused();
  await expect(openTooltip(page)).toBeVisible();
  await page.keyboard.press('Enter');
  const item = page.getByRole(
    story === 'bottom-sheet' ? 'button' : 'menuitem',
    {name: 'Rename', exact: true},
  );
  await expect(item).toBeFocused();
  await expect(openTooltip(page)).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('status', {name: 'Picks'})).toHaveText('1');
  await expect(openTooltip(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(openTooltip(page)).toHaveCount(0);
}

test('keyboard selection in a data menu returns focus and shows the tooltip', async ({
  page,
}) => {
  await keyboardPick(page, 'data');
});

test('keyboard selection in a compound menu returns focus and shows the tooltip', async ({
  page,
}) => {
  await keyboardPick(page, 'compound');
});

test('keyboard selection in a bottom sheet returns focus and shows the tooltip', async ({
  page,
}) => {
  await keyboardPick(page, 'bottom-sheet');
});

test('Escape returns keyboard focus and shows the tooltip', async ({page}) => {
  const trigger = await mount(page);
  await page.keyboard.press('Tab');
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', {name: 'Rename'})).toBeFocused();
  await expect(openTooltip(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('status', {name: 'Picks'})).toHaveText('0');
  await expect(openTooltip(page)).toBeVisible();
});
