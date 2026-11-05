// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/(Selector|Layer)/|apps/storybook/stories/Selector\.stories)

/**
 * @file SelectorKeyboardInset.a11y.chromium.spec.ts
 * @input The Pre Selected story at a phone viewport, its trigger moved low. A
 *   stand-in `window.visualViewport` shrinks from the bottom as a software
 *   keyboard does.
 * @output Browser proof that the selected-item overlay slides above the
 *   software keyboard. The list ends clear of the keyboard with its rows in
 *   view, whether the keyboard was up before the list opened or rose after.
 * @position Chromium contract for the Selector overlay beside the keyboard
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
// The keyboard and its bars cover the lower 300 px of the layout viewport.
const COVER = 300;
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

const raiseKeyboard = async (page: Page) =>
  page.evaluate(
    cover =>
      (window as unknown as {__keyboard: (cover: number) => void}).__keyboard(
        cover,
      ),
    COVER,
  );

/**
 * Opens the story with its trigger moved down by `drop` px. The centered story
 * root grows with its content, so it adds twice that height above it.
 */
async function openStory(page: Page, drop: number) {
  await installKeyboard(page);
  await page.setViewportSize(VIEWPORT);
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-selector--pre-selected&viewMode=story`,
    {waitUntil: 'load'},
  );
  const trigger = page.getByRole('combobox').first();
  await expect(trigger).toBeVisible();
  await page.evaluate(height => {
    const block = document.createElement('div');
    block.style.height = `${height}px`;
    document.getElementById('storybook-root')?.prepend(block);
  }, drop * 2);
  return trigger;
}

interface ListFacts {
  top: number;
  bottom: number;
  rows: number;
  rowsWithBox: number;
  rowsAboveKeyboard: number;
}

/** Where the open list is, and how many of its rows show above the keyboard. */
async function listFacts(page: Page): Promise<ListFacts> {
  return page.getByRole('listbox').evaluate((list, limit) => {
    const box = list.getBoundingClientRect();
    const rows = [...list.querySelectorAll('[role="option"]')].map(row =>
      row.getBoundingClientRect(),
    );
    return {
      top: box.top,
      bottom: box.bottom,
      rows: rows.length,
      rowsWithBox: rows.filter(row => row.height > 0).length,
      rowsAboveKeyboard: rows.filter(
        row =>
          row.height > 0 &&
          row.top >= Math.max(0, box.top) - 0.5 &&
          row.bottom <= Math.min(box.bottom, limit) + 0.5,
      ).length,
    };
  }, LIMIT);
}

// The Pre Selected story's options.
const OPTIONS = 4;

function expectClearOfKeyboard(facts: ListFacts) {
  const detail = JSON.stringify({...facts, limit: LIMIT});
  // The list and each of its options are there, with a box.
  expect(facts.rows, detail).toBe(OPTIONS);
  expect(facts.bottom - facts.top, detail).toBeGreaterThan(0);
  expect(facts.rowsWithBox, detail).toBe(OPTIONS);
  expect(facts.top, detail).toBeGreaterThanOrEqual(0);
  expect(facts.bottom, detail).toBeLessThanOrEqual(LIMIT + 0.5);
  expect(facts.rowsAboveKeyboard, detail).toBe(facts.rows);
}

// Trigger 496–516 px: the cap alone leaves two rows above the keyboard.
// Trigger 566–586 px: under the keyboard's line, the list's top just above it.
// Trigger 606–626 px: the whole list would open under the keyboard.
for (const drop of [80, 150, 190]) {
  test(`a list opened with the keyboard up ends above it, trigger ${drop} px lower`, async ({
    page,
  }) => {
    const trigger = await openStory(page, drop);
    await raiseKeyboard(page);
    await trigger.click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(async () => {
      expectClearOfKeyboard(await listFacts(page));
    }).toPass({timeout: 3_000});
  });

  test(`an open list moves above a keyboard that rises, trigger ${drop} px lower`, async ({
    page,
  }) => {
    const trigger = await openStory(page, drop);
    await trigger.click();
    await expect(page.getByRole('listbox')).toBeVisible();
    // Without the keyboard the list overlays the trigger, under the line.
    const before = await listFacts(page);
    expect(before.bottom, JSON.stringify(before)).toBeGreaterThan(LIMIT);
    await raiseKeyboard(page);
    await expect(async () => {
      expectClearOfKeyboard(await listFacts(page));
    }).toPass({timeout: 3_000});
  });
}
