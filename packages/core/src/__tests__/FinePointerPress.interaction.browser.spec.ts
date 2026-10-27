// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FinePointerPress.interaction.browser.spec.ts
 * @input The built Button, List, SegmentedControl and RadioList stories, a
 *   real mouse (no touch) or a real finger, the interaction harness
 * @output Interaction proofs for the fine-pointer press profile
 *   (`spec:AST-094` FR11, FR43, DEC-21): a mouse's press paints at
 *   `pointerdown` through the press controller, holds, and fades at the
 *   release, and its click runs once; a right click paints nothing; under
 *   reduced motion the release completes at once; a List row and an
 *   unselected SegmentedControl item paint at once, and the selected item
 *   paints nothing; and a press on a link inside a RadioList row paints
 *   nothing on the row, under a mouse or a finger
 * @position Interaction evidence for utils/pressFeedback.ts's fine profile
 *   and its nested-control boundary
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  openStory,
  tap,
  touchDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const PRESS = 'data-astryx-press';

interface Point {
  readonly x: number;
  readonly y: number;
}

async function centerOf(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('no box');
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

/** Records every value the element's press attribute takes from now on. */
async function recordPress(locator: Locator): Promise<void> {
  await locator.evaluate(element => {
    const values: (string | null)[] = [];
    (element as unknown as {__press: (string | null)[]}).__press = values;
    new MutationObserver(() => {
      values.push(element.getAttribute('data-astryx-press'));
    }).observe(element, {
      attributes: true,
      attributeFilter: ['data-astryx-press'],
    });
  });
}

async function pressValues(locator: Locator): Promise<(string | null)[]> {
  return locator.evaluate(
    element => (element as unknown as {__press: (string | null)[]}).__press,
  );
}

/** Counts the element's clicks from now on. */
async function countClicks(locator: Locator): Promise<() => Promise<number>> {
  await locator.evaluate(element => {
    (element as unknown as {__clicks: number}).__clicks = 0;
    element.addEventListener('click', () => {
      (element as unknown as {__clicks: number}).__clicks += 1;
    });
  });
  return async () =>
    locator.evaluate(
      element => (element as unknown as {__clicks: number}).__clicks,
    );
}

/**
 * The first RichContent row, with an unmarked native link added to its
 * description: the story's own links are Astryx Links, pressable surfaces of
 * their own, so a press on one never reached the row's surface anyway.
 */
async function rowWithNativeLink(
  page: Page,
): Promise<{row: Locator; link: Locator; text: Locator}> {
  await openStory(page, storybook(), 'core-radiolist--rich-content');
  const storyLink = page.getByRole('link', {name: 'Compare plans'}).first();
  await expect(storyLink).toBeVisible();
  const row = storyLink.locator('xpath=ancestor::*[@data-astryx-pressable][1]');
  await storyLink.evaluate(element => {
    const native = document.createElement('a');
    native.href = '#terms';
    native.textContent = 'Terms';
    native.style.marginInlineStart = '8px';
    element.after(native);
  });
  return {
    row,
    link: page.getByRole('link', {name: 'Terms'}),
    text: row.getByText('Free forever.'),
  };
}

async function mouseDownOn(page: Page, locator: Locator): Promise<void> {
  const center = await centerOf(locator);
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
}

test.describe('with a mouse', () => {
  test.use({
    hasTouch: false,
    isMobile: false,
    viewport: {width: 1024, height: 768},
  });

  test("a Button's press paints at pointerdown, holds, and fades at the release, and its click runs once", async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-button--primary');
    const button = page.getByRole('button', {name: 'Primary Button'});
    const clicks = await countClicks(button);
    await mouseDownOn(page, button);
    // A fine pointer has no scroll to wait out: painted at once.
    await expect(button).toHaveAttribute(PRESS, 'on', {timeout: 100});
    await page.waitForTimeout(300);
    await expect(button).toHaveAttribute(PRESS, 'on');
    await page.mouse.up();
    await expect(button).toHaveAttribute(PRESS, 'fading');
    await expect(button).not.toHaveAttribute(PRESS, /.+/);
    expect(await clicks()).toBe(1);
  });

  test('a right click paints nothing', async ({page}) => {
    await openStory(page, storybook(), 'core-button--primary');
    const button = page.getByRole('button', {name: 'Primary Button'});
    await recordPress(button);
    const center = await centerOf(button);
    await page.mouse.move(center.x, center.y);
    await page.mouse.down({button: 'right'});
    await page.waitForTimeout(150);
    await page.mouse.up({button: 'right'});
    await page.keyboard.press('Escape');
    expect(await pressValues(button)).toEqual([]);
  });

  test('a List row is pressed at once, and its release fades as under a finger', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-list--interactive');
    const row = page.locator('li[data-astryx-pressable]').first();
    await mouseDownOn(page, row);
    await expect(row).toHaveAttribute(PRESS, 'on', {timeout: 100});
    await page.mouse.up();
    await expect(row).toHaveAttribute(PRESS, 'fading');
    await expect(row).not.toHaveAttribute(PRESS, /.+/);
  });

  test('an unselected SegmentedControl item paints the shared overlay at once, fades at the release, and the click selects it', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-segmentedcontrol--default');
    const group = page.getByRole('radiogroup', {name: 'View mode'});
    const list = group.locator('[data-value="list"]');
    await mouseDownOn(page, list);
    await expect(list).toHaveAttribute(PRESS, 'on', {timeout: 100});
    const image = await list.evaluate(
      element => getComputedStyle(element).backgroundImage,
    );
    expect(image).toContain('gradient');
    await page.mouse.up();
    await expect(list).toHaveAttribute(PRESS, 'fading');
    await expect(list).not.toHaveAttribute(PRESS, /.+/);
    await expect(list).toHaveAttribute('aria-checked', 'true');
  });

  test('the selected SegmentedControl item paints nothing: it keeps its raised selected surface', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-segmentedcontrol--default');
    const group = page.getByRole('radiogroup', {name: 'View mode'});
    const grid = group.locator('[data-value="grid"]');
    await expect(grid).toHaveAttribute('aria-checked', 'true');
    await recordPress(grid);
    await mouseDownOn(page, grid);
    await page.waitForTimeout(150);
    await page.mouse.up();
    expect(await pressValues(grid)).toEqual([]);
  });

  test("a press on a native link inside a RadioList row paints nothing on the row, and on the row's own text it paints the row", async ({
    page,
  }) => {
    const {row, link, text} = await rowWithNativeLink(page);
    await recordPress(row);
    await mouseDownOn(page, link);
    await page.waitForTimeout(150);
    await page.mouse.up();
    expect(await pressValues(row)).toEqual([]);
    const box = await text.boundingBox();
    if (box == null) {
      throw new Error('no box');
    }
    await page.mouse.move(box.x + 4, box.y + box.height / 2);
    await page.mouse.down();
    await expect(row).toHaveAttribute(PRESS, 'on', {timeout: 100});
    await page.mouse.up();
  });

  test.describe('under reduced motion', () => {
    test("a mouse's release completes at once: no release animation runs", async ({
      page,
    }) => {
      await page.emulateMedia({reducedMotion: 'reduce'});
      await openStory(page, storybook(), 'core-list--interactive');
      const row = page.locator('li[data-astryx-pressable]').first();
      await mouseDownOn(page, row);
      await expect(row).toHaveAttribute(PRESS, 'on', {timeout: 100});
      await page.mouse.up();
      await expect(row).toHaveAttribute(PRESS, 'fading');
      expect(
        await row.evaluate(element => getComputedStyle(element).animationName),
      ).toBe('none');
    });
  });
});

test.describe('with a finger', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: {width: 390, height: 844},
  });

  test('a press on a native link inside a RadioList row paints nothing on the row', async ({
    page,
  }) => {
    const {row, link} = await rowWithNativeLink(page);
    await expect(link).toBeVisible();
    await recordPress(row);
    const driver = await touchDriver(page);
    await driver.play(tap(await centerOf(link), {holdMs: 400}));
    await page.waitForTimeout(100);
    expect(await pressValues(row)).toEqual([]);
  });
});
