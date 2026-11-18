// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file home-late-script.spec.ts
 * @input Production docsite home page at a desktop and a phone width, with the
 *   page's own script held until the site shell is live
 * @output Regression proof that a page whose script arrives late hydrates its
 *   server HTML and does not render it again, and that the shell knows the
 *   color mode before the page is live
 * @position Docsite browser tests; jsdom does not hydrate a streamed page
 */

import {expect, test} from '@playwright/test';

// The home page's own script. On a slow connection it arrives after the
// scripts of the site shell.
const HOME_PAGE_SCRIPT =
  /\/_next\/static\/chunks\/app\/(?:\(|%28)site(?:\)|%29)\/page-[^/?]+\.js/;

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the home page keeps its server HTML when its script arrives after the shell is live (${colorScheme} OS)`, async ({
    page,
  }) => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.emulateMedia({colorScheme});
    let releasePageScript = () => {};
    const shellIsLive = new Promise<void>(resolve => {
      releasePageScript = resolve;
    });
    await page.route(HOME_PAGE_SCRIPT, async route => {
      await shellIsLive;
      await route.continue();
    });

    try {
      await page.goto('/', {waitUntil: 'domcontentloaded'});
      // The hero band, an element of the page's server HTML.
      const hero = page.locator('[data-home-page="true"]').first();
      await expect(hero).toBeVisible();
      const serverHero = await hero.elementHandle();

      // The shell is live when its header controls have their tooltips.
      const nav = page.getByRole('navigation', {name: 'Astryx navigation'});
      await expect(nav.locator('[role="tooltip"]').first()).toBeAttached();
      // The shell names the OS color mode without the page.
      await expect(
        nav.getByRole('button', {
          name:
            colorScheme === 'dark'
              ? 'Switch to light mode'
              : 'Switch to dark mode',
        }),
      ).toBeVisible();
      // The page is not live: its theme reel does not advance.
      const reel = page.getByRole('navigation', {
        name: 'Preview Astryx themes',
      });
      await expect(reel.getByRole('radio', {name: 'Page 1'})).toBeChecked();

      releasePageScript();
      // The reel advances on its own once the page is live.
      await expect(reel.getByRole('radio', {name: 'Page 2'})).toBeChecked();

      // A page that React renders again gets new elements. A visitor then
      // loses scroll position and focus, and each frame and image inside
      // loads again.
      const isServerHeroInPage = await serverHero?.evaluate(
        element => element.isConnected,
      );
      expect(isServerHeroInPage).toBe(true);
    } finally {
      releasePageScript();
    }
  });
}

test('the home page keeps its server HTML at a phone width when its script arrives after the shell is live', async ({
  page,
}) => {
  await page.setViewportSize({width: 390, height: 844});
  let releasePageScript = () => {};
  const shellIsLive = new Promise<void>(resolve => {
    releasePageScript = resolve;
  });
  await page.route(HOME_PAGE_SCRIPT, async route => {
    await shellIsLive;
    await route.continue();
  });

  try {
    await page.goto('/', {waitUntil: 'domcontentloaded'});
    const hero = page.locator('[data-home-page="true"]').first();
    await expect(hero).toBeVisible();
    const serverHero = await hero.elementHandle();

    // Below its mobile breakpoint the shell changes layout when it goes live.
    const nav = page.getByRole('navigation', {name: 'Astryx navigation'});
    await expect(nav.locator('[role="tooltip"]').first()).toBeAttached();

    releasePageScript();
    // The reel does not advance on its own at this width. It answers a press
    // once the page is live.
    const secondTheme = page
      .getByRole('navigation', {name: 'Preview Astryx themes'})
      .getByRole('radio', {name: 'Page 2'});
    await expect(async () => {
      await secondTheme.click();
      await expect(secondTheme).toBeChecked({timeout: 1000});
    }).toPass();

    const isServerHeroInPage = await serverHero?.evaluate(
      element => element.isConnected,
    );
    expect(isServerHeroInPage).toBe(true);
  } finally {
    releasePageScript();
  }
});

test('the color mode toggle leaves the OS mode when a visitor uses it before the page is live', async ({
  page,
}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.emulateMedia({colorScheme: 'dark'});
  let releasePageScript = () => {};
  const shellIsLive = new Promise<void>(resolve => {
    releasePageScript = resolve;
  });
  await page.route(HOME_PAGE_SCRIPT, async route => {
    await shellIsLive;
    await route.continue();
  });

  try {
    await page.goto('/', {waitUntil: 'domcontentloaded'});
    const nav = page.getByRole('navigation', {name: 'Astryx navigation'});
    await expect(nav.locator('[role="tooltip"]').first()).toBeAttached();
    await nav.getByRole('button', {name: 'Switch to light mode'}).click();

    releasePageScript();
    await expect(
      nav.getByRole('button', {name: 'Switch to dark mode'}),
    ).toBeVisible();
  } finally {
    releasePageScript();
  }
});
