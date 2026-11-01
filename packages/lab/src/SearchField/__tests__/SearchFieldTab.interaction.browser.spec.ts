// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SearchFieldTab.interaction.browser.spec.ts
 * @input The built "Lab/SearchField" InTabBar story on the harness's phone
 *   (touch), a stand-in visual viewport that reports a software keyboard the
 *   way Mobile Safari does, real touch input and the interaction harness
 * @output Proofs that the tab placement's field ends up above the keyboard:
 *   a tap focuses it without moving the page, and the story's stand-in tab
 *   bar keeps above the keyboard by layout, committed on each report, so
 *   the field's centre rests 36 px above the keyboard's top, and back down
 *   when the field is cancelled; the field paints no background of its own
 *   (no ::before or ::after on the field or the trailing end: the tab bar
 *   draws the glass)
 * @position Interaction proof for lab SearchField's tab placement and its
 *   story (SearchField.tsx, SearchField.stories.tsx); the real tab bar's
 *   keyboard handling is TabBar's
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  openStory,
  touchDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

/** The keyboard cover Mobile Safari reports on an iPhone 17 Pro, px. */
const COVER = 337;
/** The field's centre above the keyboard's top, px. */
const CENTER_ABOVE_KEYBOARD = 36;

/**
 * Mobile Safari, before the page loads: no VirtualKeyboard API (Chromium's
 * is removed), and a visual viewport the test shrinks from the bottom with
 * one `resize` (`__keyboard(cover)`).
 */
async function installKeyboard(page: Page) {
  await page.addInitScript(() => {
    Reflect.deleteProperty(Navigator.prototype, 'virtualKeyboard');
    Reflect.deleteProperty(navigator, 'virtualKeyboard');
    const viewport = Object.assign(new EventTarget(), {
      height: window.innerHeight,
      width: window.innerWidth,
      offsetTop: 0,
      offsetLeft: 0,
      pageTop: 0,
      pageLeft: 0,
      scale: 1,
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      get: () => viewport,
    });
    (window as unknown as {__keyboard: (cover: number) => void}).__keyboard =
      cover => {
        viewport.height = window.innerHeight - cover;
        viewport.dispatchEvent(new Event('resize'));
      };
  });
}

const keyboard = async (page: Page, cover: number) =>
  page.evaluate(
    c => (window as unknown as {__keyboard: (c: number) => void}).__keyboard(c),
    cover,
  );

async function centerOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('no box');
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

test('the field paints no background of its own: the tab bar draws the glass', async ({
  page,
}) => {
  await openStory(page, storybook(), 'lab-searchfield--in-tab-bar');
  const field = page.getByRole('searchbox', {name: 'Search'});
  await expect(field).toBeVisible();
  const contents = await page.evaluate(() => {
    const box = document.querySelector('[role="search"]')
      ?.firstElementChild as HTMLElement;
    const end = document.querySelector(
      '[data-search-field-end]',
    ) as HTMLElement;
    return [
      getComputedStyle(box, '::before').content,
      getComputedStyle(box, '::after').content,
      getComputedStyle(end, '::before').content,
    ];
  });
  // A pseudo-element with no content is not generated.
  expect(contents).toEqual(['none', 'none', 'none']);
});

test('the stand-in tab bar keeps above the keyboard: the field rests 36 px above it, and goes back down on cancel', async ({
  page,
}) => {
  await installKeyboard(page);
  await openStory(page, storybook(), 'lab-searchfield--in-tab-bar');
  const field = page.getByRole('searchbox', {name: 'Search'});
  await expect(field).toBeVisible();
  const rest = (await centerOf(field)).y;
  await (await touchDriver(page)).tap(await centerOf(field));
  await expect(field).toBeFocused();
  // No page move: the tap focuses without Safari's reveal.
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await keyboard(page, COVER);
  const keyboardTop = await page.evaluate(
    cover => window.innerHeight - cover,
    COVER,
  );
  // The field ends with its centre 36 px above the keyboard's top.
  await expect
    .poll(async () => Math.round(keyboardTop - (await centerOf(field)).y), {
      timeout: 3000,
    })
    .toBe(CENTER_ABOVE_KEYBOARD);
  // The tab bar's cancel button cancels through the handle; the keyboard
  // goes down and the bar goes back to rest.
  await page.getByRole('button', {name: 'Cancel'}).click();
  await keyboard(page, 0);
  await expect
    .poll(async () => Math.round((await centerOf(field)).y), {timeout: 3000})
    .toBe(Math.round(rest));
});
