// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CodeBlockLanguages.a11y.chromium.spec.ts
 * @input Storybook stories core-codeblock--built-in-languages and
 *   core-codeblock--language-modules
 * @output CodeBlock FR12 and FR13 in a real browser: built-in languages and
 *   language values passed as `language` register syntax highlights over the
 *   right text
 * @position CodeBlock FR12, FR13 browser evidence
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

/** The text each range of the `astryx-<type>` syntax highlight covers. */
async function highlighted(page: Page, type: string) {
  return page.evaluate(name => {
    const highlight = CSS.highlights.get(`astryx-${name}`);
    return highlight
      ? Array.from(highlight as unknown as Iterable<Range>).map(range =>
          range.toString(),
        )
      : [];
  }, type);
}

test('built-in C++, Rust, and SQL colour with no setup', async ({page}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-codeblock--built-in-languages&viewMode=story`,
  );
  await expect(page.locator('pre.astryx-code-block')).toHaveCount(3);
  await expect
    .poll(async () => highlighted(page, 'keyword'))
    .toEqual(expect.arrayContaining(['int', 'return', 'fn', 'SELECT']));
  expect(await highlighted(page, 'comment')).toEqual(
    expect.arrayContaining(['// Sum a vector', '-- Active users this week']),
  );
});

test('Thrift and Java colour when passed as the language', async ({page}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-codeblock--language-modules&viewMode=story`,
  );
  await expect(page.locator('pre.astryx-code-block')).toHaveCount(2);
  await expect
    .poll(async () => highlighted(page, 'keyword'))
    .toEqual(expect.arrayContaining(['struct', 'required', 'public', 'class']));
  expect(await highlighted(page, 'string')).toContain('"hello, "');
});
