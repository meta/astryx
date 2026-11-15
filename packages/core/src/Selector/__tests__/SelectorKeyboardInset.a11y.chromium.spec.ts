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
 *   When the keyboard's report ends, the open list keeps its top: a list the
 *   cap held grows downward in place. A list that slid above a late keyboard
 *   holds against a shorter one.
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

const raiseKeyboard = async (page: Page, cover = COVER) =>
  page.evaluate(
    value =>
      (window as unknown as {__keyboard: (cover: number) => void}).__keyboard(
        value,
      ),
    cover,
  );

/**
 * Sets the keyboard's cover (0 ends its report) and returns the open list's
 * top in each of the next 30 frames, read in the page.
 */
async function coverAndTrackTop(page: Page, cover = 0): Promise<number[]> {
  return page.getByRole('listbox').evaluate(async (list, value) => {
    (window as unknown as {__keyboard: (cover: number) => void}).__keyboard(
      value,
    );
    const tops: number[] = [];
    for (let frame = 0; frame < 30; frame++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      tops.push(list.getBoundingClientRect().top);
    }
    return tops;
  }, cover);
}

/**
 * Waits for the open's own animations to end. Until then the entrance, on the
 * popover's surface, moves the list's box. A wait past 2 s fails and names
 * what still runs.
 */
async function openEnded(page: Page): Promise<void> {
  await page.getByRole('listbox').evaluate(async list => {
    const layer = list.closest('[popover]') ?? list;
    const finite = layer
      .getAnimations({subtree: true})
      .filter(
        animation => animation.effect?.getComputedTiming().endTime !== Infinity,
      );
    const ended = Promise.all(
      finite.map(async animation => animation.finished.catch(() => undefined)),
    ).then(() => 'ended' as const);
    const cap = new Promise<'cap'>(resolve => {
      setTimeout(() => resolve('cap'), 2_000);
    });
    if ((await Promise.race([ended, cap])) === 'cap') {
      const running = finite
        .filter(animation => animation.playState !== 'finished')
        .map(animation => {
          const target = (animation.effect as KeyframeEffect | null)?.target;
          const name =
            animation instanceof CSSAnimation
              ? animation.animationName
              : animation instanceof CSSTransition
                ? animation.transitionProperty
                : 'script';
          return `${target?.tagName ?? 'no target'} ${name} ${animation.playState}`;
        });
      throw new Error(
        `The open's animations still run after 2 s: ${running.join('; ')}`,
      );
    }
  });
}

function expectTopHeld(tops: number[], top: number, detail: string) {
  expect(tops.length, detail).toBeGreaterThan(0);
  for (const each of tops) {
    expect(Math.abs(each - top), detail).toBeLessThanOrEqual(0.5);
  }
}

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

  test(`a list opened with the keyboard up stays where it is when the keyboard's report ends, trigger ${drop} px lower`, async ({
    page,
  }) => {
    const trigger = await openStory(page, drop);
    await raiseKeyboard(page);
    await trigger.click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await openEnded(page);
    await expect(async () => {
      expectClearOfKeyboard(await listFacts(page));
    }).toPass({timeout: 3_000});
    const placed = await listFacts(page);
    const tops = await coverAndTrackTop(page);
    const detail = JSON.stringify({placed, tops});
    expectTopHeld(tops, placed.top, detail);
    const after = await listFacts(page);
    expect(after.rows, detail).toBe(OPTIONS);
    expect(after.rowsWithBox, detail).toBe(OPTIONS);
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

  test(`a list that slid above a late keyboard holds against a shorter one, trigger ${drop} px lower`, async ({
    page,
  }) => {
    const trigger = await openStory(page, drop);
    await trigger.click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await raiseKeyboard(page);
    await expect(async () => {
      expectClearOfKeyboard(await listFacts(page));
    }).toPass({timeout: 3_000});
    const placed = await listFacts(page);
    const tops = await coverAndTrackTop(page, COVER - 100);
    expectTopHeld(tops, placed.top, JSON.stringify({placed, tops}));
  });
}

test('a list the cap holds above the keyboard grows downward in place when the report ends', async ({
  page,
}) => {
  // A 300 px list in a 600 px viewport. The keyboard leaves 210 px above
  // its line, so the cap holds the list there and it scrolls.
  const cover = 380;
  const line = 600 - cover - LAYER_KEYBOARD_CLEARANCE_PX;
  await installKeyboard(page);
  await page.setViewportSize({width: 390, height: 600});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-selector--long-list&viewMode=story`,
    {waitUntil: 'load'},
  );
  const trigger = page.getByRole('combobox').first();
  await expect(trigger).toBeVisible();
  await raiseKeyboard(page, cover);
  await trigger.click();
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  await openEnded(page);
  const read = async () =>
    listbox.evaluate(list => {
      const box = list.getBoundingClientRect();
      const finger = [...list.querySelectorAll('[role="option"]')]
        .map(row => row.getBoundingClientRect())
        .filter(row => row.height > 0 && row.top >= box.top)[2];
      return {
        top: box.top,
        bottom: box.bottom,
        fingerTop: finger?.top ?? Number.NaN,
      };
    });
  let held = await read();
  await expect(async () => {
    held = await read();
    expect(held.bottom - held.top, JSON.stringify(held)).toBeGreaterThan(100);
    expect(held.bottom, JSON.stringify(held)).toBeLessThanOrEqual(line + 0.5);
    expect(held.fingerTop, JSON.stringify(held)).toBeGreaterThan(held.top);
  }).toPass({timeout: 3_000});
  const tops = await coverAndTrackTop(page);
  const after = await read();
  const detail = JSON.stringify({held, after, tops});
  expectTopHeld(tops, held.top, detail);
  expect(
    Math.abs(after.fingerTop - held.fingerTop),
    detail,
  ).toBeLessThanOrEqual(0.5);
  expect(after.bottom, detail).toBeGreaterThan(held.bottom + 40);
});
