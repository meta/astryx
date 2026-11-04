// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file MenuPinchZoom.a11y.chromium.spec.ts
 * @input Built DropdownMenu and Selector stories and real Chromium touch
 *   input (CDP) on a phone profile
 * @output Browser evidence that a two-finger pinch over an open menu, one
 *   whose rows fit or one that scrolls, or over an open picker listbox, zooms
 *   the page (WCAG 1.4.4) and acts on no row
 * @position Real-engine proof for the pinch half of
 *   module:DropdownMenu/useMenuPress FR4; jsdom computes no touch-action
 */

import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';
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

// A phone: the viewport meta applies and the page can pinch-zoom.
test.use({
  hasTouch: true,
  isMobile: true,
  viewport: {width: 390, height: 844},
  deviceScaleFactor: 3,
});

const sleep = async (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

async function mount(page: Page, story: string) {
  await page.goto(`${storybook.origin}/iframe.html?id=${story}&viewMode=story`);
  await expect(page.locator('#storybook-root')).toBeVisible();
}

async function pageScale(page: Page) {
  return page.evaluate(() => window.visualViewport?.scale ?? 1);
}

async function centerOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('no rendered bounds');
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

type Point = {x: number; y: number};

// Two fingers land one after the other and spread apart sideways, as a person
// pinches. Sideways, because a menu that scrolls pans vertically: a vertical
// spread would spend its first stretch panning before the zoom takes over.
async function pinch(cdp: CDPSession, at: Point) {
  const first = {x: at.x - 30, y: at.y};
  const second = {x: at.x + 30, y: at.y};
  const steps = 12;
  const spread = 3;
  const point = (p: Point, k: number, id: number) => ({
    x: at.x + (p.x - at.x) * k,
    y: at.y + (p.y - at.y) * k,
    id,
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point(first, 1, 1)],
  });
  await sleep(30);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point(first, 1, 1), point(second, 1, 2)],
  });
  for (let i = 1; i <= steps; i++) {
    await sleep(16);
    const k = 1 + ((spread - 1) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [point(first, k, 1), point(second, k, 2)],
    });
  }
  await sleep(16);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await sleep(600);
}

test('a pinch over an open menu whose rows fit zooms the page and acts on no row', async ({
  page,
}) => {
  // The story's rows log `<label> clicked`; that line is an activation.
  const activations: string[] = [];
  page.on('console', message => {
    if (message.text().endsWith(' clicked')) {
      activations.push(message.text());
    }
  });
  await mount(page, 'core-dropdownmenu--default');
  await page.getByRole('button', {name: 'Actions'}).tap();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  expect(await pageScale(page)).toBe(1);

  const cdp = await page.context().newCDPSession(page);
  await pinch(
    cdp,
    await centerOf(page.getByRole('menuitem', {name: 'Duplicate'})),
  );

  expect(await pageScale(page)).toBeGreaterThan(1.2);
  expect(activations).toEqual([]);
});

test('a pinch over an open menu that scrolls zooms the page and acts on no row', async ({
  page,
}) => {
  await mount(page, 'core-dropdownmenu--tall-content-overflow');
  const menu = page.getByRole('menu');
  // The story's play opens the menu; open it here if it has not.
  await menu.waitFor({state: 'visible', timeout: 3000}).catch(async () => {
    await page.getByRole('button', {name: 'Move to project'}).tap();
  });
  await expect(menu).toBeVisible();
  await expect
    .poll(async () =>
      menu.evaluate(el => el.scrollHeight > el.clientHeight + 1),
    )
    .toBe(true);
  expect(await pageScale(page)).toBe(1);

  const cdp = await page.context().newCDPSession(page);
  await pinch(cdp, await centerOf(menu));

  expect(await pageScale(page)).toBeGreaterThan(1.2);
  // A row that acted would have closed the menu.
  await expect(menu).toBeVisible();
});

test('a pinch over an open picker listbox zooms the page and selects nothing', async ({
  page,
}) => {
  await mount(page, 'core-selector--default');
  const combobox = page.getByRole('combobox');
  await combobox.tap();
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  expect(await pageScale(page)).toBe(1);

  const cdp = await page.context().newCDPSession(page);
  await pinch(cdp, await centerOf(page.getByRole('option', {name: 'Banana'})));

  expect(await pageScale(page)).toBeGreaterThan(1.2);
  await expect(listbox).toBeVisible();
  await expect(combobox).not.toContainText('Banana');
});
