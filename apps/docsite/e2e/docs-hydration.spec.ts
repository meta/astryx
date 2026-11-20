// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file docs-hydration.spec.ts
 * @input Production docsite docs pages whose guidance rows link component
 *   names, with hydration held then released
 * @output Regression proof that each page hydrates its server HTML and does
 *   not render it again
 * @position Docsite browser tests; the Vitest suite reads server markup and
 *   does not hydrate a page
 */

import {expect, test} from '@playwright/test';

for (const topic of [
  'elevation',
  'layout',
  'principles',
  'styling-libraries',
  'typography',
]) {
  test(`/docs/${topic} keeps its server HTML when it hydrates`, async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    let resumeHydration = () => {};
    const hydration = new Promise<void>(resolve => {
      resumeHydration = resolve;
    });
    await page.route('**/_next/**/*.js*', async route => {
      await hydration;
      await route.continue();
    });

    try {
      await page.goto(`/docs/${topic}`, {waitUntil: 'domcontentloaded'});
      const main = page.locator('#astryx-app-shell-main');
      // The title, an element of the article's server HTML.
      const title = main.getByRole('heading', {level: 1});
      await expect(title).toBeVisible();
      const serverTitle = await title.elementHandle();

      resumeHydration();
      // The article is live when its heading controls have their tooltips.
      await expect(
        main.locator('[role="tooltip"]', {hasText: 'Copy link'}).first(),
      ).toBeAttached();

      // A page that React renders again gets new elements. A visitor then
      // loses scroll position and focus.
      const isServerTitleInPage = await serverTitle?.evaluate(
        element => element.isConnected,
      );
      expect(isServerTitleInPage).toBe(true);
      expect(pageErrors).toEqual([]);
    } finally {
      resumeHydration();
    }
  });
}
