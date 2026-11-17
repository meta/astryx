// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/Markdown core/List ^apps/storybook/stories/Markdown

/**
 * @file MarkdownListBounds.a11y.chromium.spec.ts
 * @input Uses the Core/Markdown Default story, given a paragraph followed by
 *   unordered, ordered, and nested lists through its `children` arg
 * @output Real-Chromium evidence that each Markdown list stays inside the
 *   column its paragraphs fill, so a list never widens a phone-width page
 * @position Browser evidence for Markdown's list geometry; listEdge.test.tsx
 *   pins the row edge in jsdom
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORYBOOK_DIR = process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR;
const STORY = 'core-markdown--default';

const MARKDOWN = [
  'A paragraph long enough to fill its column from one edge to the other on a phone screen.',
  '',
  '- Population: 13.96 million (city proper)',
  '- Metro area: 37.4 million',
  '  1. A nested numbered item',
  '  2. Another nested numbered item',
  '',
  '1. First numbered item',
  '2. Second numbered item',
].join('\n');

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(STORYBOOK_DIR);
});

test.afterAll(async () => {
  await storybook?.close();
});

async function renderMarkdown(page: Page, dir: 'ltr' | 'rtl'): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story&globals=astryxTheme:neutral;colorMode:light;direction:${dir}`,
    {waitUntil: 'load'},
  );
  await expect(page.locator('#storybook-root')).not.toBeEmpty();
  await page.evaluate(
    ({storyId, children}) => {
      const channel = (
        window as Window & {
          __STORYBOOK_ADDONS_CHANNEL__?: {
            emit(event: string, payload: unknown): void;
          };
        }
      ).__STORYBOOK_ADDONS_CHANNEL__;
      channel?.emit('updateStoryArgs', {storyId, updatedArgs: {children}});
    },
    {storyId: STORY, children: MARKDOWN},
  );
  await expect(
    page.locator('#storybook-root ol ol, #storybook-root ul ol'),
  ).toHaveCount(1);
}

for (const dir of ['ltr', 'rtl'] as const) {
  test(`lists stay inside the paragraph column at 390px (${dir})`, async ({
    page,
  }) => {
    await page.setViewportSize({width: 390, height: 800});
    await renderMarkdown(page, dir);
    const geometry = await page.locator('#storybook-root').evaluate(root => {
      // The paragraph's block box is the column the lists share.
      const text = [...root.querySelectorAll('*')].find(
        element =>
          element.children.length === 0 &&
          element.textContent?.startsWith('A paragraph long enough'),
      );
      let paragraph = text ?? null;
      while (
        paragraph != null &&
        getComputedStyle(paragraph).display.startsWith('inline')
      ) {
        paragraph = paragraph.parentElement;
      }
      if (paragraph == null) {
        throw new Error('The story rendered no paragraph');
      }
      const column = paragraph.getBoundingClientRect();
      const lists = [...root.querySelectorAll('ul, ol')]
        .filter(list => list.parentElement?.closest('ul, ol') == null)
        .map(list => {
          const box = list.getBoundingClientRect();
          return {left: box.left, right: box.right};
        });
      return {
        column: {left: column.left, right: column.right},
        lists,
        pageWidth: document.documentElement.scrollWidth,
      };
    });
    expect(geometry.lists.length).toBe(2);
    for (const list of geometry.lists) {
      expect(list.left).toBeGreaterThanOrEqual(geometry.column.left - 0.5);
      expect(list.right).toBeLessThanOrEqual(geometry.column.right + 0.5);
    }
    expect(geometry.pageWidth).toBeLessThanOrEqual(390);
  });
}
