// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SelectionMarkFinePress.interaction.browser.spec.ts
 * @input The CheckboxInput, CheckboxList, RadioList and lab
 *   CircleCheckIndicator stories, and a mouse or a pen where the primary
 *   pointer is fine
 * @output Browser proofs: a mouse press on a checkbox, a CheckboxList row, a
 *   RadioList row or a mapped circle paints at `pointerdown`. The press
 *   controller paints it, and it fades on release. It paints once. Under Reduce
 *   Motion the release ends at once. A right click paints nothing, and a
 *   read-only row paints no row press. A pen presses a checkbox the same way
 * @position Fine-pointer half of the selection marks' press; the finger half
 *   is in CheckboxListPress.a11y.chromium.spec.ts and the indicator specs
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  openStory,
  PEN_SKIP,
  webInputDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

interface Surface {
  readonly name: string;
  readonly story: string;
  /** The element whose `::after` paints the press over the mark. */
  readonly layer: (page: Page) => Locator;
  /** Where the mouse presses. */
  readonly target: (page: Page) => Locator;
  /** The element the press controller marks. */
  readonly owner: (page: Page) => Locator;
}

/** The option's row: a CheckboxList `li`, a RadioList item. */
const optionRow = (page: Page, option: string) =>
  page
    .locator('#storybook-root .astryx-item, #storybook-root li')
    .filter({hasText: option})
    .first();

/** The wrapper whose `::after` paints over a built-in mark. */
const markWrapper = (page: Page, selector: string, option?: string) => {
  const scope = option
    ? optionRow(page, option)
    : page.locator('#storybook-root');
  return scope.locator(selector).first().locator('xpath=../..');
};

const firstPressable = (page: Page) =>
  page.locator('#storybook-root [data-astryx-pressable]').first();

const circle = (page: Page) =>
  page.locator('#storybook-root .astryx-circle-check-indicator').first();

const SURFACES: ReadonlyArray<Surface> = [
  {
    name: 'a checkbox',
    story: 'core-checkboxinput--default',
    layer: page => markWrapper(page, '.astryx-checkbox-indicator'),
    target: page => markWrapper(page, '.astryx-checkbox-indicator'),
    owner: firstPressable,
  },
  {
    name: 'a CheckboxList row’s box',
    story: 'core-checkboxlist--default',
    layer: page => markWrapper(page, '.astryx-checkbox-indicator', 'SMS'),
    target: page => optionRow(page, 'SMS'),
    owner: page => optionRow(page, 'SMS'),
  },
  {
    name: 'a RadioList row’s circle',
    story: 'core-radiolist--default',
    layer: page => markWrapper(page, '.astryx-radio-indicator', 'SMS'),
    target: page => optionRow(page, 'SMS'),
    owner: page => optionRow(page, 'SMS'),
  },
  {
    name: 'a circle mapped into a CheckboxInput',
    story: 'lab-circlecheckindicator--mapped-checkbox-input',
    layer: circle,
    target: circle,
    owner: page =>
      circle(page).locator('xpath=ancestor::*[@data-astryx-pressable][1]'),
  },
];

/** Each press state the controller writes on `owner`, in order. */
async function recordPress(owner: Locator): Promise<() => Promise<string[]>> {
  await owner.evaluate(el => {
    const seen: string[] = [];
    (window as unknown as {__pressSeen: string[]}).__pressSeen = seen;
    new MutationObserver(() => {
      seen.push(el.getAttribute('data-astryx-press') ?? '');
    }).observe(el, {attributes: true, attributeFilter: ['data-astryx-press']});
  });
  return async () =>
    owner
      .page()
      .evaluate(
        () => (window as unknown as {__pressSeen: string[]}).__pressSeen,
      );
}

/** Clicks stop at the window: the press is the subject, not the toggle. */
async function stopClicks(page: Page): Promise<void> {
  await page.evaluate(() =>
    window.addEventListener(
      'click',
      event => {
        event.preventDefault();
        event.stopPropagation();
      },
      true,
    ),
  );
}

