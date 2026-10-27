// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListDividersPaths.interaction.browser.spec.ts
 * @input The built List "With Media" story (dividers), the interaction
 *   harness, Storybook's colour-mode and direction globals
 * @output The divider paths beside the main press proofs: a press the
 *   browser takes for a scroll brings both dividers back at once; a mouse
 *   press on a fine pointer leaves them drawn; dark mode and right-to-left
 *   hide and restore them the same way
 * @position Interaction evidence for List/ListItem.tsx's divider arms, beside
 *   ListDividers.interaction.browser.spec.ts; under a finger
 *   (./touchStory.ts), where the arms apply
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  drag,
  holdAnimations,
  releaseAnimations,
  seekAnimations,
  tap,
  touchDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';
import {openStory} from './touchStory';

const storybook = withStorybook(test);

const STORY = 'core-list--with-media';
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

const rows = (page: Page) => page.locator('li[data-astryx-pressable]');

const dividers = async (page: Page) =>
  rows(page).evaluateAll(elements =>
    elements.map(el => getComputedStyle(el).borderBottomColor),
  );

async function open(page: Page, globals?: string) {
  await openStory(page, storybook(), STORY, {globals});
  await expect(rows(page)).toHaveCount(3);
}

async function center(row: Locator) {
  const box = await row.boundingBox();
  if (box == null) {
    throw new Error('no row');
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

async function touchOnly(page: Page) {
  const touch = await page.evaluate(
    () => matchMedia('(pointer: coarse)').matches,
  );
  test.skip(!touch, 'the divider arms serve a touch screen');
}

/** Holds the middle row; returns the dividers while pressed and at the release's start. */
async function pressMiddle(page: Page) {
  const driver = await touchDriver(page);
  const at = await center(rows(page).nth(1));
  let pressed: string[] = [];
  let released: string[] = [];
  await driver.play(tap(at, {holdMs: 400}), {
    onEvent: async (_, event) => {
      if (event === 0) {
        await page.waitForTimeout(260);
        pressed = await dividers(page);
      } else {
        await holdAnimations(page);
        await seekAnimations(page, 0);
        released = await dividers(page);
      }
    },
  });
  await releaseAnimations(page);
  return {pressed, released};
}

test('a press the browser takes for a scroll brings both dividers back at once', async ({
  page,
}) => {
  await open(page);
  await touchOnly(page);
  // A page tall enough to scroll, so a vertical pan is the browser's.
  await page.evaluate(() => {
    document.body.style.minHeight = '300vh';
  });
  const rest = await dividers(page);
  const driver = await touchDriver(page);
  const from = await center(rows(page).nth(1));
  let pressed: string[] = [];
  await driver.play(
    drag(from, {x: from.x, y: from.y - 80}, {holdMs: 300, durationMs: 160}),
    {
      onEvent: async (_, event) => {
        if (event === 0) {
          await page.waitForTimeout(260);
          pressed = await dividers(page);
        }
      },
    },
  );
  expect(pressed[0]).toBe(TRANSPARENT);
  expect(pressed[1]).toBe(TRANSPARENT);
  await expect
    .poll(async () => rows(page).nth(1).getAttribute('data-astryx-press'))
    .toBeNull();
  expect(await dividers(page)).toEqual(rest);
});

test('a mouse press on a fine pointer leaves the dividers drawn', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: {width: 1024, height: 768},
    hasTouch: false,
    isMobile: false,
  });
  const page = await context.newPage();
  try {
    await open(page);
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    const rest = await dividers(page);
    expect(rest[0]).not.toBe(TRANSPARENT);
    const at = await center(rows(page).nth(1));
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    expect(await dividers(page)).toEqual(rest);
    await page.mouse.up();
    expect(await dividers(page)).toEqual(rest);
  } finally {
    await context.close();
  }
});

for (const {name, globals} of [
  {name: 'dark mode', globals: 'colorMode:dark'},
  {name: 'right to left', globals: 'direction:rtl'},
]) {
  test(`${name}: a press hides the same two dividers and the release restores them`, async ({
    page,
  }) => {
    await open(page, globals);
    await touchOnly(page);
    if (name === 'right to left') {
      expect(
        await rows(page)
          .first()
          .evaluate(el => getComputedStyle(el).direction),
      ).toBe('rtl');
    }
    const rest = await dividers(page);
    expect(rest[0]).not.toBe(TRANSPARENT);
    const {pressed, released} = await pressMiddle(page);
    expect(pressed[0]).toBe(TRANSPARENT);
    expect(pressed[1]).toBe(TRANSPARENT);
    expect(released[0]).toBe(rest[0]);
    expect(released[1]).toBe(rest[1]);
  });
}

test('dark mode keeps its own divider colour at rest', async ({page}) => {
  await open(page);
  const light = await dividers(page);
  await open(page, 'colorMode:dark');
  const dark = await dividers(page);
  expect(dark[0]).not.toBe(TRANSPARENT);
  expect(dark[0]).not.toBe(light[0]);
});
