// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @input A production docsite build configured with the docs and probe origins,
 *   and exact-origin reachability fixtures
 * @output Browser evidence of unified banner CTAs and page-view-only dismissal
 * @position Docsite integration tests; run against both latest and canary builds
 */

import {expect, test, type Page, type Route} from '@playwright/test';

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
// The build under test must be configured with these origins (CI builds with
// placeholder values); the probe and the destination are both routed below.
const internalOrigin = process.env.NEXT_PUBLIC_INTERNAL_DOCS_ORIGIN ?? '';
const probeOrigin = process.env.NEXT_PUBLIC_DOCS_ACCESS_CHECK_ORIGIN ?? '';
const isConfigured = internalOrigin !== '' && probeOrigin !== '';
const noticeName = 'Documentation notice';
const dismissName = 'Dismiss documentation notice for this page view';

// CI must always run these contracts; a local build without the origins
// disables the prompt, so there is nothing to check.
if (!isConfigured && (process.env.CI ?? '') !== '') {
  throw new Error(
    'Set NEXT_PUBLIC_INTERNAL_DOCS_ORIGIN and NEXT_PUBLIC_DOCS_ACCESS_CHECK_ORIGIN for both the docsite build and this run',
  );
}
test.skip(
  !isConfigured,
  'Build and run with NEXT_PUBLIC_INTERNAL_DOCS_ORIGIN and NEXT_PUBLIC_DOCS_ACCESS_CHECK_ORIGIN set',
);

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
  // The page reads each probe frame's sandbox as the frame is inserted. The
  // probe sets it before it inserts the frame.
  await page.addInitScript(() => {
    const sandboxes: (string | null)[] = [];
    Object.assign(window, {probeSandboxes: sandboxes});
    new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (
            node instanceof HTMLIFrameElement &&
            node.title === 'Astryx documentation reachability check'
          ) {
            sandboxes.push(node.getAttribute('sandbox'));
          }
        }
      }
    }).observe(document, {childList: true, subtree: true});
  });
  await page.route(`${probeOrigin}/embed/access-check?**`, async route => {
    requests++;
    expect(
      new URL(route.request().url()).searchParams.get('parent_origin'),
    ).toBe(origin);
    // The probe gives up four seconds after it inserts its frame. Answer at
    // once: a call back into a busy page before the answer spends that time.
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
  return {
    requests: () => requests,
    sandboxes: () =>
      page.evaluate(() => [
        ...(window as unknown as {probeSandboxes: (string | null)[]})
          .probeSandboxes,
      ]),
  };
}

// Past the probe's four-second deadline.
const PAST_DEADLINE_MS = 5000;

/**
 * Holds the page's clock still from now on: no timer fires until the test
 * advances the clock or resumes it.
 */
async function holdClock(page: Page) {
  await page.clock.install();
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 1000);
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
        // The probe gives up four seconds after it inserts its frame. The
        // page's clock holds still until the answer is in, so a slow page
        // cannot reach that deadline first.
        await holdClock(page);
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
        // Past the deadline, the answer still stands.
        await page.clock.runFor(PAST_DEADLINE_MS);
        await expect(notice).toContainText('Working on Meta internal tools?');
        await page.clock.resume();
        expect(await probe.sandboxes()).toEqual([
          'allow-scripts allow-same-origin',
        ]);
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
        await holdClock(page);
        await page.reload();
        await expect(heading).toBeVisible();
        await expect(internal).toBeVisible();
        await page.clock.runFor(PAST_DEADLINE_MS);
        await expect(internal).toBeVisible();
        await page.clock.resume();
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

test(`${target}: a probe with no answer by its deadline exposes no internal wording`, async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({width: 1440, height: 900});
  const origin = deployments[0].origin;
  await servePublicOrigin(page, baseURL, origin);
  // The probe's request is held and never answered.
  const held: Route[] = [];
  await page.route(`${probeOrigin}/**`, route => {
    held.push(route);
  });
  await holdClock(page);
  // The held probe frame keeps the page from firing `load`.
  await page.goto(`${origin}/docs/getting-started?source=test`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(
    page.getByRole('heading', {name: 'Getting Started', exact: true}),
  ).toBeVisible();
  const frame = page.locator(
    'iframe[title="Astryx documentation reachability check"]',
  );
  // The probe inserts its frame as it starts its four seconds.
  await expect(frame).toHaveCount(1);
  await page.clock.runFor(3990);
  await expect(frame).toHaveCount(1);
  await page.clock.runFor(20);
  await expect(frame).toHaveCount(0);
  const notice = page.getByRole('region', {name: noticeName});
  await expect(notice).toHaveCount(isCanary ? 1 : 0);
  await expect(
    page.getByRole('link', {name: 'Meta internal docs', exact: true}),
  ).toHaveCount(0);
  if (isCanary) {
    await expect(notice).toContainText("You're viewing Canary docs");
  }
  await Promise.all(held.map(route => route.abort().catch(() => {})));
});

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
