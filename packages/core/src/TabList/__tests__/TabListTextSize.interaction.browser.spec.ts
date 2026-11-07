// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TabListTextSize.interaction.browser.spec.ts
 * @input The built TabList stories, with Chromium's default font size raised
 *   to 200% and 250% (the setting a browser's text-only zoom changes)
 * @output Real-browser evidence that each tab grows with a larger text size,
 *   so no tab label and no tab strip clips its text
 * @position Browser proof of AST-102 FR4 for TabList, Tab and TabMenu
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
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

/** Sets the browser's default font size, which rem-based text follows. */
async function setDefaultFontSize(page: Page, px: number): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send('Page.setFontSizes', {
    fontSizes: {standard: px, fixed: Math.round((px * 13) / 16)},
  });
}

/** Every element in the TabList that clips its own block overflow. */
async function clippedTabText(page: Page) {
  return page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '.astryx-tab-strip, .astryx-tab, [role="tab"]',
      ),
    ]
      .filter(element => {
        const style = getComputedStyle(element);
        return /hidden|clip/.test(style.overflowY);
      })
      .filter(element => element.scrollHeight > element.clientHeight + 1)
      .map(element => ({
        text: element.innerText.trim().slice(0, 40),
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      })),
  );
}

/** Each tab's label box against the tab's own box. */
async function labelFit(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.astryx-tab')].map(tab => {
      const tabBox = tab.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(tab);
      const textBox = range.getBoundingClientRect();
      return {
        label: tab.innerText.trim(),
        tabTop: tabBox.top,
        tabBottom: tabBox.bottom,
        textTop: textBox.top,
        textBottom: textBox.bottom,
      };
    }),
  );
}

for (const percent of [200, 250]) {
  for (const story of ['default', 'size-variants', 'with-menu']) {
    test(`at ${percent}% text size, tabs grow with their labels: ${story}`, async ({
      page,
    }) => {
      await setDefaultFontSize(page, (16 * percent) / 100);
      await page.goto(
        `${storybook.origin}/iframe.html?id=core-tablist--${story}&viewMode=story`,
      );
      await page.locator('.astryx-tab-strip').first().waitFor();
      expect(await clippedTabText(page)).toEqual([]);
      for (const fit of await labelFit(page)) {
        expect(fit.textTop, fit.label).toBeGreaterThanOrEqual(fit.tabTop - 1);
        expect(fit.textBottom, fit.label).toBeLessThanOrEqual(
          fit.tabBottom + 1,
        );
      }
    });
  }
}