/** The centre of a surface's target. */
async function centreOf(page: Page, surface: Surface) {
  const box = await surface.target(page).boundingBox();
  if (box == null) {
    throw new Error(`${surface.story}: nothing to press`);
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

test.describe('with a mouse', () => {
  test.use({
    isMobile: false,
    hasTouch: false,
    viewport: {width: 800, height: 600},
    deviceScaleFactor: 1,
  });

  for (const surface of SURFACES) {
    test(`a mouse press on ${surface.name} paints at once through the press model and fades on release`, async ({
      page,
    }) => {
      await openStory(page, storybook(), surface.story);
      // A fine-pointer case proves nothing under a coarse primary pointer.
      expect(
        await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
      ).toBe(false);
      await stopClicks(page);
      const layer = surface.layer(page);
      const owner = surface.owner(page);
      const at = await centreOf(page, surface);
      const seen = await recordPress(owner);
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      // The fine-pointer profile: the press paints at `pointerdown`, with no
      // delay, through the same controller as a finger's.
      await expect
        .poll(async () => owner.getAttribute('data-astryx-press'), {
          timeout: 100,
        })
        .toBe('on');
      expect(
        await layer.evaluate(
          el => getComputedStyle(el, '::after').backgroundImage,
        ),
      ).toContain('gradient');
      await page.mouse.up();
      // The same release fade as a finger's.
      await expect
        .poll(async () => owner.getAttribute('data-astryx-press'))
        .toBe('fading');
      expect(await seen()).toEqual(expect.arrayContaining(['on', 'fading']));
    });

    test(`a mouse press on ${surface.name} paints once`, async ({page}) => {
      await openStory(page, storybook(), surface.story);
      await stopClicks(page);
      const layer = surface.layer(page);
      const at = await centreOf(page, surface);
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      await expect
        .poll(async () => surface.owner(page).getAttribute('data-astryx-press'))
        .toBe('on');
      // The press paints as an image; no `:active` fill paints under it.
      expect(
        await layer.evaluate(
          el => getComputedStyle(el, '::after').backgroundColor,
        ),
      ).toBe('rgba(0, 0, 0, 0)');
      await page.mouse.up();
    });

    test(`a right click on ${surface.name} paints no press`, async ({page}) => {
      await openStory(page, storybook(), surface.story);
      await stopClicks(page);
      const owner = surface.owner(page);
      const at = await centreOf(page, surface);
      const seen = await recordPress(owner);
      await page.mouse.move(at.x, at.y);
      await page.mouse.down({button: 'right'});
      await page.waitForTimeout(150);
      expect(await owner.getAttribute('data-astryx-press')).toBeNull();
      await page.mouse.up({button: 'right'});
      expect(await seen()).toEqual([]);
    });
  }

  for (const surface of SURFACES.slice(0, 3)) {
    test(`under Reduce Motion a mouse release on ${surface.name} ends the press at once`, async ({
      page,
    }) => {
      await page.emulateMedia({reducedMotion: 'reduce'});
      await openStory(page, storybook(), surface.story);
      await stopClicks(page);
      const owner = surface.owner(page);
      const at = await centreOf(page, surface);
      const seen = await recordPress(owner);
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      await expect
        .poll(async () => owner.getAttribute('data-astryx-press'))
        .toBe('on');
      await page.mouse.up();
      // A fine pointer's release under Reduce Motion changes at once: no
      // fade.
      expect(await owner.getAttribute('data-astryx-press')).toBeNull();
      expect(await seen()).toEqual(['on', '']);
    });
  }

  test('a pen press on a checkbox paints through the same press model', async ({
    page,
  }) => {
    const input = await webInputDriver(page);
    test.skip(!input.pens, PEN_SKIP);
    await openStory(page, storybook(), 'core-checkboxinput--default');
    await stopClicks(page);
    const owner = firstPressable(page);
    const layer = markWrapper(page, '.astryx-checkbox-indicator');
    const box = await layer.boundingBox();
    if (box == null) {
      throw new Error('core-checkboxinput--default: nothing to press');
    }
    // Each press state the controller writes, with the layer's image read in
    // the same task: the pen's press must paint, not only be marked.
    const layerHandle = await layer.elementHandle();
    await owner.evaluate((el, target) => {
      const seen: {state: string; image: string}[] = [];
      (window as unknown as {__penSeen: typeof seen}).__penSeen = seen;
      new MutationObserver(() => {
        seen.push({
          state: el.getAttribute('data-astryx-press') ?? '',
          image: getComputedStyle(target as Element, '::after').backgroundImage,
        });
      }).observe(el, {
        attributes: true,
        attributeFilter: ['data-astryx-press'],
      });
    }, layerHandle);
    const at = {x: box.x + box.width / 2, y: box.y + box.height / 2};
    // A held pen: down, a still move 300 ms later, and the lift there.
    await input.pen([
      {...at, t: 0},
      {...at, t: 300},
    ]);
    const seen = await page.evaluate(
      () =>
        (window as unknown as {__penSeen: {state: string; image: string}[]})
          .__penSeen,
    );
    const on = seen.find(entry => entry.state === 'on');
    expect(on?.image ?? '', JSON.stringify(seen)).toContain('gradient');
    expect(seen.map(entry => entry.state)).toContain('fading');
  });

  test('a mouse press on a read-only CheckboxList row paints no row press, and its box keeps its own', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-checkboxlist--default', {
      isReadOnly: '!true',
    });
    await stopClicks(page);
    const row = optionRow(page, 'SMS');
    await expect(row.locator('input[aria-readonly="true"]')).toBeAttached();
    const rowBox = await row.boundingBox();
    if (rowBox == null) {
      throw new Error('core-checkboxlist--default: no row');
    }
    // The label: a read-only row takes no press.
    await page.mouse.move(
      rowBox.x + rowBox.width / 2,
      rowBox.y + rowBox.height / 2,
    );
    await page.mouse.down();
    await page.waitForTimeout(150);
    expect(await row.getAttribute('data-astryx-press')).toBeNull();
    expect(
      await row.evaluate(el => el.querySelector('[data-astryx-press]')),
    ).toBeNull();
    await page.mouse.up();
    // The box: a read-only checkbox stays enabled, so it keeps its press.
    const layer = markWrapper(page, '.astryx-checkbox-indicator', 'SMS');
    const box = await layer.boundingBox();
    if (box == null) {
      throw new Error('core-checkboxlist--default: no box');
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect
      .poll(async () =>
        layer.evaluate(
          el =>
            el
              .closest('[data-astryx-pressable]')
              ?.getAttribute('data-astryx-press') ?? null,
        ),
      )
      .toBe('on');
    expect(
      await layer.evaluate(
        el => getComputedStyle(el, '::after').backgroundImage,
      ),
    ).toContain('gradient');
    expect(await row.getAttribute('data-astryx-press')).toBeNull();
    await page.mouse.up();
  });
});
