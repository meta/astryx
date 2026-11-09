// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FieldLabelTap.a11y.chromium.spec.ts
 * @input The `Core/FieldLabel` States story in a built Storybook, in Chromium:
 *   the Nickname field, whose label has a `labelTooltip` info button after it.
 * @output Real-browser proof of FieldLabel FR9: a touch tap, a mouse click, and
 *   Enter on the info button show its help and leave the text field
 *   unfocused.
 * @position Run with `pnpm test:a11y-contract`. Focus from label activation
 *   needs a real browser: jsdom's label activation never focuses a text input.
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORY = 'core-fieldlabel--states';
const HELP = 'This name is shown to collaborators.';
const FIELD_ID = 'field-label-optional';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(DEFAULT_STORYBOOK_DIR);
});

test.afterAll(async () => {
  await storybook?.close();
});

/** Opens the story and returns the info button after the Nickname label. */
async function openInfoIcon(page: Page): Promise<Locator> {
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  const icon = page.locator(`label[for="${FIELD_ID}"] + button`);
  await icon.waitFor();
  return icon;
}

async function focusedId(page: Page): Promise<string> {
  return page.evaluate(() => document.activeElement?.id ?? '');
}

test.describe('a touch tap on the info button', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: {width: 390, height: 844},
  });

  test('shows the help and leaves the field unfocused', async ({page}) => {
    const icon = await openInfoIcon(page);
    const box = await icon.boundingBox();
    if (box == null) {
      throw new Error('the info button has no layout box');
    }
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

    await expect(
      page.getByRole('tooltip').filter({hasText: HELP}),
    ).toBeVisible();
    // The tap asked for the help, so the label did not go on to focus its
    // field (which on a phone would raise the keyboard over the help).
    expect(await focusedId(page)).not.toBe(FIELD_ID);
  });

  test('a hidden label’s focused info button keeps its touch band on itself, adding no page scroll', async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-fieldlabel--hidden-label-info&viewMode=story`,
    );
    const field = page.getByRole('textbox', {name: 'Search people'});
    await field.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(
      page.getByRole('button', {name: 'About Search people'}),
    ).toBeFocused();
    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - innerWidth,
      y: document.documentElement.scrollHeight - innerHeight,
    }));
    expect(overflow.x).toBeLessThanOrEqual(0);
    expect(overflow.y).toBeLessThanOrEqual(0);
  });
});

test.describe('a mouse click or a key on the info button', () => {
  test('a click shows the help and leaves the field unfocused', async ({
    page,
  }) => {
    const icon = await openInfoIcon(page);
    await icon.click();

    await expect(
      page.getByRole('tooltip').filter({hasText: HELP}),
    ).toBeVisible();
    // The button sits outside the label, so the click is for its help only.
    expect(await focusedId(page)).not.toBe(FIELD_ID);
  });

  for (const [layout, name] of [
    ['a stacked Field', 'Search people'],
    ['a horizontal-labels FormLayout', 'Search teams'],
  ]) {
    test(`in ${layout}, a hidden label’s info button shows uncovered while it has keyboard focus`, async ({
      page,
    }) => {
      await page.goto(
        `${storybook.origin}/iframe.html?id=core-fieldlabel--hidden-label-info&viewMode=story`,
      );
      const field = page.getByRole('textbox', {name});
      await field.focus();
      await page.keyboard.press('Shift+Tab');
      const button = page.getByRole('button', {name: `About ${name}`});
      await expect(button).toBeFocused();
      const box = await button.boundingBox();
      if (box == null) {
        throw new Error('the focused info button has no layout box');
      }
      expect(box.width).toBeGreaterThan(8);
      const isOnTop = await page.evaluate(
        ({x, y}) => {
          const hit = document.elementFromPoint(x, y);
          return hit?.closest('button')?.getAttribute('aria-label') ?? null;
        },
        {x: box.x + box.width / 2, y: box.y + box.height / 2},
      );
      expect(isOnTop).toBe(`About ${name}`);
    });
  }

  test('on the first field of a dialog’s scrolling body, a hidden label’s focused info button stays inside the body', async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-fieldlabel--hidden-label-info-in-dialog&viewMode=story`,
    );
    const field = page.getByRole('textbox', {name: 'Search files'});
    await field.focus();
    await page.keyboard.press('Shift+Tab');
    const button = page.getByRole('button', {name: 'About Search files'});
    await expect(button).toBeFocused();
    const placement = await button.evaluate(el => {
      let scroller = el.parentElement;
      while (scroller && getComputedStyle(scroller).overflowY === 'visible') {
        scroller = scroller.parentElement;
      }
      const box = el.getBoundingClientRect();
      const view = scroller?.getBoundingClientRect();
      const hit = document.elementFromPoint(
        box.x + box.width / 2,
        box.y + box.height / 2,
      );
      return {
        isInside:
          view != null && box.top >= view.top && box.bottom <= view.bottom,
        isOnTop: hit?.closest('button') === el,
        width: box.width,
      };
    });
    expect(placement).toEqual({
      isInside: true,
      isOnTop: true,
      width: expect.any(Number),
    });
    expect(placement.width).toBeGreaterThan(8);
  });

  test('Enter shows the help and leaves the field unfocused', async ({
    page,
  }) => {
    const icon = await openInfoIcon(page);
    await icon.focus();
    await page.keyboard.press('Enter');

    await expect(icon).toHaveAttribute('aria-expanded', 'true');
    expect(await focusedId(page)).not.toBe(FIELD_ID);
  });
});
