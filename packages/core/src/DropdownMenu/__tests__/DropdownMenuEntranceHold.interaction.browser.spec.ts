// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuEntranceHold.interaction.browser.spec.ts
 * @input The built Default DropdownMenu story under the harness's phone
 *   profile, with real touch input (Chromium CDP / WebKit's input command),
 *   and a mouse on a desktop profile. The menu's entrance is lengthened to
 *   10 s, so input lands inside it on any box.
 * @output Proof that a menu that enters under a finger takes no new input. A
 *   tap that lands then neither closes it nor reaches the page nor moves
 *   focus. Once the entrance ends, a tap outside dismisses it. The finger
 *   that opened the menu still picks the row it lifts on. A mouse is not
 *   held: after a finger opens the menu, a mouse resting on a row picks it.
 * @position Evidence for DropdownMenu's entrance hold; the layer runtime's
 *   hold has its own spec in Layer/__tests__
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  frames,
  openStory,
  path,
  touchDriver,
  waitForRest,
  withStorybook,
} from '@astryxdesign/interaction-harness';
import {UIKIT_GESTURES} from '../../motion/uikit/gestures';

const storybook = withStorybook(test);

const HANDOFF_PX = UIKIT_GESTURES.menuPress.handoff.value;

/** The element's rendered box; a missing one fails the spec. */
async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('the element has no rendered box');
  }
  return box;
}

/** Page-side capture of the rows the story reports as picked. */
async function installPickLog(page: Page) {
  await page.evaluate(() => {
    const picked: string[] = [];
    (window as unknown as {__picked: string[]}).__picked = picked;
    // The story reports a pick by logging "<label> clicked".
    // eslint-disable-next-line no-console -- see above
    const original = console.log.bind(console);
    // eslint-disable-next-line no-console -- see above
    console.log = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].endsWith(' clicked')) {
        picked.push(args[0].replace(' clicked', ''));
      }
      original(...args);
    };
  });
}

const readPicked = async (page: Page) =>
  page.evaluate(() => (window as unknown as {__picked: string[]}).__picked);

interface LoggedClick {
  insideLayer: boolean;
  onTrigger: boolean;
}

/**
 * Page-side log of every click: in the menu's layer, on its trigger, or
 * elsewhere.
 */
async function installClickLog(page: Page) {
  await page.evaluate(() => {
    const clicks: {insideLayer: boolean; onTrigger: boolean}[] = [];
    (window as unknown as {__clicks: typeof clicks}).__clicks = clicks;
    document.addEventListener(
      'click',
      event => {
        const layer = document.querySelector('[popover]:has([role="menu"])');
        const trigger = document.querySelector(
          '[aria-haspopup][aria-expanded]',
        );
        const target = event.target instanceof Node ? event.target : null;
        clicks.push({
          insideLayer: layer?.contains(target) === true,
          onTrigger: trigger?.contains(target) === true,
        });
      },
      true,
    );
  });
}

const readClicks = async (page: Page) =>
  page.evaluate(
    () => (window as unknown as {__clicks: LoggedClick[]}).__clicks,
  );

const activeDescription = async (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement;
    return active == null
      ? 'none'
      : `${active.tagName}#${active.id}[${active.getAttribute('role') ?? ''}]`;
  });

const menuLayer = (page: Page) =>
  page.locator('[popover]:has([role="menu"])').first();

/**
 * Makes every popover's entrance last 10 s, so input lands inside it. The
 * entrance runs on the surface, the layer's child.
 */
async function lengthenEntrance(page: Page) {
  await page.addStyleTag({
    content: '[popover], [popover] > * { animation-duration: 10s !important; }',
  });
}

/** How many entrance animations run on the menu's layer or its surface now. */
const runningEntrances = async (layer: Locator) =>
  layer.evaluate(
    element =>
      [element, element.firstElementChild]
        .flatMap(node => node?.getAnimations() ?? [])
        .filter(animation => animation.playState === 'running').length,
  );

/** Ends the layer's entrance at once, as if its time had run out. */
async function finishEntrance(page: Page, layer: Locator) {
  await layer.evaluate(element => {
    for (const node of [element, element.firstElementChild]) {
      for (const animation of node?.getAnimations() ?? []) {
        animation.finish();
      }
    }
  });
  await frames(page, 2);
}

