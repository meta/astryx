// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/Table/

/**
 * @file TableInfiniteScrollWide.a11y.chromium.spec.ts
 * @input Built loading story, native horizontal scrolling and IntersectionObserver
 * @output Regression evidence for a reachable command and sentinel at inline end
 * @position Infinite-scroll browser integration tests; layout requires a real engine
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
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

async function reachInlineEnd(page: Page, isRTL: boolean) {
  // Keep the end below the browser viewport until after horizontal scrolling.
  await page.setViewportSize({width: 1180, height: 120});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-table-infinite-loading--manual-and-automatic-loading&viewMode=story`,
  );
  const viewport = page.locator('.astryx-table-scroll-wrapper');
  await expect(viewport.locator('tbody tr')).toHaveCount(4);
  await viewport.evaluate((node, isRTL) => {
    node.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
    node.style.inlineSize = '688px';
    const table = node.querySelector('table');
    if (table == null) {
      throw new Error('Loading story has no table');
    }
    table.style.minInlineSize = '2200px';
  }, isRTL);
  await expect(viewport).toHaveAttribute('data-scrollable-inline', 'true');
  await viewport.evaluate((node, isRTL) => {
    node.scrollLeft = (node.scrollWidth - node.clientWidth) * (isRTL ? -1 : 1);
  }, isRTL);
  const geometry = await viewport.evaluate(node => ({
    width: node.clientWidth,
    extent: node.scrollWidth,
    offset: Math.abs(node.scrollLeft),
  }));
  expect(geometry).toEqual({width: 688, extent: 2200, offset: 1512});
  await viewport.getByRole('button', {name: 'Load more'}).evaluate(button => {
    const sentinel = button.parentElement?.firstElementChild;
    if (sentinel == null) {
      throw new Error('Loading story has no sentinel');
    }
    window.scrollBy(0, sentinel.getBoundingClientRect().top - 40);
  });
  return viewport;
}

async function expectReachableCommand(viewport: Locator) {
  const geometry = await viewport
    .getByRole('button', {name: 'Load more'})
    .evaluate(button => {
      const region = button.closest('.astryx-table-scroll-wrapper');
      const sentinel = button.parentElement?.firstElementChild;
      if (region == null || sentinel == null) {
        throw new Error('Missing loading surface');
      }
      const root = region.getBoundingClientRect();
      const command = button.getBoundingClientRect();
      const target = sentinel.getBoundingClientRect();
      return {
        isCommandInside:
          command.left >= root.left && command.right <= root.right,
        isSentinelInside: target.left < root.right && target.right > root.left,
        isCommandOnScreen:
          command.top >= 0 && command.bottom <= window.innerHeight,
      };
    });
  expect(geometry).toEqual({
    isCommandInside: true,
    isSentinelInside: true,
    isCommandOnScreen: true,
  });
}

async function shrinkToFitGeometry(
  page: Page,
  hostKind: 'inline-block' | 'grid',
  isRTL: boolean,
  story: string,
) {
  await page.setViewportSize({width: 1180, height: 120});
  await page.goto(`${storybook.origin}/iframe.html?id=${story}&viewMode=story`);
  const viewport = page.locator('.astryx-table-scroll-wrapper');
  await expect(viewport.locator('tbody tr').first()).toBeAttached();
  await viewport.evaluate(
    (node, {hostKind, isRTL}) => {
      const table = node.querySelector('table');
      if (table == null) {
        throw new Error('Story has no table');
      }
      table.style.minInlineSize = '2200px';
      const host = document.createElement('div');
      host.style.display = hostKind;
      host.dir = isRTL ? 'rtl' : 'ltr';
      if (hostKind === 'grid') {
        host.style.gridTemplateColumns = 'auto';
        host.style.inlineSize = 'fit-content';
      }
      node.parentElement?.insertBefore(host, node);
      host.append(node);
    },
    {hostKind, isRTL},
  );
  return viewport.evaluate(node => {
    const host = node.parentElement;
    const table = node.querySelector('table');
    if (host == null || table == null) {
      throw new Error('Missing shrink-to-fit host or table');
    }
    return {
      host: host.getBoundingClientRect().width,
      viewport: node.getBoundingClientRect().width,
      table: table.getBoundingClientRect().width,
    };
  });
}

for (const isRTL of [false, true]) {
  for (const hostKind of ['inline-block', 'grid'] as const) {
    test(`loading preserves ${isRTL ? 'RTL' : 'LTR'} ${hostKind} intrinsic width`, async ({
      page,
    }) => {
      await page.addInitScript(() => {
        Object.defineProperty(window, 'IntersectionObserver', {
          value: undefined,
        });
      });
      const baseline = await shrinkToFitGeometry(
        page,
        hostKind,
        isRTL,
        'core-table--default',
      );
      expect(baseline.host).toBeGreaterThan(0);
      expect(baseline.viewport).toBe(baseline.host);
      expect(baseline.table).toBe(2200);
      const loading = await shrinkToFitGeometry(
        page,
        hostKind,
        isRTL,
        'core-table-infinite-loading--manual-and-automatic-loading',
      );
      expect(loading).toEqual(baseline);
    });
  }
  test(`fitting ${isRTL ? 'RTL' : 'LTR'} loading command stays centred`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'IntersectionObserver', {value: undefined});
    });
    await page.setViewportSize({width: 1180, height: 120});
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-table-infinite-loading--manual-and-automatic-loading&viewMode=story`,
    );
    const viewport = page.locator('.astryx-table-scroll-wrapper');
    await expect(viewport.locator('tbody tr')).toHaveCount(4);
    await viewport.evaluate((node, isRTL) => {
      node.style.inlineSize = '688px';
      node.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
    }, isRTL);
    const difference = await viewport
      .getByRole('button', {name: 'Load more'})
      .evaluate(button => {
        const region = button.closest('.astryx-table-scroll-wrapper');
        if (region == null) {
          throw new Error('Missing loading viewport');
        }
        const root = region.getBoundingClientRect();
        const command = button.getBoundingClientRect();
        return Math.abs(
          (root.left + root.right - command.left - command.right) / 2,
        );
      });
    expect(difference).toBeLessThanOrEqual(1);
  });

  test(`manual loading remains reachable at ${isRTL ? 'RTL' : 'LTR'} inline end without observation`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'IntersectionObserver', {value: undefined});
    });
    const viewport = await reachInlineEnd(page, isRTL);
    await expectReachableCommand(viewport);
    await viewport.getByRole('button', {name: 'Load more'}).click();
    await expect(viewport.locator('tbody tr')).toHaveCount(8);
  });

  test(`native observation loads at ${isRTL ? 'RTL' : 'LTR'} inline end`, async ({
    page,
  }) => {
    const viewport = await reachInlineEnd(page, isRTL);
    await expectReachableCommand(viewport);
    await expect
      .poll(async () => viewport.locator('tbody tr').count())
      .toBeGreaterThan(4);
  });
}
