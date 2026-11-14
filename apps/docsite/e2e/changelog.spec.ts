// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file changelog.spec.ts
 * @input Production docsite changelog routes
 * @output Proof that a changelog page holds one page of a package's releases,
 *   hydrates its server HTML, and that the package tabs, the page links (with
 *   and without the page's scripts) and old links that name the package in
 *   the query reach the other pages
 * @position Docsite browser tests; the Vitest suite does not route, hydrate
 *   or redirect
 */

import {expect, test, type Page} from '@playwright/test';

const RELEASES_PER_PAGE = 5;

function releaseHeadings(page: Page) {
  return page
    .locator('#astryx-app-shell-main')
    .getByRole('heading', {level: 2, name: /^\d+\.\d+\.\d+/});
}

function pageNavigation(page: Page) {
  return page.getByRole('navigation', {name: 'Older and newer releases'});
}

test('/changelog holds the newest releases and keeps its server HTML when it hydrates', async ({
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
    await page.goto('/changelog', {waitUntil: 'domcontentloaded'});
    await expect(releaseHeadings(page)).toHaveCount(RELEASES_PER_PAGE);
    const serverRelease = await releaseHeadings(page).first().elementHandle();

    resumeHydration();
    // The release notes are live when their page navigation has its tooltips.
    await expect(
      pageNavigation(page).locator('[role="tooltip"]').first(),
    ).toBeAttached();

    // A page that React renders again gets new elements: the browser then
    // builds the whole page of release notes twice.
    const isServerReleaseInPage = await serverRelease?.evaluate(
      element => element.isConnected,
    );
    expect(isServerReleaseInPage).toBe(true);
    expect(pageErrors).toEqual([]);
  } finally {
    resumeHydration();
  }
});

test('the page links open the older releases of the package and add no history entry', async ({
  page,
}) => {
  await page.goto('/docs/getting-started');
  await page.goto('/changelog');
  const newest = await releaseHeadings(page).allTextContents();
  await expect(
    pageNavigation(page).getByRole('link', {name: 'Go to page 2', exact: true}),
  ).toHaveAttribute('href', '/changelog/core/2');

  await pageNavigation(page)
    .getByRole('link', {name: 'Go to next page', exact: true})
    .click();
  await expect(page).toHaveURL(/\/changelog\/core\/2$/);
  await expect(releaseHeadings(page)).toHaveCount(RELEASES_PER_PAGE);
  const older = await releaseHeadings(page).allTextContents();
  expect(older.filter(release => newest.includes(release))).toEqual([]);
  // The reader starts the new page at its top.
  await expect(releaseHeadings(page).first()).toBeInViewport();

  await expect(
    pageNavigation(page).getByRole('link', {name: 'Go to page 2', exact: true}),
  ).toHaveAttribute('aria-current', 'page');

  await pageNavigation(page)
    .getByRole('link', {name: 'Go to page 1', exact: true})
    .click();
  await expect(page).toHaveURL(/\/changelog$/);
  await expect(releaseHeadings(page).first()).toHaveText(newest[0] ?? '');

  // The page number is view state of the changelog: Back leaves the changelog.
  await page.goBack();
  await expect(page).toHaveURL(/\/docs\/getting-started$/);
});

test("a page link opens the older releases before the page's scripts arrive", async ({
  page,
}) => {
  let releaseScripts = () => {};
  const scripts = new Promise<void>(resolve => {
    releaseScripts = resolve;
  });
  await page.route('**/_next/**/*.js*', async route => {
    await scripts;
    await route.continue();
  });

  try {
    await page.goto('/changelog', {waitUntil: 'domcontentloaded'});
    await pageNavigation(page)
      .getByRole('link', {name: 'Go to page 2', exact: true})
      .click();
    await expect(page).toHaveURL(/\/changelog\/core\/2$/);
    await expect(releaseHeadings(page)).toHaveCount(RELEASES_PER_PAGE);
  } finally {
    releaseScripts();
  }
});

test("the default package's own path is an alias of /changelog", async ({
  page,
}) => {
  await page.goto('/changelog/core');
  await expect(page).toHaveURL(/\/changelog$/);
  await expect(releaseHeadings(page)).toHaveCount(RELEASES_PER_PAGE);
});

test('a package tab opens that package, keeps focus, and adds no history entry', async ({
  page,
}) => {
  await page.goto('/docs/getting-started');
  await page.goto('/changelog/core/2');
  const main = page.locator('#astryx-app-shell-main');
  const cliTab = main.getByRole('link', {name: '@astryxdesign/cli'});

  await cliTab.click();
  await expect(page).toHaveURL(/\/changelog\/cli$/);
  await expect(cliTab).toHaveAttribute('aria-current', 'true');
  await expect(cliTab).toBeFocused();
  await expect(releaseHeadings(page).first()).toBeVisible();

  // The docs sidebar keeps What's New selected on every changelog page.
  await expect(
    page.getByRole('link', {name: "What's New", exact: true}).first(),
  ).toHaveAttribute('aria-current', 'page');

  await main.getByRole('link', {name: '@astryxdesign/core'}).click();
  await expect(page).toHaveURL(/\/changelog$/);

  // A tab is view state of the changelog: Back leaves the changelog.
  await page.goBack();
  await expect(page).toHaveURL(/\/docs\/getting-started$/);
});

test('an old link that names the package in the query opens that package', async ({
  page,
}) => {
  await page.goto('/changelog?package=%40astryxdesign%2Fcli');
  await expect(page).toHaveURL(/\/changelog\/cli(\?|$)/);
  await expect(
    page
      .locator('#astryx-app-shell-main')
      .getByRole('link', {name: '@astryxdesign/cli'}),
  ).toHaveAttribute('aria-current', 'true');

  // A theme package has no changelog page: the link shows the default one.
  await page.goto('/changelog?package=%40astryxdesign%2Ftheme-neutral');
  await expect(page).toHaveURL(/\/changelog\?package=/);
  await expect(releaseHeadings(page)).toHaveCount(RELEASES_PER_PAGE);
});

test('a changelog URL that names no page is not found', async ({page}) => {
  for (const path of ['/changelog/no-such-package', '/changelog/core/9999']) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
});
