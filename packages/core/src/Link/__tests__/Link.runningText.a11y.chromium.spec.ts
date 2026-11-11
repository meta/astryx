// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Link/|packages/core/src/Text/Text\.tsx|packages/core/src/Text/runningTextContext\.ts|packages/core/src/Markdown/Markdown\.tsx|apps/storybook/stories/Link\.stories)

/**
 * @file Link.runningText.a11y.chromium.spec.ts
 * @input The built `InRunningText` Link story in real Chromium, per theme and
 *   color mode
 * @output Evidence that a Link in running text is underlined at rest in every
 *   checked theme, and that a standalone Link is not
 * @position Real-engine proof for component:Link FR7 and component:Markdown
 *   FR31; jsdom does not resolve theme CSS or computed text decoration
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

// `none` is the stock theme: the base tokens with no theme applied.
const themes = [
  {name: 'Stock', key: 'none'},
  {name: 'Neutral', key: 'neutral'},
  {name: 'Gothic', key: 'gothic'},
  {name: 'Matcha', key: 'matcha'},
] as const;

for (const theme of themes) {
  for (const mode of ['light', 'dark'] as const) {
    test(`${theme.name} ${mode}: a Link in running text is underlined at rest, a standalone Link is not`, async ({
      page,
    }) => {
      await page.goto(
        `${storybook.origin}/iframe.html?id=core-link--in-running-text&viewMode=story&globals=colorMode:${mode};astryxTheme:${theme.key}`,
      );
      const paragraphLink = page.getByTestId('running-text-link');
      const standaloneLink = page.getByTestId('standalone-link');
      const markdownLink = page
        .getByTestId('running-text-markdown')
        .locator('a');
      await expect(paragraphLink).toBeVisible();
      await expect(markdownLink).toBeVisible();
      // The pointer rests away from every link, so no hover underline shows.
      await page.mouse.move(0, 0);

      const restingLine = (el: Element) =>
        getComputedStyle(el).textDecorationLine;
      expect(await paragraphLink.evaluate(restingLine)).toBe('underline');
      expect(await markdownLink.evaluate(restingLine)).toBe('underline');
      expect(await standaloneLink.evaluate(restingLine)).toBe('none');
    });
  }
}
