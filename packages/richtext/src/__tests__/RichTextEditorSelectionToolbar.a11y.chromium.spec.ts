// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope richtext/* ^(apps/storybook/stories/RichTextEditor\.stories|packages/richtext/src/__tests__/RichTextEditorSelectionToolbar) ^packages/richtext/src/

/**
 * @file RichTextEditorSelectionToolbar.a11y.chromium.spec.ts
 * @input The built Storybook's "With selection toolbar" RichTextEditor story.
 * @output Real-browser proof that the selection toolbar shows beside a
 *   selection without taking focus, renders beside the editable text, clears
 *   the selected words, and moves no block; that axe finds nothing in it;
 *   that Alt+F10 moves focus into it, arrow keys move along it, and Escape
 *   returns focus to the editor with the selection kept; and that under a
 *   coarse pointer it docks to the bottom of the viewport.
 *
 * Run after building Storybook:
 *   pnpm storybook:build
 *   pnpm exec playwright test packages/richtext --project chromium
 */

import AxeBuilder from '@axe-core/playwright';
import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORYBOOK_DIR = process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR;
const STORY = 'richtext-richtexteditor--with-selection-toolbar';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(STORYBOOK_DIR);
});

test.afterAll(async () => {
  await storybook?.close();
});

async function openStory(page: Page) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story&globals=astryxTheme:neutral;colorMode:light;direction:ltr`,
    {waitUntil: 'load'},
  );
  return page.getByRole('textbox', {name: 'Notes'});
}

/**
 * Puts the page's selection in the editor's text run holding `words`, from
 * `from` to `to`, as a drag would; the editor reads it from there.
 */
async function selectInEditor(
  page: Page,
  words: string,
  from: number,
  to: number,
) {
  await page.evaluate(
    ({words, from, to}) => {
      const root = document.querySelector('[contenteditable="true"]');
      if (root == null) {
        throw new Error('no editor');
      }
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.textContent?.includes(words)) {
          document.getSelection()?.setBaseAndExtent(node, from, node, to);
          return;
        }
      }
      throw new Error(`no text run holds "${words}"`);
    },
    {words, from, to},
  );
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('not rendered');
  }
  return box;
}

test('the selection toolbar overlays the document beside a selection, and takes the keyboard on Alt+F10', async ({
  page,
}) => {
  await page.setViewportSize({width: 900, height: 600});
  const editor = await openStory(page);
  await editor.click();
  await page.keyboard.type('Ship the launch notes today.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('The next paragraph stays where it is.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('And so does this one.');
  const blocks = () =>
    editor
      .locator('p')
      .evaluateAll(paragraphs =>
        paragraphs.map(p => [
          p.getBoundingClientRect().top,
          p.getBoundingClientRect().height,
        ]),
      );
  const before = await blocks();
  const toolbar = page.getByRole('toolbar', {name: 'Selected text'});
  await expect(toolbar).toBeHidden();

  // Select words in the middle line: the toolbar shows and leaves focus be.
  await selectInEditor(page, 'The next paragraph stays where it is.', 9, 18);
  await expect(toolbar).toBeVisible();
  await expect(editor).toBeFocused();
  expect(await blocks()).toEqual(before);
  expect(
    await toolbar.evaluate(element => {
      const root = document.querySelector('[contenteditable="true"]');
      const surface = element.closest('[data-richtext-selection-toolbar]');
      return (
        root != null &&
        surface != null &&
        !root.contains(surface) &&
        surface.parentElement === root.parentElement
      );
    }),
  ).toBe(true);
  // It clears the selected words, above their line where there is room.
  const selected = await page.evaluate(() => {
    const rect = document.getSelection()?.getRangeAt(0).getBoundingClientRect();
    return rect == null
      ? null
      : {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
        };
  });
  if (selected == null) {
    throw new Error('no selection');
  }
  const bar = await boxOf(toolbar);
  expect(bar.y + bar.height).toBeLessThanOrEqual(selected.top);
  expect(bar.x).toBeGreaterThanOrEqual(0);
  expect(bar.x + bar.width).toBeLessThanOrEqual(900);
  const axe = await new AxeBuilder({page})
    .include('[data-richtext-selection-toolbar]')
    .analyze();
  expect(axe.violations).toEqual([]);

  // Alt+F10 moves focus in; arrows move along; Escape gives it back with the
  // selection kept.
  await page.keyboard.press('Alt+F10');
  await expect(toolbar.getByRole('button', {name: 'Bold'})).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(toolbar.getByRole('button', {name: 'Italic'})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(editor).toBeFocused();
  expect(await page.evaluate(() => document.getSelection()?.toString())).toBe(
    'paragraph',
  );
  await expect(toolbar).toBeVisible();

  // Focus comes back to the control it left, and a format from the keyboard
  // applies to the selection and keeps it.
  await page.keyboard.press('Alt+F10');
  const italic = toolbar.getByRole('button', {name: 'Italic'});
  await expect(italic).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(italic).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.getSelection()?.toString())).toBe(
    'paragraph',
  );
  expect(await blocks()).toEqual(before);
});

test('the selection toolbar docks to the bottom of the viewport under a coarse pointer', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: {width: 390, height: 640},
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    const editor = await openStory(page);
    await editor.tap();
    await page.keyboard.type('Ship the launch notes today.');
    await selectInEditor(page, 'Ship the launch notes today.', 9, 21);
    const toolbar = page.getByRole('toolbar', {name: 'Selected text'});
    await expect(toolbar).toBeVisible();
    const surface = page.locator('[data-richtext-selection-toolbar="docked"]');
    await expect(surface).toHaveCSS('position', 'fixed');
    const box = await boxOf(surface);
    const viewport = await page.evaluate(() => ({
      height: window.visualViewport?.height ?? window.innerHeight,
      width: window.visualViewport?.width ?? window.innerWidth,
    }));
    expect(Math.abs(box.y + box.height - viewport.height)).toBeLessThanOrEqual(
      1,
    );
    expect(Math.abs(box.width - viewport.width)).toBeLessThanOrEqual(1);
    const axe = await new AxeBuilder({page})
      .include('[data-richtext-selection-toolbar]')
      .analyze();
    expect(axe.violations).toEqual([]);
  } finally {
    await context.close();
  }
});
