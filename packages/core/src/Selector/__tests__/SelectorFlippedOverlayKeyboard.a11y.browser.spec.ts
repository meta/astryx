// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/(Selector|Layer)/|apps/storybook/stories/Selector\.stories)

/**
 * @file SelectorFlippedOverlayKeyboard.a11y.browser.spec.ts
 * @input The Flipped Overlay Beside Keyboard story at a phone viewport, its
 *   Selector's field 300 px above the viewport's end. A stand-in
 *   `window.visualViewport` shrinks from the bottom as a 291 px software
 *   keyboard does.
 * @output Browser proof that the list opens above the keyboard at its height
 *   without one, on either side of its field.
 * @position Chromium and WebKit contract for the Selector overlay beside the
 *   keyboard, on the story a phone check uses
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {LAYER_KEYBOARD_CLEARANCE_PX} from '../../Layer/layerKeyboardClearance';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

const VIEWPORT = {width: 390, height: 844};
// An iPhone's software keyboard with its predictive bar off.
const COVER = 291;
const LIMIT = VIEWPORT.height - COVER - LAYER_KEYBOARD_CLEARANCE_PX;

/**
 * Replaces `window.visualViewport` before the page loads with one the test
 * drives: `__keyboard(cover)` shrinks it from the bottom and fires one
 * `resize`, as Mobile Safari does.
 */
async function installKeyboard(page: Page) {
  await page.addInitScript(() => {
    Reflect.deleteProperty(Navigator.prototype, 'virtualKeyboard');
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

/** The open list's box, and its layout height, which no transform scales. */
async function listBox(page: Page) {
  return page.getByRole('listbox').evaluate(list => {
    const box = list.getBoundingClientRect();
    return {
      top: box.top,
      bottom: box.bottom,
      height: (list as HTMLElement).offsetHeight,
    };
  });
}

test('a list beside a field 300 px above the end opens above a 291 px keyboard at its full height', async ({
  page,
}) => {
  await installKeyboard(page);
  await page.setViewportSize(VIEWPORT);
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-selector--flipped-overlay-beside-keyboard&viewMode=story`,
    {waitUntil: 'load'},
  );
  const trigger = page.getByRole('combobox');
  const field = await trigger.evaluate(
    combobox =>
      combobox.closest('.astryx-selector')?.getBoundingClientRect().bottom ??
      Number.NaN,
  );
  expect(VIEWPORT.height - field).toBeCloseTo(300, 0);
  // Without the keyboard, the list's height.
  await trigger.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  const full = (await listBox(page)).height;
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toBeHidden();
  // The keyboard rises, then the list opens.
  await page.evaluate(
    cover =>
      (window as unknown as {__keyboard: (cover: number) => void}).__keyboard(
        cover,
      ),
    COVER,
  );
  await trigger.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(async () => {
    const box = await listBox(page);
    const detail = JSON.stringify({...box, full, limit: LIMIT});
    expect(box.top, detail).toBeGreaterThanOrEqual(0);
    expect(box.bottom, detail).toBeLessThanOrEqual(LIMIT + 0.5);
    expect(box.height, detail).toBe(full);
  }).toPass({timeout: 3_000});
});
