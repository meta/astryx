// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FieldLabelTap.a11y.chromium.spec.ts
 * @input The `Core/FieldLabel` States story in a built Storybook, in Chromium:
 *   the Nickname field, whose label carries a `labelTooltip` info icon.
 * @output Real-browser proof of FieldLabel FR9: a touch tap on the info icon
 *   shows its help and leaves the text field unfocused, while a mouse click on
 *   the icon focuses the field like a click anywhere else on the label.
 * @position Run with `pnpm test:a11y-contract`. Focus from label activation
 *   needs a real browser: jsdom's label activation never focuses a text input.
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
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

/** Opens the story and returns the Nickname label's help trigger. */
async function openInfoIcon(page: Page): Promise<Locator> {
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  const icon = page.locator(
    `label[for="${FIELD_ID}"] ~ button[aria-label^="About "]`,
  );
  await icon.waitFor();
  return icon;
}

async function focusedId(page: Page): Promise<string> {
  return page.evaluate(() => document.activeElement?.id ?? '');
}

test.describe('a touch tap on the info icon', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: {width: 390, height: 844},
  });

  test('shows the help and leaves the field unfocused', async ({page}) => {
    const icon = await openInfoIcon(page);
    const box = await icon.boundingBox();
    if (box == null) {
      throw new Error('the info icon has no layout box');
    }
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

    await expect(
      page.getByRole('tooltip').filter({hasText: HELP}),
    ).toBeVisible();
    // The tap asked for the help, so the label did not go on to focus its
    // field (which on a phone would raise the keyboard over the help).
    expect(await focusedId(page)).not.toBe(FIELD_ID);
  });
});

test.describe('a mouse click on the info icon', () => {
  test('shows the help and leaves the field unfocused: the trigger is outside the label', async ({
    page,
  }) => {
    const icon = await openInfoIcon(page);
    await icon.click();

    await expect(
      page.getByRole('tooltip').filter({hasText: HELP}),
    ).toBeVisible();
    expect(await focusedId(page)).not.toBe(FIELD_ID);
  });
});

test.describe('the keyboard', () => {
  test('reaches the trigger by Tab, and its help opens', async ({page}) => {
    const icon = await openInfoIcon(page);
    await icon.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');

    await expect(icon).toBeFocused();
    await expect(
      page.getByRole('tooltip').filter({hasText: HELP}),
    ).toBeVisible();
  });
});

test.describe('Enter and Space on the trigger', () => {
  test('toggle the help and never focus the field (FR9)', async ({page}) => {
    const icon = await openInfoIcon(page);
    const help = page.getByRole('tooltip').filter({hasText: HELP});
    // Focus alone previews the help; move the pointer away and settle it
    // closed first, so the key press is what opens it.
    await icon.focus();
    await page.keyboard.press('Escape');
    await expect(help).toBeHidden();

    await page.keyboard.press('Enter');
    await expect(help).toBeVisible();
    await page.keyboard.press('Space');
    await expect(help).toBeHidden();
    await expect(icon).toBeFocused();
    expect(await focusedId(page)).not.toBe(FIELD_ID);
  });
});

test.describe('a visually hidden label', () => {
  test('hides the trigger with it, and shows it while it has keyboard focus (FR9)', async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-fieldlabel--hidden-label-with-tooltip&viewMode=story`,
    );
    const icon = page.getByRole('button', {name: 'About Search'});
    await icon.waitFor({state: 'attached'});
    const field = page.locator('#field-label-hidden-tooltip');

    const hidden = await icon.boundingBox();
    expect(hidden?.width ?? 0).toBeLessThanOrEqual(1);

    await field.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(icon).toBeFocused();
    const shown = await icon.boundingBox();
    expect(shown?.width ?? 0).toBeGreaterThan(8);
  });
});
