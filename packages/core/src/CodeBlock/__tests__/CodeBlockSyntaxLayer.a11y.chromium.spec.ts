// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/CodeBlock core/theme

/**
 * @file CodeBlockSyntaxLayer.a11y.chromium.spec.ts
 * @input Storybook story core-codeblock--default, with a page stylesheet that
 *   sets one syntax colour in the astryx-theme layer and one unlayered
 * @output Browser evidence that CodeBlock's injected highlight rules sit in the
 *   astryx-base layer: a theme's syntax colour and an app's syntax colour both
 *   win over the injected defaults
 * @position Cascade-layer proof for CodeBlock's run-time highlight stylesheet
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

const THEME_KEYWORD = 'rgb(1, 2, 3)';
const APP_STRING = 'rgb(4, 5, 6)';

test('a theme layer and unlayered app CSS set the syntax colours over the injected defaults', async ({
  page,
}) => {
  // The page's stylesheet loads before CodeBlock renders, as an app's does.
  // It names the layer order first, as Core's stylesheet does.
  await page.addInitScript(
    ({keyword, string}) => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = [
          '@layer reset, astryx-base, astryx-theme;',
          `@layer astryx-theme { :root { --color-syntax-keyword: ${keyword}; } }`,
          `:root { --color-syntax-string: ${string}; }`,
        ].join('\n');
        document.head.appendChild(style);
      });
    },
    {keyword: THEME_KEYWORD, string: APP_STRING},
  );
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-codeblock--default&viewMode=story`,
  );
  await expect(page.locator('style[data-astryx-highlight-styles]')).toHaveCount(
    1,
  );

  const colours = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      keyword: root.getPropertyValue('--color-syntax-keyword').trim(),
      string: root.getPropertyValue('--color-syntax-string').trim(),
    };
  });
  expect(colours).toEqual({keyword: THEME_KEYWORD, string: APP_STRING});
});
