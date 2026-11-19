// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/richtext/src/(RichTextEditorLinkPopoverPlugin|linkForm|linkEditing|editorReposition|useEditorFocusAndDrag)|apps/storybook/stories/RichTextEditor\.stories)

/**
 * @file RichTextEditorLinkPopoverPlugin.a11y.chromium.spec.ts
 * @input Storybook story richtext-richtexteditor--with-link-popover-plugin
 * @output In real Chromium at desktop and phone widths: a click in a link
 *   shows the link popover under the link's line, inside the editor's width,
 *   as a named group beside the editable text; resting the pointer on another
 *   link opens nothing; Escape closes it and returns focus to the text
 * @position Real-browser check for component:RichTextEditorLinkPopoverPlugin
 *   FR1, FR5, FR6 and AR1: jsdom has no layout.
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
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

for (const width of [1280, 390]) {
  test(`the caret in a link shows its popover under the line at ${width} px`, async ({
    page,
  }) => {
    await page.setViewportSize({width, height: 800});
    await page.goto(
      `${storybook.origin}/iframe.html?id=richtext-richtexteditor--with-link-popover-plugin&viewMode=story`,
      {waitUntil: 'load'},
    );
    const editable = page.locator('[contenteditable="true"]');
    const notes = editable.locator('a', {hasText: 'the release notes'});
    const guide = editable.locator('a', {hasText: 'the guide'});
    await expect(notes).toBeVisible();

    // Resting the pointer on a link opens nothing.
    await guide.hover();
    await page.waitForTimeout(600);
    await expect(page.getByRole('group', {name: 'Link'})).toHaveCount(0);

    await notes.click();
    const popover = page.getByRole('group', {name: 'Link'});
    await expect(popover).toBeVisible();
    await expect(
      popover.getByRole('link', {name: 'example.com/docs/release-notes'}),
    ).toBeVisible();

    // Beside the editable text, under the link's line, inside the editor.
    expect(
      await popover.evaluate(
        element =>
          element.parentElement?.querySelector('[contenteditable]') != null &&
          !element.closest('[contenteditable]'),
      ),
    ).toBe(true);
    const line = await notes.boundingBox();
    const box = await popover.boundingBox();
    const frame = await editable.evaluate(element => {
      const rect = element.parentElement!.getBoundingClientRect();
      return {left: rect.left, right: rect.right};
    });
    expect(line).not.toBeNull();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(line!.y + line!.height - 1);
    expect(box!.x).toBeGreaterThanOrEqual(frame.left - 1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(frame.right + 1);
    await page.screenshot({
      path: test.info().outputPath(`link-popover-${width}.png`),
    });

    await page.keyboard.press('Escape');
    await expect(popover).toHaveCount(0);
    await expect(editable).toBeFocused();
  });
}
