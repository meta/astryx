// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LayerPressTransform.interaction.browser.spec.ts
 * @input The built Popover, DropdownMenu, Selector, MultiSelector,
 *   ComplexSelector and ContextMenu stories, with a real mouse on a desktop
 *   profile and real touch on the phone profile
 * @output Proof that a press on a trigger never moves, resizes or transforms
 *   the layer the trigger opens. During and after the press, the open layer's
 *   rectangle, its layout box and its computed transform match an open that
 *   no press touched. A layer that opens on the press is placed from the
 *   trigger's untransformed box in its first frame and after the release.
 * @position Evidence for architecture:layer-runtime INV22
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
  touchDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const desktop = {
  viewport: {width: 1280, height: 800},
  isMobile: false,
  hasTouch: false,
} as const;

// Layout snaps to 1/64 px. A press that leaks into the layer moves it by a
// quarter pixel or more.
const TOLERANCE_PX = 0.02;

// The press scale of Button and the selector triggers.
const PRESS_SCALE = 0.98;

interface LayerBox {
  /** The rendered rectangle, transforms included. */
  readonly rect: ReadonlyArray<number>;
  /** The layout box, transforms excluded. */
  readonly layout: ReadonlyArray<number>;
  readonly transform: string;
  readonly scale: string;
}

// The page also keeps a manual popover open for its toasts; an anchored
// layer carries `data-layer-anchored`.
const OPEN_LAYER = '[data-layer-anchored]:popover-open';

async function centerOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('the trigger has no rendered box');
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

/** Waits until every animation and transition on the page has finished. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter(
        animation =>
          animation.playState === 'running' &&
          Number.isFinite(
            animation.effect?.getComputedTiming().endTime ?? Infinity,
          ),
      );
    // A cancelled animation rejects `finished`; it no longer moves anything.
    await Promise.all(
      finite.map(async animation => animation.finished.catch(() => undefined)),
    );
  });
  await frames(page, 2);
}

async function layerBox(page: Page): Promise<LayerBox> {
  const layer = page.locator(OPEN_LAYER);
  await expect(layer, 'one layer is open').toHaveCount(1);
  return layer.evaluate(element => {
    const el = element as HTMLElement;
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      rect: [r.x, r.y, r.width, r.height],
      layout: [el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight],
      transform: style.transform,
      scale: style.scale,
    };
  });
}

function expectNear(
  actual: ReadonlyArray<number>,
  expected: ReadonlyArray<number>,
  what: string,
) {
  actual.forEach((value, index) => {
    expect(
      Math.abs(value - expected[index]),
      `${what} [x, y, width, height] is ${actual.join(', ')}, not ${expected.join(', ')}`,
    ).toBeLessThanOrEqual(TOLERANCE_PX);
  });
}

function expectSameBox(actual: LayerBox, expected: LayerBox, when: string) {
  expect(actual.transform, `${when}: the layer's transform`).toBe(
    expected.transform,
  );
  expect(actual.scale, `${when}: the layer's scale`).toBe(expected.scale);
  expectNear(actual.rect, expected.rect, `${when}: the layer's rectangle`);
  expectNear(actual.layout, expected.layout, `${when}: the layer's layout box`);
}

/** The horizontal scale of the element's own computed transform. */
async function scaleOf(locator: Locator): Promise<number> {
  return locator.evaluate(element => {
    const transform = getComputedStyle(element).transform;
    return transform === 'none' ? 1 : new DOMMatrixReadOnly(transform).a;
  });
}

/** Waits until the press scale on `scaled` has fully applied. */
async function expectPressed(scaled: Locator) {
  await expect
    .poll(async () => scaleOf(scaled), {
      message: 'the press scales the trigger',
    })
    .toBeCloseTo(PRESS_SCALE, 4);
}

/**
 * Reads the open layer's layout box in the first frame after `act` starts,
 * before the press scale or the entrance can settle.
 */
async function firstFrameLayout(page: Page, act: () => Promise<void>) {
  await page.evaluate(selector => {
    const w = window as unknown as {__firstLayout?: number[] | null};
    w.__firstLayout = null;
    const read = () => {
      const layer = document.querySelector<HTMLElement>(selector);
      if (layer == null) {
        requestAnimationFrame(read);
        return;
      }
      w.__firstLayout = [
        layer.offsetLeft,
        layer.offsetTop,
        layer.offsetWidth,
        layer.offsetHeight,
      ];
    };
    requestAnimationFrame(read);
  }, OPEN_LAYER);
  await act();
  return page.evaluate(
    () =>
      (window as unknown as {__firstLayout?: number[] | null}).__firstLayout,
  );
}

