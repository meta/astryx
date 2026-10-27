// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListDividers.interaction.browser.spec.ts
 * @input The built List story with dividers, real touch input (Chromium CDP /
 *   WebKit's input command) and the interaction harness
 * @output Interaction proofs for a divided list under a touch press: the
 *   pressed row's divider and the one above it are hidden in the frame the
 *   press is believed, with the press layer reaching over the pressed row's
 *   own; both come back in the first frame of the release; the last row's
 *   layer never reaches past the list; a storyboard of rest, press and the
 *   release's first frame
 * @position Interaction evidence for ListItem's divider styles together with
 *   the press layer (the `cell` style of utils/interactionOverlay.stylex.ts).
 *   The behaviour is the one touch model, under any finger: the cases open
 *   the story as WebKit on iOS (./touchStory.ts), one as Android, and a mouse
 *   case shows the dividers staying drawn
 *
 * UIKit's reference: a highlighted cell hides its own separator and the one
 * above it, unanimated, in the frame the highlight appears; on an animated
 * deselect both return in the first frame while the gray is still fading.
 * The states are read from the engine's computed styles, which carry the
 * real cascade (layers, specificity), and photographed in the storyboard.
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  holdAnimations,
  releaseAnimations,
  seekAnimations,
  Storyboard,
  tap,
  touchDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';
import {openStory} from './touchStory';

const storybook = withStorybook(test);

const STORY = 'core-list--with-media';
const HOLD_MS = 400;
/** Past the press onset (150 ms), well before the lift. */
const PRESSED_AT_MS = 260;

const rows = (page: Page) => page.locator('li[data-astryx-pressable]');

interface RowState {
  readonly press: string | null;
  /** The divider at the row's bottom edge, as painted. */
  readonly divider: string;
  readonly dividerWidth: string;
  /** Where the press layer's bottom edge sits, relative to the row's padding box. */
  readonly layerBottom: string;
  readonly layerOpacity: string;
}

async function rowStates(page: Page): Promise<RowState[]> {
  return rows(page).evaluateAll(elements =>
    elements.map(el => {
      const style = getComputedStyle(el);
      const layer = getComputedStyle(el, '::before');
      return {
        press: el.getAttribute('data-astryx-press'),
        divider: style.borderBottomColor,
        dividerWidth: style.borderBottomWidth,
        layerBottom: layer.bottom,
        layerOpacity: layer.opacity,
      };
    }),
  );
}

const TRANSPARENT = 'rgba(0, 0, 0, 0)';

async function center(row: Locator) {
  const box = await row.boundingBox();
  if (box == null) {
    throw new Error('no row');
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

/**
 * Holds row `index` with a finger and returns the rows' states while the
 * press is on and in the release's first frame (its animations held at 0).
 */
async function pressRow(page: Page, index: number) {
  const driver = await touchDriver(page);
  const at = await center(rows(page).nth(index));
  let pressed: RowState[] = [];
  let released: RowState[] = [];
  await driver.play(tap(at, {holdMs: HOLD_MS}), {
    onEvent: async (_, event) => {
      if (event === 0) {
        await page.waitForTimeout(PRESSED_AT_MS);
        pressed = await rowStates(page);
      } else {
        await holdAnimations(page);
        await seekAnimations(page, 0);
        released = await rowStates(page);
      }
    },
  });
  await releaseAnimations(page);
  return {pressed, released};
}

test('Android: a touch press hides the same dividers (one touch model)', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Android is Chromium');
  await openStory(page, storybook(), STORY);
  await expect(rows(page)).toHaveCount(3);
  const rest = await rowStates(page);
  const {pressed, released} = await pressRow(page, 1);
  expect(pressed.map(row => row.press)).toEqual([null, 'on', null]);
  expect(pressed[0].divider).toBe(TRANSPARENT);
  expect(pressed[1].divider).toBe(TRANSPARENT);
  expect(released[0].divider).toBe(rest[0].divider);
  expect(released[1].divider).toBe(rest[1].divider);
});

test('a mouse press leaves the dividers drawn: touch work costs nothing under a fine pointer', async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: false,
    isMobile: false,
    viewport: {width: 900, height: 700},
  });
  const page = await context.newPage();
  try {
    await openStory(page, storybook(), STORY);
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    await expect(rows(page)).toHaveCount(3);
    const rest = await rowStates(page);
    const box = await rows(page).nth(1).boundingBox();
    if (box == null) {
      throw new Error('no row');
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const pressed = await rowStates(page);
    await page.mouse.up();
    expect(pressed.map(row => row.divider)).toEqual(
      rest.map(row => row.divider),
    );
  } finally {
    await context.close();
  }
});

