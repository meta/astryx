// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file BottomSheetDrag.a11y.chromium.spec.ts
 * @input Built BottomSheet stories and real Chromium touch input (CDP)
 * @output Browser evidence that a drag follows the finger without rendering,
 *   and that the release animates from where the finger left the sheet
 * @position Chromium proof for useSheetGestures' live transform path
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

// The sheet's travel, inline: its resting transform plus the travel channel
// a drag moves it on (`translate`), written per move.
async function inlineTravel(sheet: Locator): Promise<number> {
  return sheet.evaluate(el => {
    const {style} = el as HTMLElement;
    const resting = /translateY\((-?[\d.]+)px\)/.exec(style.transform);
    const [, travel = '0'] = style.translate.split(' ');
    return (
      (resting == null ? 0 : Number(resting[1])) +
      (Number.parseFloat(travel) || 0)
    );
  });
}

// The same as drawn, from the computed style: a release animates the travel
// channel on the compositor.
async function drawnTravel(sheet: Locator): Promise<number> {
  return sheet.evaluate(el => {
    const computed = getComputedStyle(el);
    const resting =
      computed.transform === 'none' ? 0 : new DOMMatrix(computed.transform).m42;
    const travel =
      computed.translate === 'none'
        ? 0
        : Number.parseFloat(computed.translate.split(' ')[1] ?? '0') || 0;
    return resting + travel;
  });
}

test('a drag writes its travel per move and renders nothing between', async ({
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
    trail.push(await inlineTravel(sheet));
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
  // The travel followed the finger (inline, written per move; the first
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
  // The release animates back from where the finger left the sheet: still
  // off rest as drawn a frame later, and at rest once it lands.
  await page.waitForTimeout(40);
  expect(await drawnTravel(sheet)).toBeGreaterThan(5);
  await expect
    .poll(async () => Math.abs(await drawnTravel(sheet)), {timeout: 2_000})
    .toBeLessThan(0.5);
  await expect(page.getByRole('dialog', {name: 'Nearby places'})).toBeVisible();
});
