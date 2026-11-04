// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file MarkdownNesting.a11y.chromium.spec.ts
 * @input Uses the Core/Markdown Default story, given deeply nested input
 *   through its `children` arg
 * @output Real-Chromium evidence that lists and blockquotes nested thousands
 *   of levels deep render without an error, nested at most 100 deep
 * @position Browser evidence for Markdown's block nesting cap
 */

import {expect, test, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORYBOOK_DIR = process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR;
const STORY = 'core-markdown--default';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(STORYBOOK_DIR);
});

test.afterAll(async () => {
  await storybook?.close();
});

/** Opens the story and renders `markdown` in it; returns the page errors. */
async function renderMarkdown(page: Page, markdown: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('404')) {
      errors.push(message.text());
    }
  });
  await page.goto(
    `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story&globals=astryxTheme:neutral;colorMode:light;direction:ltr`,
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
    {storyId: STORY, children: markdown},
  );
  return errors;
}

/** How deep lists and blockquotes nest in the rendered story. */
async function renderedDepth(page: Page): Promise<number> {
  return page.locator('#storybook-root').evaluate(root => {
    let deepest = 0;
    const stack: {element: Element; depth: number}[] = [
      {element: root, depth: 0},
    ];
    while (stack.length > 0) {
      const {element, depth} = stack.pop() as {element: Element; depth: number};
      const next = ['UL', 'OL', 'BLOCKQUOTE'].includes(element.tagName)
        ? depth + 1
        : depth;
      deepest = Math.max(deepest, next);
      for (const child of element.children) {
        stack.push({element: child, depth: next});
      }
    }
    return deepest;
  });
}

test.describe('Markdown renders deeply nested input', () => {
  for (const [name, markdown] of [
    ['a list 10,000 deep', `${'- '.repeat(10_000)}deepest`],
    ['a blockquote 10,000 deep', `${'> '.repeat(10_000)}deepest`],
    [
      'lists and blockquotes 10,000 deep',
      `${Array.from({length: 10_000}, (_, level) => (level % 2 === 0 ? '> ' : '- ')).join('')}deepest`,
    ],
  ] as const) {
    test(`${name}, nested at most 100 deep, with no error`, async ({page}) => {
      const errors = await renderMarkdown(page, markdown);
      await expect(page.locator('#storybook-root')).toContainText('deepest');
      const depth = await renderedDepth(page);
      expect(depth).toBeGreaterThan(50);
      expect(depth).toBeLessThanOrEqual(100);
      expect(errors).toEqual([]);
    });
  }
});