test.describe('a divided list under a touch press', () => {
  test.beforeEach(async ({page}) => {
    await openStory(page, storybook(), STORY);
    await expect(rows(page)).toHaveCount(3);
  });

  test('hides the pressed row’s divider and the one above it; the release shows both at once', async ({
    page,
  }) => {
    const rest = await rowStates(page);
    // At rest: a divider under every row but the last.
    expect(rest.map(row => row.divider === TRANSPARENT)).toEqual([
      false,
      false,
      false,
    ]);
    expect(rest.map(row => row.dividerWidth)).toEqual(['1px', '1px', '0px']);
    const resting = rest[0].divider;

    const {pressed, released} = await pressRow(page, 1);
    expect(pressed.map(row => row.press)).toEqual([null, 'on', null]);
    // The divider above the pressed row (the first row's) and its own.
    expect(pressed[0].divider).toBe(TRANSPARENT);
    expect(pressed[1].divider).toBe(TRANSPARENT);
    // The layer covers the pressed row down through its hidden divider.
    expect(pressed[1].layerOpacity).toBe('1');
    expect(pressed[1].layerBottom).toBe(`-${rest[1].dividerWidth}`);
    // Rows that are not pressed have no layer at all.
    expect(pressed[0].layerBottom).toBe('auto');

    // The first frame of the release: both dividers are back while the
    // press is still at full strength, and the layer is back inside the row.
    expect(released[1].press).toBe('fading');
    expect(released[1].layerOpacity).toBe('1');
    expect(released[0].divider).toBe(resting);
    expect(released[1].divider).toBe(resting);
    expect(released[1].layerBottom).toBe('0px');
  });

  test('the last row hides the divider above it and keeps its layer inside the list', async ({
    page,
  }) => {
    const rest = await rowStates(page);
    const {pressed} = await pressRow(page, 2);
    expect(pressed[2].press).toBe('on');
    // The second row's divider is the one above the pressed last row.
    expect(pressed[1].divider).toBe(TRANSPARENT);
    // The divider above that stays.
    expect(pressed[0].divider).toBe(rest[0].divider);
    // The last row has no divider, so its layer does not reach below it.
    expect(pressed[2].layerBottom).toBe('0px');
  });

  test('storyboard: rest, press, the release’s first frame @storyboard', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'One engine is enough for the record',
    );
    // The list the rows live in.
    const list = rows(page).first().locator('xpath=..');
    const storyboard = new Storyboard(page, {
      name: 'list-dividers-press',
      clip: list,
      columns: 3,
      // Full size: the dividers are hairlines.
      cellScale: 1,
    });
    await storyboard.capture('rest', 0, {rows: await rowStates(page)});
    const driver = await touchDriver(page);
    const at = await center(rows(page).nth(1));
    await driver.play(tap(at, {holdMs: HOLD_MS}), {
      onEvent: async (_, event) => {
        if (event === 0) {
          await page.waitForTimeout(PRESSED_AT_MS);
          await storyboard.capture('pressed', PRESSED_AT_MS, {
            rows: await rowStates(page),
          });
        } else {
          await holdAnimations(page);
          await seekAnimations(page, 0);
          await storyboard.capture('release, first frame', HOLD_MS, {
            rows: await rowStates(page),
          });
        }
      },
    });
    await releaseAnimations(page);
    await storyboard.write(testInfo);
  });
});
