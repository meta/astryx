// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file mobile-nav-component-search.spec.ts
 * @input Production docsite at phone widths, under a touch pointer
 * @output Regression proof that the drawer's component search lists only the
 *   components that match, and opens the one a reader picks
 * @position Docsite browser tests; the modal drawer and its touch entrance
 *   hold exist only in a browser
 */

import {expect, test} from '@playwright/test';

const phones = [
  {width: 390, height: 844, pick: 'the keyboard'},
  {width: 320, height: 568, pick: 'a tap'},
] as const;

for (const {width, height, pick} of phones) {
  test.describe(`at ${width}px`, () => {
    test.use({viewport: {width, height}, hasTouch: true, isMobile: true});

    test(`the drawer's component search lists only matches and opens one picked with ${pick}`, async ({
      page,
    }) => {
      await page.goto('/components');
      await page
        .getByRole('navigation', {name: 'Astryx navigation'})
        .getByTestId('mobile-nav-toggle')
        .tap();
      const drawer = page.getByRole('dialog');
      const search = drawer.getByRole('textbox', {name: 'Search components'});
      const clear = drawer.getByRole('button', {
        name: 'Clear Search components',
      });
      // A component row links below /components. The drawer's own Components
      // link does not.
      const rows = drawer.locator('a[href^="/components/"]');
      const rowLinks = () =>
        rows.evaluateAll(links => links.map(link => link.getAttribute('href')));

      await search.tap();
      await expect(search).toBeFocused();
      const tree = await rowLinks();
      expect(tree.length).toBeGreaterThan(0);

      await search.pressSequentially('zzzz');
      await expect(rows).toHaveCount(0);

      await clear.tap();
      await expect(
        drawer.getByRole('link', {name: 'Overview', exact: true}),
      ).toBeVisible();
      expect(await rowLinks()).toEqual(tree);

      await search.pressSequentially('tooltip');
      await expect(rows.first()).toBeVisible();
      await expect
        .poll(async () =>
          (await rows.allTextContents()).filter(
            name => !name.toLowerCase().includes('tooltip'),
          ),
        )
        .toEqual([]);

      const first = rows.first();
      const href = (await first.getAttribute('href')) ?? '';
      expect(href).toMatch(/^\/components\//);
      if (pick === 'the keyboard') {
        await first.press('Enter');
      } else {
        await first.tap();
      }
      await expect(page).toHaveURL(href);
      await expect(drawer).toBeHidden();
    });
  });
}
