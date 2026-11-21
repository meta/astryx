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
 *   holds against a shorter one. A list beside a field near the viewport's
 *   end, which the browser flips above it, also ends above the keyboard, as
 *   its options grow. A list taller than the room above the keyboard shrinks
 *   to that room.
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

// The Selector's field, fixed 8 px above the viewport's end: the list has no
// room below it, so the browser flips it above.
const NEAR_END = 8;

async function pinFieldNearEnd(page: Page) {
  const gap = await page.evaluate(() => {
    const field = document
      .querySelector<HTMLElement>('[role="combobox"]')
      ?.closest<HTMLElement>('.astryx-selector');
    if (field == null) {
      throw new Error('the Selector field must be in the document');
    }
    field.style.position = 'fixed';
    field.style.width = '250px';
    field.style.insetInlineStart = '24px';
    field.style.insetBlockStart = 'auto';
    field.style.insetBlockEnd = '8px';
    return window.innerHeight - field.getBoundingClientRect().bottom;
  });
  expect(gap).toBeCloseTo(NEAR_END, 0);
}

async function openStoryNearEnd(page: Page) {
  const trigger = await openStory(page, 0);
  await pinFieldNearEnd(page);
  return trigger;
}

test("a list beside a field near the viewport's end ends above a keyboard that was up before the open", async ({
  page,
}) => {
  const trigger = await openStoryNearEnd(page);
  await raiseKeyboard(page);
  await trigger.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(async () => {
    expectClearOfKeyboard(await listFacts(page));
  }).toPass({timeout: 3_000});
});

test("a list beside a field near the viewport's end moves above a keyboard that rises while it is open", async ({
  page,
}) => {
  const trigger = await openStoryNearEnd(page);
  await trigger.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  // Without the keyboard the list ends under the keyboard's line.
  const before = await listFacts(page);
  expect(before.bottom, JSON.stringify(before)).toBeGreaterThan(LIMIT);
  await raiseKeyboard(page);
  await expect(async () => {
    expectClearOfKeyboard(await listFacts(page));
  }).toPass({timeout: 3_000});
});

/**
 * Makes one option of the open list taller, as a late web font does, and
 * waits two frames. The overlay measures again after the browser's layout, so
 * by then the list is where it stays.
 */
