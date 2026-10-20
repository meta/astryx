// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BlockDirection.a11y.chromium.spec.ts
 * @input The RichTextEditor "Default" story in a built Storybook.
 * @output Real-Chromium proof that writing a block's direction does not cost
 *   an undo step, and that typing a strong character flips the block it is
 *   typed into.
 * @position Guards BlockDirectionPlugin against the regression its first
 *   draft had: sweeping the direction from an update listener landed as its
 *   own history entry, so undo bounced off it and never got past the
 *   keystroke that changed the block's direction.
 *
 * Build the Storybook first:
 *
 *   pnpm storybook:build
 *   pnpm exec playwright test BlockDirection.a11y.chromium.spec.ts
 */

import {expect, test, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORYBOOK_DIR = process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR;
const STORY = 'richtext-richtexteditor--default';
const EDITOR = '[data-lexical-editor]';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(STORYBOOK_DIR);
});

test.afterAll(async () => {
  await storybook?.close();
});

async function openEditor(page: Page, direction: 'ltr' | 'rtl' = 'ltr') {
  await page.setViewportSize({width: 1024, height: 768});
  await page.goto(
    `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story&globals=astryxTheme:neutral;colorMode:light;direction:${direction}`,
    {waitUntil: 'load'},
  );
  const editor = page.locator(EDITOR);
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await expect(editor).toHaveText('');
  return editor;
}

/** The whole document's text, with no editor-internal markers. */
async function documentText(page: Page): Promise<string> {
  return (await page.locator(EDITOR).innerText()).trim();
}

test('undo walks all the way back after a list shortcut', async ({page}) => {
  // Typing `- ` makes a list, and `Hello` gives that list a direction it did
  // not have. Writing the direction must ride in the keystroke's own history
  // entry; as a step of its own it would be re-applied after every undo and
  // the document would never empty.
  await openEditor(page);
  await page.keyboard.type('- ');
  await page.keyboard.type('Hello');
  await expect(page.locator(`${EDITOR} li`)).toHaveCount(1);

  for (let press = 0; press < 8; press++) {
    await page.keyboard.press('ControlOrMeta+z');
  }
  expect(await documentText(page)).toBe('');
  await expect(page.locator(`${EDITOR} li`)).toHaveCount(0);
});

test('undo walks all the way back after a block changes direction', async ({
  page,
}) => {
  // `123 ` has no direction of its own; the Hebrew word gives the paragraph
  // one mid-keystroke, which is exactly when the direction gets written.
  await openEditor(page);
  await page.keyboard.type('123 ');
  await page.keyboard.type('\u05e9\u05dc\u05d5\u05dd');
  await expect(page.locator(`${EDITOR} > p`).first()).toHaveAttribute(
    'dir',
    'rtl',
  );

  for (let press = 0; press < 10; press++) {
    await page.keyboard.press('ControlOrMeta+z');
  }
  expect(await documentText(page)).toBe('');
});

for (const direction of ['ltr', 'rtl'] as const) {
  test(`a paragraph takes its direction from the text typed into it (${direction})`, async ({
    page,
  }) => {
    await openEditor(page, direction);
    const paragraph = page.locator(`${EDITOR} > p`).first();
    // Nothing typed: no direction of its own, so it follows the document.
    await expect(paragraph).toHaveAttribute('dir', 'auto');
    expect(
      await paragraph.evaluate(el => getComputedStyle(el).direction),
    ).toBe(direction);

    await page.keyboard.type('123 ');
    // Still no strong character.
    await expect(paragraph).toHaveAttribute('dir', 'auto');

    await page.keyboard.type('Hello');
    await expect(paragraph).toHaveAttribute('dir', 'ltr');
    expect(
      await paragraph.evaluate(el => getComputedStyle(el).direction),
    ).toBe('ltr');

    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('\u05e9\u05dc\u05d5\u05dd');
    await expect(paragraph).toHaveAttribute('dir', 'rtl');
    expect(
      await paragraph.evaluate(el => getComputedStyle(el).direction),
    ).toBe('rtl');
  });
}
