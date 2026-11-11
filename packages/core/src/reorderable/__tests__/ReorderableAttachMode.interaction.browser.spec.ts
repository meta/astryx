// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ReorderableAttachMode.interaction.browser.spec.ts
 * @input The createReorderable "Attach plain elements" story, opened in
 *   real Chromium through the interaction harness
 * @output Browser evidence for `attach`'s reorder mode on plain elements:
 *   named grips in the Tab order, Space or Enter, arrow moves a React app
 *   applies with setState, announcements, the hint's buttons, Escape, and
 *   `start(key)`. The list gains no element
 * @position Verification for reorderable/attachReorderable.ts. Pointer and
 *   touch drags of attached items are not built, so no case drags
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const STORY = 'core-utilities-createreorderable--attach-plain-elements';

const grip = (page: Page, card: string) =>
  page.getByRole('button', {name: `Reorder ${card}`, exact: true});

const order = async (page: Page) =>
  page
    .locator('#storybook-root ol > li')
    .evaluateAll(rows =>
      rows.map(row => row.querySelector('span')?.textContent ?? ''),
    );

/** Everything the page's live regions say right now. */
const announced = async (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('[aria-live], [role="status"]'))
      .map(element => element.textContent ?? '')
      .join(' '),
  );

test.describe('createReorderable attach, reorder mode', () => {
  test.use({
    hasTouch: false,
    isMobile: false,
    viewport: {width: 900, height: 700},
  });

  test('each grip is a named reorder toggle in the Tab order, and the list gains no element', async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    await page.keyboard.press('Tab');
    await expect(grip(page, 'Ace of spades')).toBeFocused();
    await expect(grip(page, 'Ace of spades')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await page.keyboard.press('Tab');
    await expect(grip(page, 'King of hearts')).toBeFocused();
    const children = await page
      .locator('#storybook-root ol')
      .evaluate(list => Array.from(list.children).map(child => child.tagName));
    expect(children).toEqual(['LI', 'LI', 'LI', 'LI']);
  });

  for (const key of ['Space', 'Enter']) {
    test(`${key} turns on reorder mode, each arrow commits a move with the focus on the grip, and Escape ends it keeping the moves`, async ({
      page,
    }) => {
      await openStory(page, storybook(), STORY);
      await page.keyboard.press('Shift');
      await grip(page, 'Ace of spades').focus();
      await page.keyboard.press(key);
      await expect(grip(page, 'Ace of spades')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(page.getByRole('button', {name: 'Done'})).toBeVisible();
      await page.keyboard.press('ArrowDown');
      await expect
        .poll(async () => order(page))
        .toEqual([
          'King of hearts',
          'Ace of spades',
          'Queen of clubs',
          'Jack of diamonds',
        ]);
      await expect
        .poll(async () => announced(page))
        .toContain(
          'Ace of spades, position 2 of 4, after King of hearts, before Queen of clubs',
        );
      await expect(grip(page, 'Ace of spades')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(grip(page, 'Ace of spades')).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      await expect(page.getByRole('button', {name: 'Done'})).toBeHidden();
      await expect
        .poll(async () => announced(page))
        .toContain('Done, Ace of spades at position 2 of 4');
      expect(await order(page)).toEqual([
        'King of hearts',
        'Ace of spades',
        'Queen of clubs',
        'Jack of diamonds',
      ]);
    });
  }

  test("the hint's buttons move the item as the keys do, and Done ends the mode", async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    await grip(page, 'Ace of spades').click();
    await expect(grip(page, 'Ace of spades')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', {name: 'Move down'}).click();
    await expect
      .poll(async () => order(page))
      .toEqual([
        'King of hearts',
        'Ace of spades',
        'Queen of clubs',
        'Jack of diamonds',
      ]);
    await expect(grip(page, 'Ace of spades')).toBeFocused();
    await page.getByRole('button', {name: 'Done'}).click();
    await expect(grip(page, 'Ace of spades')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(grip(page, 'Ace of spades')).toBeFocused();
  });

  test("start(key) turns on reorder mode for an attached item from the app's own UI", async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    await page.getByRole('button', {name: 'Move Queen of clubs'}).click();
    await expect(grip(page, 'Queen of clubs')).toBeFocused();
    await expect(grip(page, 'Queen of clubs')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.press('ArrowUp');
    await expect
      .poll(async () => order(page))
      .toEqual([
        'Ace of spades',
        'Queen of clubs',
        'King of hearts',
        'Jack of diamonds',
      ]);
  });
});
