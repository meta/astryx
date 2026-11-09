// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/(DropdownMenu|Button|Tooltip|Layer)/ ^apps/storybook/stories/DropdownMenu.stories.tsx$

/**
 * @file DropdownMenuTooltip.a11y.chromium.spec.ts
 * @input The Core/DropdownMenu stories in a built Storybook and Chromium
 * @output Regression evidence for suppressed trigger tooltips and focus return
 * @position Native popover and focus-modality proof for issue #8965
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
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

async function mount(page: Page, mode: string) {
  const story = mode === 'compound' ? 'compound-basic' : 'default';
  const presentation = mode === 'sheet' ? 'bottom-sheet' : 'popover';
  const params = new URLSearchParams({
    id: `core-dropdownmenu--${story}`,
    viewMode: 'story',
    args: `button.label:Actions;button.tooltip:More actions;presentation:${presentation}`,
  });
  await page.goto(`${storybook.origin}/iframe.html?${params}`);
  await holdMotionStill(page);
  const trigger = page.getByRole('button', {name: 'Actions', exact: true});
  const item = page.getByRole(mode === 'sheet' ? 'button' : 'menuitem', {
    name: 'Edit',
    exact: true,
  });
  await expect(trigger).toBeVisible();
  return {trigger, item};
}

function openTooltip(page: Page): Locator {
  return page.locator('[role="tooltip"]:popover-open');
}

async function pointerPick(page: Page, mode: string, hoverFirst = true) {
  const {trigger, item} = await mount(page, mode);
  if (hoverFirst) {
    await trigger.hover();
    await expect(openTooltip(page)).toBeVisible();
  }
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.waitForTimeout(400);
  await expect(openTooltip(page)).toHaveCount(0);
  await item.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await page.mouse.move(0, 0);
  await expect(trigger).toBeFocused();
  expect(
    await trigger.evaluate(el => el.matches(':hover, :focus-visible')),
  ).toBe(false);
  // Cross the show delay and hover bridge rather than passing before a timer.
  await page.waitForTimeout(400);
  await expect(openTooltip(page)).toHaveCount(0);

  await trigger.hover();
  await expect(openTooltip(page)).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(openTooltip(page)).toHaveCount(0);
}

async function keyboardPick(page: Page, mode: string) {
  const {trigger, item} = await mount(page, mode);
  await page.keyboard.press('Tab');
  await expect(trigger).toBeFocused();
  await expect(openTooltip(page)).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(item).toBeFocused();
  await expect(openTooltip(page)).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
  await expect(openTooltip(page)).toBeVisible();
  await page.keyboard.press('Escape');
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
  await pointerPick(page, 'sheet');
});

test('opening before the hover delay expires cancels the pending tooltip', async ({
  page,
}) => {
  await pointerPick(page, 'data', false);
});

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
  await keyboardPick(page, 'sheet');
});

test('Escape returns keyboard focus and shows the tooltip', async ({page}) => {
  const {trigger, item} = await mount(page, 'data');
  await page.keyboard.press('Tab');
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(item).toBeFocused();
  await expect(openTooltip(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
  await expect(openTooltip(page)).toBeVisible();
});