test('a tap that lands while the menu enters is ignored: it finishes, stays open and keeps focus; once it is in, a tap outside dismisses it (spec:AST-094 FR35)', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-dropdownmenu--default');
  await installClickLog(page);
  await lengthenEntrance(page);
  const driver = await touchDriver(page);
  const trigger = page.getByRole('button', {name: 'Actions'});
  const box = await boxOf(trigger);
  await driver.tap({
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  });
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const layer = menuLayer(page);
  // The menu is on screen and still entering.
  await expect(page.getByRole('menuitem', {name: 'Edit'})).toBeVisible();
  expect(await runningEntrances(layer)).toBeGreaterThan(0);
  await frames(page, 2);
  const focused = await activeDescription(page);
  const viewport = page.viewportSize() ?? {width: 402, height: 714};
  const outside = {x: 20, y: viewport.height - 20};

  await driver.tap(outside);
  await frames(page, 2);
  // The menu stays: nothing beneath was clicked, and focus did not move.
  // The opening tap's own click lands on the trigger, whenever it arrives.
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(
    (await readClicks(page)).filter(
      click => !click.insideLayer && !click.onTrigger,
    ),
  ).toEqual([]);
  expect(await activeDescription(page)).toBe(focused);

  // Once it is in, a tap outside is the browser's light dismiss again.
  await finishEntrance(page, layer);
  await driver.tap(outside);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('the finger that opened the menu still picks the row it lifts on while the menu enters (spec:AST-094 FR29, FR35)', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-dropdownmenu--default');
  await installPickLog(page);
  const driver = await touchDriver(page);
  const trigger = page.getByRole('button', {name: 'Actions'});
  const box = await boxOf(trigger);
  const x = Math.round(box.x + box.width / 2);
  // Measure the open menu's rows once its entrance has come to rest.
  await driver.tap({x, y: Math.round(box.y + box.height / 2)});
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const layer = menuLayer(page);
  await waitForRest(layer);
  const duplicate = await boxOf(
    page.getByRole('menuitem', {name: 'Duplicate'}),
  );
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await waitForRest(layer);
  await lengthenEntrance(page);

  // The finger rests on the trigger's edge nearest the menu until the menu
  // is open under it. Then it travels past the handoff onto a row and lifts
  // there, all within the entrance.
  const start = {x, y: Math.floor(box.y + box.height) - 1};
  const end = {x, y: Math.round(duplicate.y + duplicate.height / 2)};
  expect(end.y - start.y).toBeGreaterThan(HANDOFF_PX);
  await driver.play(
    path(progress => ({x, y: start.y + (end.y - start.y) * progress}), {
      holdMs: 800,
      durationMs: 250,
      hz: 60,
      restMs: 100,
    }),
  );
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await frames(page, 2);
  expect(await readPicked(page)).toEqual(['Duplicate']);
});

test("after a finger opens the menu, a mouse resting on a row picks it while the menu enters: a mouse's press is not held (spec:AST-094 FR35)", async ({
  page,
}) => {
  // Under Reduce Motion the menu only fades in, so its rows stay where the
  // mouse rests.
  await page.emulateMedia({reducedMotion: 'reduce'});
  await openStory(page, storybook(), 'core-dropdownmenu--default');
  await installPickLog(page);
  const driver = await touchDriver(page);
  const trigger = page.getByRole('button', {name: 'Actions'});
  const box = await boxOf(trigger);
  const opener = {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
  // Measure the open menu's rows once its entrance has come to rest.
  await driver.tap(opener);
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const layer = menuLayer(page);
  await waitForRest(layer);
  const duplicate = await boxOf(
    page.getByRole('menuitem', {name: 'Duplicate'}),
  );
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await waitForRest(layer);
  await lengthenEntrance(page);
  // A mouse on the same touch screen comes to rest over the row. Then a
  // finger opens the menu.
  const row = {
    x: Math.round(duplicate.x + duplicate.width / 2),
    y: Math.round(duplicate.y + duplicate.height / 2),
  };
  await page.mouse.move(row.x - 30, row.y);
  await page.mouse.move(row.x, row.y, {steps: 4});
  await driver.tap(opener);
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(await runningEntrances(layer)).toBeGreaterThan(0);
  // The mouse has not moved since the finger: its click picks the row.
  await page.mouse.down();
  await page.mouse.up();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(await readPicked(page)).toEqual(['Duplicate']);
});

test('after a finger opens the menu, a mouse that moves onto another row while the menu enters picks that row: a move lowers the shield (spec:AST-094 FR35)', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await openStory(page, storybook(), 'core-dropdownmenu--default');
  await installPickLog(page);
  const driver = await touchDriver(page);
  const trigger = page.getByRole('button', {name: 'Actions'});
  const box = await boxOf(trigger);
  const opener = {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
  await driver.tap(opener);
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const layer = menuLayer(page);
  await waitForRest(layer);
  const edit = await boxOf(page.getByRole('menuitem', {name: 'Edit'}));
  const duplicate = await boxOf(
    page.getByRole('menuitem', {name: 'Duplicate'}),
  );
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await waitForRest(layer);
  await lengthenEntrance(page);
  // The mouse rests over the first row; a finger opens the menu.
  const x = Math.round(edit.x + edit.width / 2);
  await page.mouse.move(x - 30, Math.round(edit.y + edit.height / 2));
  await page.mouse.move(x, Math.round(edit.y + edit.height / 2), {steps: 4});
  await driver.tap(opener);
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(await runningEntrances(layer)).toBeGreaterThan(0);
  // While the menu enters, the mouse moves onto the second row and clicks.
  await page.mouse.move(x, Math.round(duplicate.y + duplicate.height / 2), {
    steps: 4,
  });
  await page.mouse.down();
  await page.mouse.up();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(await readPicked(page)).toEqual(['Duplicate']);
});

test.describe('under a desktop mouse', () => {
  test.use({
    isMobile: false,
    hasTouch: false,
    viewport: {width: 1280, height: 720},
    deviceScaleFactor: 1,
  });

  test('a click outside while the menu enters closes it: a mouse is not held', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-dropdownmenu--default');
    await lengthenEntrance(page);
    const trigger = page.getByRole('button', {name: 'Actions'});
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('menuitem', {name: 'Edit'})).toBeVisible();
    expect(await runningEntrances(menuLayer(page))).toBeGreaterThan(0);
    await page.mouse.click(20, 700);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
