// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/Markdown richtext/* ^(apps/storybook/stories/RichTextEditor\.(markdownParity|stories)|packages/richtext/src/__tests__/(MarkdownParitySandbox|RichTextView|RichTextEditorToolbar)) ^packages/richtext/src/

/**
 * @file RichTextView.a11y.chromium.spec.ts
 * @input The built Storybook's "Markdown serializers" story, which renders one
 *   document in a RichTextEditor and in a RichTextView.
 * @output Real-browser proof for spec:AST-061 FR2 on the view: every block's
 *   text takes the theme's body type, not the host page's font, so the view and
 *   the editor draw the same document the same size.
 *
 * Run after building Storybook:
 *   pnpm storybook:build
 *   pnpm exec playwright test packages/richtext --project chromium
 */

import {expect, test} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORYBOOK_DIR = process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR;
const STORY = 'richtext-richtexteditor--markdown-serializers';
const DOCUMENT = [
  'Paragraph text',
  '',
  '- List item',
  '  - Nested item',
  '',
  '> Quoted text',
  '',
  '| Cell | Other |',
  '| --- | --- |',
  '| Body | Cell |',
  '',
].join('\n');

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(STORYBOOK_DIR);
});

test.afterAll(async () => {
  await storybook?.close();
});

for (const colorMode of ['light', 'dark'] as const) {
  test(`the view draws every block in the body type the editor uses (${colorMode})`, async ({
    page,
  }) => {
    // The story host's own font is 16px/24px, so inheriting it shows.
    await page.setViewportSize({width: 1240, height: 1000});
    await page.goto(
      `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story&globals=astryxTheme:neutral;colorMode:${colorMode};direction:ltr`,
      {waitUntil: 'load'},
    );
    await page.locator('textarea').fill(DOCUMENT);
    const surfaces = page.locator('[data-lexical-editor]');
    await expect(surfaces).toHaveCount(2);
    await expect(surfaces.nth(1).locator('td, th')).toHaveCount(4);

    const read = (index: number) =>
      surfaces.nth(index).evaluate(root => {
        const textOf = (selector: string) => {
          const block = root.querySelector(selector);
          // The innermost element holding the block's words.
          let leaf: Element | null = block;
          while (leaf?.firstElementChild != null) {
            leaf = leaf.firstElementChild;
          }
          if (leaf == null) {
            return null;
          }
          const style = getComputedStyle(leaf);
          return `${style.fontFamily} ${style.fontSize}/${style.lineHeight} | ${style.color}`;
        };
        return {
          paragraph: textOf('p'),
          listItem: textOf('li'),
          quote: textOf('blockquote'),
          cell: textOf('td'),
        };
      });

    const editor = await read(0);
    const view = await read(1);
    expect(editor.paragraph).not.toBeNull();
    // Every block in the view matches the same block in the editor.
    expect(view).toEqual(editor);
    // And it is the body type, not the page's: every block shares the
    // paragraph's family, size, and leading. (A quote's color differs by
    // design.)
    const typeOf = (block: string | null) => block?.split(' | ')[0];
    for (const block of [view.listItem, view.quote, view.cell]) {
      expect(typeOf(block)).toBe(typeOf(view.paragraph));
    }
  });
}
