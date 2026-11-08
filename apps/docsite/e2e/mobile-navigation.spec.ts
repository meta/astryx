// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file mobile-navigation.spec.ts
 * @input Production docsite HTML/CSS, with hydration held then released
 * @output Regression proof for initial navigation and its hydration handoff
 * @position Docsite browser tests; jsdom cannot measure icons or sticky occlusion
 */

import {expect, test} from '@playwright/test';

test('the mobile hamburger survives hydration without changing icon size or drawer ownership', async ({
  page,
}) => {
  await page.setViewportSize({width: 390, height: 844});
  let resumeHydration = () => {};
  const hydration = new Promise<void>(resolve => {
    resumeHydration = resolve;
  });
  await page.route('**/_next/**/*.js*', async route => {
    await hydration;
    await route.continue();
  });

  try {
    await page.goto('/components', {waitUntil: 'commit'});
    // First paint waits for the real render-blocking CSS, not for hydration.
    await page.waitForFunction(
      () => performance.getEntriesByName('first-contentful-paint').length > 0,
    );
    const nav = page.getByRole('navigation', {name: 'Astryx navigation'});
    const toggle = nav.getByRole('button', {name: 'Open navigation'});
    await expect(toggle).toHaveCount(1);
    await expect(toggle.locator('svg')).toBeVisible();
    const initialSize = await toggle.locator('svg').evaluate(svg => {
      const {width, height} = svg.getBoundingClientRect();
      return {width, height};
    });

    resumeHydration();
    // Wait for AppShell's automatic toggle on this same document.
    await expect(nav.getByTestId('mobile-nav-toggle')).toBeVisible();
    await expect(toggle).toHaveCount(1);
    await expect(toggle.locator('svg')).toBeVisible();
    const hydratedSize = await toggle.locator('svg').evaluate(svg => {
      const {width, height} = svg.getBoundingClientRect();
      return {width, height};
    });
    expect(initialSize).toEqual(hydratedSize);

    await toggle.click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toHaveCount(1);
    await expect(
      drawer.getByRole('link', {name: 'Docs', exact: true}),
    ).toBeVisible();
    await expect(
      drawer.getByRole('textbox', {name: 'Search components'}),
    ).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
  } finally {
    resumeHydration();
  }
});

test('desktop search stays exposed across hydration at exactly 768px', async ({
  page,
}) => {
  await page.setViewportSize({width: 768, height: 844});
  let resumeHydration = () => {};
  const hydration = new Promise<void>(resolve => {
    resumeHydration = resolve;
  });
  await page.route('**/_next/**/*.js*', async route => {
    await hydration;
    await route.continue();
  });

  try {
    await page.goto('/components', {waitUntil: 'commit'});
    await page.waitForFunction(
      () => performance.getEntriesByName('first-contentful-paint').length > 0,
    );
    const nav = page.getByRole('navigation', {name: 'Astryx navigation'});
    await expect(
      nav.getByRole('button', {name: 'Open navigation'}),
    ).toBeHidden();
    await expect(
      nav.getByRole('link', {name: 'Components', exact: true}),
    ).toBeVisible();
    const search = page.getByRole('textbox', {name: 'Search components'});
    await expect(search).toBeVisible();
    // With no pending fonts, fonts.ready can wait for the held scripts' load
    // event even though geometry is settled (for example with offline fonts).
    await page.evaluate(async () => {
      if (document.fonts.status === 'loading') {
        await document.fonts.ready;
      }
    });

    // A reload can restore scroll before hydration. Visibility alone misses
    // the real input being painted underneath the sticky header.
    await page.evaluate(() => window.scrollTo(0, 700));
    const isSearchExposed = () =>
      search.evaluate(input => {
        const box = input.getBoundingClientRect();
        return (
          document.elementFromPoint(
            box.x + box.width / 2,
            box.y + box.height / 2,
          ) === input
        );
      });
    await expect.poll(isSearchExposed).toBe(true);
    const initialBox = await search.evaluate(input => {
      const {x, y, width, height} = input.getBoundingClientRect();
      return {x, y, width, height};
    });
    const headerBottom = await nav.evaluate(
      element => element.getBoundingClientRect().bottom,
    );
    expect(initialBox.width).toBeGreaterThan(0);
    expect(initialBox.height).toBeGreaterThan(0);
    expect(initialBox.y).toBeGreaterThanOrEqual(headerBottom);
    expect(initialBox.y + initialBox.height).toBeLessThan(844);

    resumeHydration();
    // Only the existing layout effect writes this inline value; the bootstrap
    // writes a stylesheet, so this proves the header has hydrated.
    await page.waitForFunction(
      () =>
        document.documentElement.style.getPropertyValue(
          '--appshell-header-height',
        ) !== '',
    );
    expect(await search.boundingBox()).toEqual(initialBox);

    const banner = page.getByRole('region', {name: 'Documentation notice'});
    if (await banner.count()) {
      await banner.getByRole('button', {name: /^Dismiss/}).click();
      await expect(banner).toHaveCount(0);
      await expect.poll(isSearchExposed).toBe(true);
    }
  } finally {
    resumeHydration();
  }
});
