// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListReorderNumbering.interaction.browser.spec.ts
 * @input The Core/List Reorder numbering story, a mouse and a finger
 * @output Browser proofs that a handle drags its row, with a mouse and a
 *   finger, after the numbering turns on and after it turns off again. The
 *   List renders a new list element each time
 * @position Beside ListReorderPointer and ListReorderTouch, which prove the
 *   drags on a list whose numbering never changes
 */

import {
  expect,
  test,
  type Browser,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  holdThenDrag,
  openStory,
  touchDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';
import {reorder} from '../../motion/uikit/reorder';

const storybook = withStorybook(test);

const STORY = 'core-list-reorder--numbering-toggle';

/** Past the claim delay: the hold claims the drag. */
const HOLD_MS = reorder.claim.delayMs + 150;

const ROWS = ['Inbox', 'Sent', 'Drafts', 'Archive', 'Spam', 'Trash'];

/** The first row moved two places down. */
const MOVED = ['Sent', 'Drafts', 'Inbox', 'Archive', 'Spam', 'Trash'];

/** The story's row labels, in order. */
async function labels(page: Page): Promise<string[]> {
  return page
    .locator('#storybook-root li:not([data-astryx-leaving])')
    .evaluateAll(rows =>
      rows.map(row => {
        const label = row.cloneNode(true) as HTMLElement;
        label.querySelectorAll('button').forEach(button => button.remove());
        return label.textContent?.trim() ?? '';
      }),
    );
}

/** The centre of `label`'s handle and the height of its row. */
async function handleOf(page: Page, label: string) {
  const handle = page.getByRole('button', {name: `Reorder ${label}`});
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  const row = await handle
    .locator('xpath=ancestor::li[1]')
    .evaluate(element => element.getBoundingClientRect().height);
  if (box == null) {
    throw new Error(`no handle for ${label}`);
  }
  return {
    at: {x: box.x + box.width / 2, y: box.y + box.height / 2},
    rowHeight: row,
  };
}

/** Turns the numbering on or off `times` times, each a new list element. */
async function toggleNumbering(page: Page, times: number) {
  const list = page.locator('#storybook-root :is(ul, ol)').first();
  for (let turn = 0; turn < times; turn++) {
    const tag = await list.evaluate(element => element.tagName);
    await page
      .getByRole('button', {name: /^(Number the rows|Remove the numbers)$/})
      .click();
    await expect
      .poll(async () => list.evaluate(element => element.tagName))
      .not.toBe(tag);
  }
}

/** The story in a context with no touch screen: the primary pointer is fine. */
async function openFinePointerStory(browser: Browser) {
  const context = await browser.newContext({
    viewport: {width: 800, height: 900},
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  });
  const page = await context.newPage();
  await openStory(page, storybook(), STORY);
  return {page, close: async () => context.close()};
}

for (const toggles of [0, 1, 2]) {
  test(`a mouse drags a row from its handle after the numbering changes ${toggles} times`, async ({
    browser,
  }) => {
    const story = await openFinePointerStory(browser);
    try {
      const {page} = story;
      await toggleNumbering(page, toggles);
      expect(await labels(page)).toEqual(ROWS);
      const {at, rowHeight} = await handleOf(page, 'Inbox');
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      await page.mouse.move(at.x, at.y + rowHeight * 2.5, {steps: 12});
      await page.mouse.up();
      await expect.poll(async () => labels(page)).toEqual(MOVED);
    } finally {
      await story.close();
    }
  });

  test(`a finger holds a handle, then drags its row, after the numbering changes ${toggles} times`, async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    test.skip(
      !(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)),
      'this engine reports a fine primary pointer; the touch hold applies under (pointer: coarse)',
    );
    await toggleNumbering(page, toggles);
    expect(await labels(page)).toEqual(ROWS);
    const {at, rowHeight} = await handleOf(page, 'Inbox');
    const driver = await touchDriver(page);
    await driver.play(
      holdThenDrag(
        at,
        {x: at.x, y: at.y + rowHeight * 2},
        {holdMs: HOLD_MS, durationMs: 400, restMs: 120},
      ),
    );
    await expect.poll(async () => labels(page)).toEqual(MOVED);
  });
}
