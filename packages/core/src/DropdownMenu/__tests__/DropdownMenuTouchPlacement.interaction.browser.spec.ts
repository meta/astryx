// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuTouchPlacement.interaction.browser.spec.ts
 * @input The built Default DropdownMenu story on the harness's phone profile
 *   (compact, coarse pointer), real touch input and the interaction harness
 * @output Placement proofs for the compact touch presentation (one touch
 *   model on every engine): the menu opens beside its trigger, below it at
 *   the default placement, and never covers it, in the upper and the lower
 *   half of the viewport. A mouse keeps the menu below its trigger too
 * @position Evidence for DropdownMenu's placement on a phone (and
 *   MoreMenu's); the motion and the press model have their own specs
 *
 * The trigger is moved with a relative offset (a layout shift, not a
 * transform) to put it near an edge or in the lower half.
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  frames,
  openStory,
  touchDriver,
  waitForRest,
  withStorybook,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';

/** The page's viewport; every spec here sets one. */
function viewportOf(page: Page): {width: number; height: number} {
  const viewport = page.viewportSize();
  if (viewport == null) {
    throw new Error('no viewport');
  }
  return viewport;
}

const storybook = withStorybook(test);

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function openStoryWithTrigger(
  page: Page,
  offset: {x: number; y: number} = {x: 0, y: 0},
): Promise<{driver: TouchDriver; trigger: Locator; popover: Locator}> {
  await openStory(page, storybook(), 'core-dropdownmenu--default');
  const trigger = page.getByRole('button', {name: 'Actions'});
  await trigger.evaluate((node, {x, y}) => {
    const el = node as HTMLElement;
    el.style.position = 'relative';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }, offset);
  return {
    driver: await touchDriver(page),
    trigger,
    popover: page.locator('[popover]:has([role="menu"])').first(),
  };
}

const boxOf = async (locator: Locator): Promise<Box> => {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('no box');
  }
  return box;
};

const centerOf = (box: Box) => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});

async function openWithTap(
  page: Page,
  driver: TouchDriver,
  trigger: Locator,
  popover: Locator,
) {
  await driver.tap(centerOf(await boxOf(trigger)));
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await waitForRest(popover);
  await frames(page, 2);
}

// The story centers its trigger; these move it into the upper half, where
// the menu opens downward from the trigger's top.
const UPPER = -150;

test.describe('under a mouse (a fine primary pointer) on a phone-size screen', () => {
  test.use({hasTouch: false, isMobile: false});
  test('the menu stays below its trigger, not pinned to the sides', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-dropdownmenu--default');
    // The case is a fine pointer's: prove the page reports one.
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    const trigger = page.getByRole('button', {name: 'Actions'});
    const popover = page.locator('[popover]:has([role="menu"])').first();
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await waitForRest(popover);
    const t = await boxOf(trigger);
    const m = await boxOf(popover);
    expect(m.y).toBeGreaterThanOrEqual(t.y + t.height - 1);
    expect(
      await popover.evaluate(el => el.style.getPropertyValue('justify-self')),
    ).toBe('');
  });
});

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

test('on a phone the menu opens below its trigger, start-aligned, and never covers it', async ({
  page,
}) => {
  const {driver, trigger, popover} = await openStoryWithTrigger(page, {
    x: 0,
    y: UPPER,
  });
  await openWithTap(page, driver, trigger, popover);
  const t = await boxOf(trigger);
  const m = await boxOf(popover);
  expect(m.y).toBeGreaterThanOrEqual(t.y + t.height - 1);
  expect(overlaps(m, t)).toBe(false);
  expect(
    await popover.evaluate(el => el.style.getPropertyValue('justify-self')),
  ).toBe('');
});

test('on a phone, from a trigger in the lower half, the menu still sits beside it, not over it', async ({
  page,
}) => {
  const {height} = viewportOf(page);
  const {driver, trigger, popover} = await openStoryWithTrigger(page, {
    x: 0,
    y: Math.round(height * 0.3),
  });
  await openWithTap(page, driver, trigger, popover);
  const t = await boxOf(trigger);
  const m = await boxOf(popover);
  expect(overlaps(m, t)).toBe(false);
  const beside = m.y >= t.y + t.height - 1 || m.y + m.height <= t.y + 1;
  expect(beside).toBe(true);
});
