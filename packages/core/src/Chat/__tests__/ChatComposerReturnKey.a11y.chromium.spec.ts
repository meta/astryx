// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Chat/ChatComposer|packages/core/src/Field/textEntryTraits|apps/storybook/stories/ChatComposer)

/**
 * @file ChatComposerReturnKey.a11y.chromium.spec.ts
 * @input The `Core/ChatComposer` Simplest and EnterBehavior stories in a built
 *   Storybook, in Chromium on a phone viewport with touch emulation.
 * @output Real-browser proof of component:ChatComposerInput FR17. The editor a
 *   finger focuses labels the touch keyboard's Return key Send by default. It
 *   takes the label a caller passes, such as Return where Enter inserts a line
 *   break.
 * @position Runs in pr-a11y when ChatComposer, its input, the keyboard traits
 *   or their stories change. jsdom has no touch input, so only a browser shows
 *   what the editor a tap focuses carries when the keyboard opens.
 */

import {expect, test, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

test.use({
  hasTouch: true,
  isMobile: true,
  viewport: {width: 390, height: 844},
});

/** Opens a story, taps its editor and returns its Return-key label. */
async function tapEditor(page: Page, story: string): Promise<string | null> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-chatcomposer--${story}&viewMode=story`,
  );
  // The emulation is a touch screen, as the stories read it.
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(true);
  // Present and painted before anything is judged.
  const editor = page.getByRole('textbox');
  await expect(editor).toBeVisible();
  const box = await editor.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);
  await editor.tap();
  await expect(editor).toBeFocused();
  return editor.getAttribute('enterkeyhint');
}

test('the editor a tap focuses labels the Return key Send by default', async ({
  page,
}) => {
  expect(await tapEditor(page, 'simplest')).toBe('send');
});

test('the editor a tap focuses carries the label its caller passes', async ({
  page,
}) => {
  // The story's Enter inserts a line break on a touch screen, so it passes
  // `enter` and the key reads Return.
  expect(await tapEditor(page, 'enter-behavior')).toBe('enter');
});
