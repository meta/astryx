// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenuLongPress.a11y.chromium.spec.ts
 * @input The `Core/ContextMenu` Default story in a built Storybook and CDP
 *   touch input.
 * @output Real-engine proof that the long press that opens a context menu
 *   does not close it as the finger lifts, and that a tap outside still does.
 * @position Run with `pnpm test:a11y-contract`; jsdom cannot produce the
 *   compatibility mouse events a real browser sends after a touch.
 */

import {expect, test, type CDPSession, type Page} from '@playwright/test';
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

const STORY = 'core-contextmenu--default';

async function touchCdp(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 1,
  });
  return cdp;
}

async function triggerCenter(page: Page): Promise<{x: number; y: number}> {
  const box = await page.getByText('Right-click this area').boundingBox();
  if (box == null) {
    throw new Error('the trigger area has no rendered bounds');
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

/**
 * Resolves two frames after the lift's `touchend`, or after the `click` that
 * follows it when the browser sends one (the last of a touch's compatibility
 * mouse events), so anything those events close has closed. Under the touch
 * model a hold that opens the menu gets no compatibility events, so the lift's
 * `touchend` is the last event of the press.
 */
async function armCompatClick(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {__compatClick?: Promise<void>};
    w.__compatClick = new Promise(resolve => {
      // Each event restarts the two frames, so a click that follows the
      // lift's touchend is waited for too.
      let last = 0;
      const settle = () => {
        const mine = ++last;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (mine === last) {
              resolve();
            }
          }),
        );
      };
      document.addEventListener('touchend', settle, {
        once: true,
        capture: true,
      });
      document.addEventListener('click', settle, {once: true, capture: true});
    });
  });
}

/**
 * Resolves two frames after every running animation on the page has
 * finished: the presentation's, which ends the layer's input hold.
 */
async function presentationSettled(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await Promise.all(
      document.getAnimations().map(async animation =>
        animation.finished.then(
          () => undefined,
          () => undefined,
        ),
      ),
    );
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

async function compatClickDelivered(page: Page): Promise<void> {
  await page.evaluate(
    async () =>
      (window as unknown as {__compatClick?: Promise<void>}).__compatClick,
  );
}

test('the long press that opens the menu leaves it open as the finger lifts', async ({
  page,
}) => {
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  const cdp = await touchCdp(page);
  const center = await triggerCenter(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x: center.x, y: center.y, id: 1}],
  });
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible({timeout: 2000});
  await armCompatClick(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await compatClickDelivered(page);
  await expect(menu).toBeVisible();

  // A tap outside still closes it, once the presentation has run: until it
  // completes, a tap reaches nothing (the layer's input hold, as UIKit drops
  // a touch while a presentation runs).
  await presentationSettled(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x: 5, y: 5, id: 2}],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await expect(menu).toBeHidden();
});

test('a mouse press outside closes a right-click menu', async ({page}) => {
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  const center = await triggerCenter(page);
  await page.mouse.click(center.x, center.y, {button: 'right'});
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(menu).toBeHidden();
});
