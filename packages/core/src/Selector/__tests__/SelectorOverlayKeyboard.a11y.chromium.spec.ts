// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @pr-a11y release-only
 * @file SelectorOverlayKeyboard.a11y.chromium.spec.ts
 * @input The Pre Selected story at a phone viewport, with a stand-in
 *   `window.visualViewport` the test shrinks from the bottom as a software
 *   keyboard does
 * @output Browser proof that the selected-item overlay stays coherent with the
 *   layer once the keyboard caps it. The list ends above the keyboard, and the
 *   selected row stays over the trigger where the cap allows.
 * @position Chromium contract for the Selector overlay under the keyboard cap
 */
import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import type {Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {LAYER_KEYBOARD_CLEARANCE_PX} from '../../Layer/layerKeyboardClearance';
import {timing} from '../../motion/uikit/timing';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

/**
 * Replaces `window.visualViewport` before the page loads with one the test
 * drives: `__keyboard(cover)` shrinks it from the bottom and fires one
 * `resize`, as Mobile Safari does.
 */
async function installKeyboard(page: Page) {
  await page.addInitScript(() => {
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

test('the overlay list ends above the software keyboard and keeps the selected row over the trigger', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('console', message => {
    if (message.type() === 'warning' || message.type() === 'error') {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', error => problems.push(`pageerror: ${String(error)}`));
  await installKeyboard(page);
  await page.setViewportSize({width: 390, height: 844});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-selector--pre-selected&viewMode=story`,
    {waitUntil: 'load'},
  );
  const trigger = page.getByRole('combobox').first();
  await expect(trigger).toBeVisible();
  // The trigger sits low enough that the open list would run under the
  // keyboard. The centered story root grows with its content, so the move is
  // half the added height.
  await page.evaluate(() => {
    const block = document.createElement('div');
    block.style.height = '160px';
    document.getElementById('storybook-root')?.prepend(block);
  });
  await trigger.click();
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  const selected = listbox.getByRole('option', {selected: true});
  await expect(selected).toBeVisible();
  await expect(async () => {
    const [row, triggerBox] = await Promise.all([
      selected.boundingBox(),
      trigger.boundingBox(),
    ]);
    expect(row?.height ?? 0).toBeGreaterThan(0);
    expect(Math.abs(centerY(row) - centerY(triggerBox))).toBeLessThanOrEqual(2);
  }).toPass({timeout: 5_000});

  // The keyboard covers the lower 300px. The runtime caps the layer so it
  // ends clear of the keyboard; the overlay then re-measures from the capped
  // layer's box.
  const triggerBefore = await trigger.boundingBox();
  const listBefore = await listbox.boundingBox();
  const limit = 844 - 300 - LAYER_KEYBOARD_CLEARANCE_PX;
  // The uncapped list runs under the keyboard, so the cap has work to do.
  expect((listBefore?.y ?? 0) + (listBefore?.height ?? 0)).toBeGreaterThan(
    limit + 40,
  );
  await page.evaluate(() =>
    (window as unknown as {__keyboard: (cover: number) => void}).__keyboard(
      300,
    ),
  );
  await page.waitForTimeout(timing.keyboardNotificationMs + 100);
  await expect(async () => {
    const [box, row, triggerNow] = await Promise.all([
      listbox.boundingBox(),
      selected.boundingBox(),
      trigger.boundingBox(),
    ]);
    expect(box?.height ?? 0).toBeGreaterThan(0);
    // The runtime capped the layer: the list is shorter than before.
    expect(box?.height ?? 0).toBeLessThan((listBefore?.height ?? 0) - 20);
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(limit);
    // The trigger did not move; the row stays over it where the cap allows,
    // and inside the part of the viewport the keyboard leaves.
    expect(
      Math.abs((triggerNow?.y ?? 0) - (triggerBefore?.y ?? 0)),
    ).toBeLessThanOrEqual(1);
    expect(row?.height ?? 0).toBeGreaterThan(0);
    expect(centerY(row)).toBeLessThanOrEqual(limit);
    expect(Math.abs(centerY(row) - centerY(triggerNow))).toBeLessThanOrEqual(2);
  }).toPass({timeout: 5_000});
  // The capped list stays usable: at least two rows in full view above the
  // keyboard, inside the list's own box.
  const rowsInView = await page.evaluate(limitPx => {
    const list = document.querySelector<HTMLElement>('[role="listbox"]');
    if (list == null) {
      return 0;
    }
    const box = list.getBoundingClientRect();
    return Array.from(list.querySelectorAll<HTMLElement>('[role="option"]'))
      .map(option => option.getBoundingClientRect())
      .filter(
        rect =>
          rect.top >= box.top - 0.5 &&
          rect.bottom <= box.bottom + 0.5 &&
          rect.bottom <= limitPx + 0.5,
      ).length;
  }, limit);
  expect(rowsInView).toBeGreaterThanOrEqual(2);
  expect(problems).toEqual([]);
});

function centerY(box: {y: number; height: number} | null): number {
  return box == null ? Number.NaN : box.y + box.height / 2;
}
