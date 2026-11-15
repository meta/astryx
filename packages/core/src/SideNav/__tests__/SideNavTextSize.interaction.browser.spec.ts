// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SideNavTextSize.interaction.browser.spec.ts
 * @input The built SideNav stories, with Chromium's default font size raised
 *   to 200% and 250% (the setting a browser's text-only zoom changes)
 * @output Real-browser evidence that each expanded row grows with a larger
 *   text size, so no row's label or end content leaves the row or overlaps
 *   the next row
 * @position Browser proof of AST-102 FR4 for SideNavItem
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

test.skip(
  ({browserName}) => browserName !== 'chromium',
  'Page.setFontSizes is a Chromium DevTools command',
);

/** Sets the browser's default font size, which rem-based text follows. */
async function setDefaultFontSize(page: Page, px: number): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send('Page.setFontSizes', {
    fontSizes: {standard: px, fixed: Math.round((px * 13) / 16)},
  });
}

/**
 * Each row's own box, and the union of its visible content boxes (label
 * text and end content). A content box outside its row overlaps a
 * neighboring row.
 */
async function rowFit(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.astryx-side-nav-item')]
      .filter(row => row.getBoundingClientRect().height > 0)
      .map(row => {
        const rowBox = row.getBoundingClientRect();
        let top = Infinity;
        let bottom = -Infinity;
        for (const element of row.querySelectorAll<HTMLElement>('*')) {
          const box = element.getBoundingClientRect();
          if (box.height === 0 || element.closest('[role="menu"]') != null) {
            continue;
          }
          top = Math.min(top, box.top);
          bottom = Math.max(bottom, box.bottom);
        }
        return {
          label: row.innerText.trim().split('\n')[0],
          rowTop: rowBox.top,
          rowBottom: rowBox.bottom,
          contentTop: top,
          contentBottom: bottom,
        };
      }),
  );
}

for (const percent of [200, 250]) {
  for (const story of ['default', 'end-content']) {
    test(`at ${percent}% text size, rows grow with their content: ${story}`, async ({
      page,
    }) => {
      await setDefaultFontSize(page, (16 * percent) / 100);
      await page.goto(
        `${storybook.origin}/iframe.html?id=core-sidenav--${story}&viewMode=story`,
      );
      await page.locator('.astryx-side-nav-item').first().waitFor();
      const rows = await rowFit(page);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.contentTop, row.label).toBeGreaterThanOrEqual(
          row.rowTop - 1,
        );
        expect(row.contentBottom, row.label).toBeLessThanOrEqual(
          row.rowBottom + 1,
        );
      }
    });
  }
}
