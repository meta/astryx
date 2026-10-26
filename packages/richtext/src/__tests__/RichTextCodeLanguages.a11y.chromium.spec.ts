// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RichTextCodeLanguages.a11y.chromium.spec.ts
 * @input The built Storybook's "Code language modules" story: one Thrift
 *   fence with `codeLanguages={[thrift]}` and the same fence without it
 * @output CodeBlock FR13 for RichText in a real browser: CodeSyntaxPlugin
 *   paints a listed value and labels with its name; unlisted stays plain
 * @position spec:AST-061 read/edit parity, CodeBlock FR13 evidence
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

/** The keyword-highlighted text inside the element with `testId`. */
async function keywordsIn(page: Page, testId: string) {
  return page.evaluate(id => {
    const root = document.querySelector(`[data-testid="${id}"]`);
    const highlight = CSS.highlights.get('astryx-keyword');
    if (!root || !highlight) {
      return [];
    }
    return Array.from(highlight as unknown as Iterable<Range>)
      .filter(range => root.contains(range.startContainer))
      .map(range => range.toString());
  }, testId);
}

test('RichText code blocks colour and label a listed language value', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=richtext-richtexteditor--code-language-modules&viewMode=story`,
  );
  await expect(page.getByText('struct User {').first()).toBeVisible();
  await expect
    .poll(async () => keywordsIn(page, 'listed'))
    .toEqual(expect.arrayContaining(['struct', 'required', 'string']));
  expect(await keywordsIn(page, 'unlisted')).toEqual([]);
  await expect(
    page.locator('[data-testid="listed"] [data-richtext-code-header]'),
  ).toContainText('thrift');
  // An `objc` fence matched by objectiveC is labelled with the value's name.
  await expect(
    page.locator('[data-testid="listed-renamed"] [data-richtext-code-header]'),
  ).toContainText('objective-c');
});