async function growOption(page: Page, index: number, height: number) {
  await page
    .getByRole('option')
    .nth(index)
    .evaluate(async (option, value) => {
      (option as HTMLElement).style.minHeight = `${value}px`;
      for (let frame = 0; frame < 2; frame++) {
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    }, height);
}

test("a list that a grown option flips above a field near the viewport's end stays above a keyboard as another option grows", async ({
  page,
}) => {
  const trigger = await openStoryNearEnd(page);
  await trigger.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await openEnded(page);
  // The grown list no longer fits below the field, so the browser flips it.
  await growOption(page, 0, 96);
  await raiseKeyboard(page);
  await expect(async () => {
    expectClearOfKeyboard(await listFacts(page));
  }).toPass({timeout: 3_000});
  await growOption(page, OPTIONS - 1, 120);
  await expect(async () => {
    expectClearOfKeyboard(await listFacts(page));
  }).toPass({timeout: 3_000});
});

// A phone on its side. Nine options are taller than the room above a 200 px
// keyboard, so the list shrinks to that room and scrolls.
const LANDSCAPE = {width: 844, height: 390};
const LANDSCAPE_COVER = 200;
const LANDSCAPE_LIMIT =
  LANDSCAPE.height - LANDSCAPE_COVER - LAYER_KEYBOARD_CLEARANCE_PX;

async function openTallStoryNearEnd(page: Page) {
  await installKeyboard(page);
  await page.setViewportSize(LANDSCAPE);
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-selector--flipped-overlay-beside-keyboard&viewMode=story`,
    {waitUntil: 'load'},
  );
  const trigger = page.getByRole('combobox');
  await expect(trigger).toBeVisible();
  await pinFieldNearEnd(page);
  return trigger;
}

async function expectShrunkAboveKeyboard(page: Page) {
  await expect(async () => {
    const facts = await page.getByRole('listbox').evaluate(list => {
      const box = list.getBoundingClientRect();
      return {
        top: box.top,
        bottom: box.bottom,
        scrolls: list.scrollHeight > list.clientHeight,
      };
    });
    const detail = JSON.stringify({...facts, limit: LANDSCAPE_LIMIT});
    expect(facts.top, detail).toBeGreaterThanOrEqual(0);
    expect(facts.bottom, detail).toBeLessThanOrEqual(LANDSCAPE_LIMIT + 0.5);
    // The list fills the room to within a row, and its other options scroll.
    expect(facts.bottom - facts.top, detail).toBeGreaterThanOrEqual(
      LANDSCAPE_LIMIT - 40,
    );
    expect(facts.scrolls, detail).toBe(true);
  }).toPass({timeout: 3_000});
}

test('a list taller than the room above a keyboard that was up before the open shrinks to that room', async ({
  page,
}) => {
  const trigger = await openTallStoryNearEnd(page);
  await raiseKeyboard(page, LANDSCAPE_COVER);
  await trigger.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await expectShrunkAboveKeyboard(page);
});

test('a list taller than the room above a keyboard that rises while it is open shrinks to that room', async ({
  page,
}) => {
  const trigger = await openTallStoryNearEnd(page);
  await trigger.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await raiseKeyboard(page, LANDSCAPE_COVER);
  await expectShrunkAboveKeyboard(page);
});

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

test('a list flipped above its trigger by an option that grows shrinks to the room above the keyboard', async ({
  page,
}) => {
  await installKeyboard(page);
  await page.setViewportSize(LANDSCAPE);
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-selector--pre-selected&viewMode=story`,
    {waitUntil: 'load'},
  );
  const trigger = page.getByRole('combobox');
  await expect(trigger).toBeVisible();
  await pinFieldNearEnd(page);
  await trigger.click();
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();

  // Wait for open animations to finish
  await openEnded(page);

  // Make the first option grow: list grows past 180 px and flips above trigger
  await page.evaluate(() => {
    const opt = document.querySelector<HTMLElement>('[role="option"]');
    if (opt != null) {
      opt.style.minHeight = '96px';
    }
  });

  let naturalHeight = 0;
  await expect(async () => {
    const box = await listbox.evaluate(el => el.getBoundingClientRect());
    expect(box.height).toBeGreaterThanOrEqual(200);
    naturalHeight = box.height;
  }).toPass({timeout: 3_000});

  // Raise 200 px software keyboard
  await raiseKeyboard(page, LANDSCAPE_COVER);

  // Assert after keyboard rises:
  // - list bottom <= 180 px and top >= 16 px
  // - scrollHeight > clientHeight
  // - the last option can be scrolled into view and activated
  await expect(async () => {
    const facts = await listbox.evaluate(list => {
      const box = list.getBoundingClientRect();
      return {
        top: box.top,
        bottom: box.bottom,
        scrolls: list.scrollHeight > list.clientHeight,
      };
    });
    const detail = JSON.stringify({...facts, limit: LANDSCAPE_LIMIT});
    expect(facts.top, detail).toBeGreaterThanOrEqual(15.5);
    expect(facts.bottom, detail).toBeLessThanOrEqual(LANDSCAPE_LIMIT + 0.5);
    expect(facts.scrolls, detail).toBe(true);
  }).toPass({timeout: 3_000});

  // The last option can be scrolled into view and activated
  const lastOption = page.getByRole('option').last();
  await lastOption.scrollIntoViewIfNeeded();
  await lastOption.click();
  await expect(listbox).toBeHidden();
  await expect(trigger).toHaveText('Mango');

  // Re-open and verify list returns to natural height with no cap variables when keyboard closes
  await trigger.click();
  await expect(listbox).toBeVisible();
  await openEnded(page);
  await raiseKeyboard(page, 0);

  await expect(async () => {
    const facts = await listbox.evaluate(list => {
      const layer = list.closest<HTMLElement>('[popover]');
      const box = list.getBoundingClientRect();
      const capVar =
        layer?.style.getPropertyValue('--_layer-keyboard-max-block-size') ?? '';
      return {
        height: box.height,
        capVar,
      };
    });
    expect(facts.height).toBeCloseTo(naturalHeight, 0);
    expect(facts.capVar).toBe('');
  }).toPass({timeout: 3_000});
});
