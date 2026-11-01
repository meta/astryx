// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @input A production docsite build and exact-origin reachability fixtures
 * @output Browser evidence of unified banner CTAs and page-view-only dismissal
 * @position Docsite integration tests; run against both latest and canary builds
 */

import {expect, test, type Page} from '@playwright/test';

const deployments = [
  {name: 'production', origin: 'https://astryx.atmeta.com'},
  {
    name: 'preview',
    origin:
      'https://astryx-git-feat-docs-internal-network-prompt-fbopensource.vercel.app',
  },
  {name: 'canary', origin: 'https://astryx-canary.vercel.app'},
];
const isCanary = process.env.DOCSITE_TEST_TARGET !== 'latest';
const target = isCanary ? 'canary' : 'latest';
const internalOrigin = 'https://astryx.internalmeta.com';
const probeOrigin = 'https://codebunny.internalmeta.com';
const noticeName = 'Documentation notice';
const dismissName = 'Dismiss documentation notice for this page view';

test.afterEach(async ({page}) => {
  await page.waitForLoadState('networkidle');
});

async function servePublicOrigin(
  page: Page,
  baseURL: string | undefined,
  origin: string,
) {
  if (!baseURL) {
    throw new Error('A local docsite baseURL is required');
  }
  await page.route(`${origin}/**`, async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: `${baseURL}${url.pathname}${url.search}`,
      // A new connection for each proxied request. Playwright's request client
      // keeps idle sockets open with no timeout of its own, and `next start`
      // closes one after six idle seconds: a request sent on it as it closes
      // is reset, and the page it was loading never hydrates.
      headers: {...route.request().headers(), connection: 'close'},
    });
    await route.fulfill({response});
  });
}

async function serveReachability(page: Page, origin: string) {
  let requests = 0;
  const sandboxes: (string | null)[] = [];
  await page.route(`${probeOrigin}/embed/access-check?**`, async route => {
    requests++;
    expect(
      new URL(route.request().url()).searchParams.get('parent_origin'),
    ).toBe(origin);
    // The probe's frame exists while its request waits here: the probe removes
    // it once it has an answer, or when its four-second timeout fires. Reading
    // it now cannot race that timeout.
    const frame = await route.request().frame().frameElement();
    sandboxes.push(await frame.getAttribute('sandbox'));
    await frame.dispose();
    await route.fulfill({
      contentType: 'text/html; charset=utf-8',
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Security-Policy': `frame-ancestors ${origin}`,
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      },
      body: `<!doctype html><html><body><script>window.parent.postMessage({type:'codebunny:access-check:v1',reachable:true},${JSON.stringify(origin)});</script></body></html>`,
    });
  });
  return {requests: () => requests, sandboxes: () => [...sandboxes]};
}

