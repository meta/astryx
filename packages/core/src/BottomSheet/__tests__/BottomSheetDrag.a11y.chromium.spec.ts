// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file BottomSheetDrag.a11y.chromium.spec.ts
 * @input Built BottomSheet stories and real Chromium touch input (CDP)
 * @output Browser evidence that a drag follows the finger without rendering,
 *   and that the release animates from where the finger left the sheet
 * @position Chromium proof for useSheetGestures' live transform path
 */

import {expect, test, type Page} from '@playwright/test';
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

test.use({hasTouch: true, viewport: {width: 390, height: 844}});

// A React commit counter: DevTools' hook is called once per committed root.
const COMMIT_COUNTER = `(() => {
  const hook = {
    renderers: new Map(), supportsFiber: true, commits: 0,
    inject() { return 1; },
    onCommitFiberRoot() { hook.commits += 1; },
    onCommitFiberUnmount() {}, onPostCommitFiberRoot() {},
  };
  Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {value: hook});
})()`;

async function openSheet(page: Page) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-bottomsheet--snap-points&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Open nearby places'}).click();
  const dialog = page.getByRole('dialog', {name: 'Nearby places'});
  await expect(dialog).toBeVisible();
  // The sheet panel carries the component class and the transform.
  const sheet = dialog.locator('.astryx-bottom-sheet').first();
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(600); // the entrance
  return {dialog, sheet};
}

function tyOf(transform: string): number {
  const match = /translateY\((-?[\d.]+)px\)/.exec(transform);
  return match ? Number(match[1]) : 0;
}

test('a drag writes the transform per move and renders nothing between', async ({
  page,
}) => {
  await page.addInitScript(COMMIT_COUNTER);
  const {sheet} = await openSheet(page);
  const box = await sheet.boundingBox();
  if (box == null) {
    throw new Error('no sheet box');
  }
  const x = box.x + box.width / 2;
  const handleY = box.y + 12;
  const commitsBefore = await page.evaluate(
    () =>
      (window as unknown as {__REACT_DEVTOOLS_GLOBAL_HOOK__: {commits: number}})
        .__REACT_DEVTOOLS_GLOBAL_HOOK__.commits,
  );
  const cdp = await page.context().newCDPSession(page);
  const steps = 24;
  const trail: number[] = [];
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x, y: handleY}],
  });
  for (let i = 1; i <= steps; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{x, y: handleY + i * 5}],
    });
    trail.push(
      tyOf(await sheet.evaluate(el => (el as HTMLElement).style.transform)),
    );
    await page.waitForTimeout(16);
  }
  const commitsDuring = await page.evaluate(
    () =>
      (
        window as unknown as {
          __REACT_DEVTOOLS_GLOBAL_HOOK__: {commits: number};
        }
      ).__REACT_DEVTOOLS_GLOBAL_HOOK__.commits,
  );
  // The transform followed the finger (inline, written per move; the first
  // samples ease out of the magnet around the resting detent) ...
  expect(trail[trail.length - 1]).toBeGreaterThanOrEqual(100);
  expect(trail.filter((ty, i) => i === 0 || ty >= trail[i - 1]).length).toBe(
    trail.length,
  );
  // ... and the moves cost a handful of commits (the drag beginning, the
  // sheet traveling), not one per move.
  expect(commitsDuring - commitsBefore).toBeLessThanOrEqual(4);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  // The release animates back from where the finger left the sheet: the
  // computed transform is still off rest a frame later, and at rest after the
  // transition.
  await page.waitForTimeout(40);
  const midway = await sheet.evaluate(el => getComputedStyle(el).transform);
  const midwayTy = /matrix\(1, 0, 0, 1, 0, (-?[\d.]+)\)/.exec(midway);
  expect(midwayTy, midway).not.toBeNull();
  expect(Number(midwayTy?.[1])).toBeGreaterThan(5);
  await expect
    .poll(async () => sheet.evaluate(el => getComputedStyle(el).transform), {
      timeout: 2_000,
    })
    .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  await expect(page.getByRole('dialog', {name: 'Nearby places'})).toBeVisible();
});
