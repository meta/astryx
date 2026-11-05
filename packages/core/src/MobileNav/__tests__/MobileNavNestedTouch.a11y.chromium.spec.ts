// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MobileNavNestedTouch.a11y.chromium.spec.ts
 * @input The built MobileNav "Nested Dialog" story and real Chromium touch
 *   input (CDP)
 * @output Browser evidence that a Dialog opened inside the open drawer keeps
 *   touch scrolling: no ancestor of its content restricts panning, its
 *   results scroll under a finger drag, and the scrim and the header still
 *   block background pans
 * @position A browser resolves `touch-action` through DOM ancestors, and a
 *   descendant cannot allow back what an ancestor blocks.
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
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

test.use({
  hasTouch: true,
  isMobile: true,
  viewport: {width: 390, height: 844},
});

const sleep = async (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

test('a Dialog opened inside the drawer keeps touch scrolling', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-mobilenav--nested-dialog&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Open Navigation'}).tap();
  const nav = page.getByRole('dialog', {name: 'Navigation'});
  await expect(nav).toBeVisible();
  await page.waitForTimeout(600); // the slide-in
  await nav.getByRole('button', {name: 'Search'}).tap();
  const results = page.getByRole('group', {name: 'Search results'});
  await expect(results).toBeVisible();
  await page.waitForTimeout(400);

  // Every ancestor of the results, up to the drawer's dialog, lets a pan
  // through.
  const restricted = await results.evaluate(element => {
    const found: string[] = [];
    let node: Element | null = element;
    const drawerDialog = document.querySelector('.astryx-mobile-nav');
    while (node != null) {
      const value = getComputedStyle(node).touchAction;
      if (value !== 'auto') {
        found.push(`${node.tagName}.${node.className}: ${value}`);
      }
      if (node === drawerDialog) {
        break;
      }
      node = node.parentElement;
    }
    return found;
  });
  expect(restricted).toEqual([]);

  // A finger drag scrolls the results.
  const box = await results.boundingBox();
  if (box == null) {
    throw new Error('no results box');
  }
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  const startY = box.y + box.height - 20;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x, y: startY}],
  });
  for (let step = 1; step <= 10; step++) {
    await sleep(16);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{x, y: startY - step * 20}],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await sleep(600);
  expect(await results.evaluate(element => element.scrollTop)).toBeGreaterThan(
    50,
  );
});

test('the scrim and the header block background pans and allow pinch', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-mobilenav--nested-dialog&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Open Navigation'}).tap();
  const nav = page.getByRole('dialog', {name: 'Navigation'});
  await expect(nav).toBeVisible();
  const values = await nav.evaluate(dialog => {
    const scrim = dialog.querySelector(':scope > div[aria-hidden="true"]');
    const header = dialog.querySelector('h2')?.parentElement;
    return {
      scrim: scrim == null ? null : getComputedStyle(scrim).touchAction,
      header: header == null ? null : getComputedStyle(header).touchAction,
    };
  });
  expect(values).toEqual({scrim: 'pinch-zoom', header: 'pinch-zoom'});
});