for (const {name, origin} of deployments) {
  for (const width of [1440, 390]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      test(`${target} ${name}: one info banner at ${width}px in ${colorScheme}`, async ({
        page,
        baseURL,
      }, testInfo) => {
        await page.setViewportSize({width, height: 900});
        await page.emulateMedia({colorScheme});
        await servePublicOrigin(page, baseURL, origin);
        const probe = await serveReachability(page, origin);
        const documentResponse = await page.goto(
          `${origin}/docs/getting-started?source=test`,
          {
            waitUntil: 'domcontentloaded',
          },
        );
        if (!documentResponse) {
          throw new Error('The documentation response is required');
        }
        expect(await documentResponse.text()).not.toMatch(
          /Meta internal|Meta-specific components/,
        );
        const heading = page.getByRole('heading', {
          name: 'Getting Started',
          exact: true,
        });
        await expect(heading).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const notice = page.getByRole('region', {name: noticeName});
        const internal = notice.getByRole('link', {
          name: 'Meta internal docs',
          exact: true,
        });
        const production = notice.getByRole('link', {
          name: 'View production',
          exact: true,
        });
        // The probe answers at once, so this case checks the reachable banner.
        // The banner a page shows until reachability is known is the same one a
        // failed probe leaves, checked by the failed-reachability case.
        await expect(notice).toHaveCount(1);
        await expect(notice).toContainText('Working on Meta internal tools?');
        expect(probe.sandboxes()).toEqual(['allow-scripts allow-same-origin']);
        await expect(notice).not.toContainText("You're viewing Canary docs");
        if (isCanary) {
          await expect(notice).toContainText(
            'These docs may include unreleased components and props. View production docs for the latest stable release.',
          );
        } else {
          await expect(notice).not.toContainText('Canary');
        }
        await expect(notice).toContainText(
          'Meta-specific components and guidance',
        );
        await expect(internal).toBeVisible();
        await expect(internal).toHaveAttribute(
          'href',
          `${internalOrigin}/docs/getting-started?source=test`,
        );
        expect(await internal.getAttribute('target')).toBeNull();
        await expect(internal).not.toContainText('opens in');
        await expect(production).toHaveCount(isCanary ? 1 : 0);
        await expect(notice.getByRole('link')).toHaveCount(isCanary ? 2 : 1);
        await expect(page.locator('[data-status="warning"]')).toHaveCount(0);
        await expect(notice.locator('[data-status="info"]')).toHaveCount(2);
        await expect(page.getByRole('banner')).toHaveCount(1);
        await expect(
          page.getByRole('banner').getByRole('complementary'),
        ).toHaveCount(0);
        const box = await notice.boundingBox();
        if (!box) {
          throw new Error('The info banner must have a visible box');
        }
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(box.width).toBeGreaterThan(width * 0.9);
        expect(box.y).toBeLessThan(1);
        await expect(notice).not.toHaveCSS('position', 'fixed');
        await expect(
          page.locator(
            'iframe[title="Astryx documentation reachability check"]',
          ),
        ).toHaveCount(0);
        expect(probe.requests()).toBe(1);
        await page.keyboard.press('Tab');
        await expect(
          page.getByRole('link', {name: 'Skip to content', exact: true}),
        ).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(internal).toBeFocused();
        await page.screenshot({
          path: testInfo.outputPath(
            `docs-banner-focus-${target}-${name}-${width}-${colorScheme}.png`,
          ),
        });
        if (isCanary) {
          await page.keyboard.press('Tab');
          await expect(production).toBeFocused();
        }
        await page.keyboard.press('Tab');
        const dismiss = notice.getByRole('button', {name: dismissName});
        await expect(dismiss).toBeFocused();
        await heading.click();
        await expect(page.getByRole('tooltip')).toHaveCount(0);
        await page.screenshot({
          path: testInfo.outputPath(
            `docs-banner-${target}-${name}-${width}-${colorScheme}.png`,
          ),
        });
        const storageBefore = await page.evaluate(() => ({
          session: {...sessionStorage},
          local: {...localStorage},
          cookie: document.cookie,
        }));
        await dismiss.click();
        await expect(notice).toHaveCount(0);
        expect(
          await page.evaluate(() => ({
            session: {...sessionStorage},
            local: {...localStorage},
            cookie: document.cookie,
          })),
        ).toEqual(storageBefore);
        await page.evaluate(() =>
          window.history.pushState(null, '', '?source=after-dismiss'),
        );
        await expect(notice).toHaveCount(1);
        await expect(internal).toHaveAttribute(
          'href',
          `${internalOrigin}/docs/getting-started?source=after-dismiss`,
        );
        if (isCanary) {
          await expect(production).toHaveAttribute(
            'href',
            'https://astryx.atmeta.com/docs/getting-started?source=after-dismiss',
          );
        }
        expect(probe.requests()).toBe(1);
        await dismiss.click();
        await page.reload();
        await expect(heading).toBeVisible();
        await expect(internal).toBeVisible();
        expect(probe.requests()).toBe(2);
        await page.route(`${internalOrigin}/**`, route =>
          route.fulfill({
            contentType: 'text/html',
            body: '<h1>Internal destination fixture</h1>',
          }),
        );
        await internal.click();
        await expect(page).toHaveURL(
          `${internalOrigin}/docs/getting-started?source=after-dismiss`,
        );
        await expect(
          page.getByRole('heading', {name: 'Internal destination fixture'}),
        ).toBeVisible();
        expect(page.context().pages()).toHaveLength(1);
      });
    }
  }
}

for (const width of [1440, 390]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`${target}: failed reachability exposes no internal wording at ${width}px in ${colorScheme}`, async ({
      page,
      baseURL,
    }, testInfo) => {
      await page.setViewportSize({width, height: 900});
      await page.emulateMedia({colorScheme});
      const origin = deployments[0].origin;
      await servePublicOrigin(page, baseURL, origin);
      await page.route(`${probeOrigin}/**`, route => route.abort());
      await page.goto(`${origin}/docs/getting-started?source=test`);
      await expect(
        page.getByRole('heading', {name: 'Getting Started', exact: true}),
      ).toBeVisible();
      await expect(
        page.locator('iframe[title="Astryx documentation reachability check"]'),
      ).toHaveCount(0, {timeout: 10_000});
      const notice = page.getByRole('region', {name: noticeName});
      await expect(notice).toHaveCount(isCanary ? 1 : 0);
      await expect(
        page.getByRole('link', {
          name: 'Meta internal docs',
          exact: true,
        }),
      ).toHaveCount(0);
      if (isCanary) {
        // The banner a page shows until reachability is known, too.
        await expect(notice).toContainText("You're viewing Canary docs");
        await expect(notice).toContainText(
          'These docs may include unreleased components and props. View production docs for the latest stable release.',
        );
        await expect(notice.locator('[data-status="warning"]')).toHaveCount(2);
        await expect(notice).not.toContainText(
          /Meta internal|Meta-specific components/,
        );
        expect(await notice.evaluate(element => element.outerHTML)).not.toMatch(
          /Meta internal|Meta-specific components/,
        );
        const production = notice.getByRole('link', {
          name: 'View production',
          exact: true,
        });
        await expect(production).toBeVisible();
        await expect(production).toHaveAttribute(
          'href',
          'https://astryx.atmeta.com/docs/getting-started?source=test',
        );
      }
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: testInfo.outputPath(
          `docs-banner-${target}-no-internal-access-${width}-${colorScheme}.png`,
        ),
      });
    });
  }
}