test.describe('with a mouse', () => {
  test.use(desktop);

  test('a press on an open Popover trigger leaves the popover in place', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-popover--default');
    const trigger = page.locator('#storybook-root button').first();
    const at = await centerOf(trigger);
    await page.mouse.click(at.x, at.y);
    await settle(page);
    const open = await layerBox(page);

    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await expectPressed(trigger);
    await settle(page);
    expectSameBox(await layerBox(page), open, 'during the press');
    await page.mouse.up();
  });

  test.fixme('INV22: a press on the Button that anchors a Popover through anchorRef leaves the popover in place', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-popover--anchor-ref');
    const trigger = page.getByRole('button', {name: 'Anchor button'});
    const at = await centerOf(trigger);
    await page.mouse.click(at.x, at.y);
    await settle(page);
    const open = await layerBox(page);

    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await expectPressed(trigger);
    await settle(page);
    expectSameBox(await layerBox(page), open, 'during the press');
    await page.mouse.up();
  });

  test('the press that opens a DropdownMenu places the menu from the unpressed trigger', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-dropdownmenu--default');
    const trigger = page.getByRole('button', {name: 'Actions'});
    const at = await centerOf(trigger);
    await page.mouse.move(at.x, at.y);
    const first = await firstFrameLayout(page, async () => page.mouse.down());
    await settle(page);
    const held = await layerBox(page);
    await page.mouse.up();
    await settle(page);
    const released = await layerBox(page);

    expectSameBox(held, released, 'during the opening press');
    expect(first, 'a frame shows the open menu').not.toBeNull();
    expectNear(
      first ?? [],
      released.layout,
      "in the first frame of the opening press: the menu's layout box",
    );
  });

  test('a press and release that opens a ghost Selector places the list as an unpressed open does', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-selector--ghost-variant');
    const trigger = page.getByRole('combobox').first();
    const control = page.locator('.astryx-selector').first();

    await trigger.focus();
    await page.keyboard.press('Enter');
    await settle(page);
    const unpressed = await layerBox(page);
    await page.keyboard.press('Escape');
    await settle(page);
    await expect(page.locator(OPEN_LAYER)).toHaveCount(0);

    const at = await centerOf(trigger);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await expectPressed(control);
    await page.mouse.up();
    await settle(page);
    expectSameBox(await layerBox(page), unpressed, 'after the press');
  });

  test.fixme('INV22: a press on an open ghost MultiSelector trigger leaves the list in place', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-multiselector--ghost-variant');
    await expectHeldTriggerKeepsLayer(
      page,
      page.getByRole('combobox').first(),
      page.locator('.astryx-multi-selector').first(),
    );
  });

  test.fixme('INV22: a press on an open secondary ComplexSelector trigger leaves the list in place', async ({
    page,
  }) => {
    await openStory(
      page,
      storybook(),
      'core-complexselector--secondary-variant',
    );
    await expectHeldTriggerKeepsLayer(
      page,
      page.getByRole('combobox').first(),
      page.locator('.astryx-complex-selector').first(),
    );
  });
});

async function expectHeldTriggerKeepsLayer(
  page: Page,
  trigger: Locator,
  scaled: Locator,
) {
  const at = await centerOf(trigger);
  await page.mouse.click(at.x, at.y);
  await settle(page);
  const open = await layerBox(page);

  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await expectPressed(scaled);
  await settle(page);
  expectSameBox(await layerBox(page), open, 'during the press');
  await page.mouse.up();
}

test.describe('with a finger', () => {
  test('a finger held on an open Popover trigger leaves the popover in place', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-popover--default');
    const trigger = page.locator('#storybook-root button').first();
    const at = await centerOf(trigger);
    const touch = await touchDriver(page);
    await touch.tap(at);
    await settle(page);
    const open = await layerBox(page);

    const finger = await touch.press(at);
    await expectPressed(trigger);
    await settle(page);
    expectSameBox(await layerBox(page), open, 'while the finger is down');
    await finger.lift();
  });

  test.fixme('INV22: a finger held on a DropdownMenu trigger opens and keeps the menu at its unpressed place', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-dropdownmenu--default');
    const trigger = page.getByRole('button', {name: 'Actions'});
    const at = await centerOf(trigger);
    const touch = await touchDriver(page);
    const finger = await touch.press(at);
    await expectPressed(trigger);
    await expect(page.locator(OPEN_LAYER)).toHaveCount(1);
    await settle(page);
    const held = await layerBox(page);
    await finger.lift();
    await settle(page);
    expectSameBox(held, await layerBox(page), 'while the finger is down');
  });

  test('a tap that opens a ghost Selector places the list as an unpressed open does', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-selector--ghost-variant');
    const trigger = page.getByRole('combobox').first();
    const control = page.locator('.astryx-selector').first();

    await trigger.focus();
    await page.keyboard.press('Enter');
    await settle(page);
    const unpressed = await layerBox(page);
    await page.keyboard.press('Escape');
    await settle(page);
    await expect(page.locator(OPEN_LAYER)).toHaveCount(0);

    const touch = await touchDriver(page);
    const finger = await touch.press(await centerOf(trigger));
    await expectPressed(control);
    await finger.lift();
    await settle(page);
    expectSameBox(await layerBox(page), unpressed, 'after the press');
  });

  test('a long press that opens a ContextMenu keeps the menu in place as the finger lifts', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-contextmenu--default');
    const touch = await touchDriver(page);
    const finger = await touch.press(
      await centerOf(page.getByText('Right-click this area')),
    );
    await expect(page.locator(OPEN_LAYER)).toHaveCount(1, {timeout: 3_000});
    await settle(page);
    const held = await layerBox(page);
    await finger.lift();
    await settle(page);
    expectSameBox(await layerBox(page), held, 'after the finger lifts');
  });
});
