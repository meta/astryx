// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file TouchTargets.interaction.browser.spec.ts
 * @input The built CheckboxInput, RadioList, CheckboxList and MultiSelector
 *   stories, real touch input and the interaction harness
 * @output Proofs of the hit band under a finger. A labelled checkbox and a
 *   radio option keep their boxes. The band is at least 44 px and never
 *   smaller than the row. It stops at half the gap to a neighbour. A tap on
 *   it picks the control. A mouse gets no band.
 * @position Real-engine layer; the unit layer is Indicator/touchTarget.test.tsx
 */

import {
  expect,
  test,
  type Browser,
  type Page,
  type TestInfo,
} from '@astryxdesign/a11y-spec/playwright';
import {
  openStory,
  touchDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

/** The minimum touch target, CSS px. */
const SIZE = 44;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function checkboxGeometry(page: Page) {
  return page
    .getByRole('checkbox')
    .first()
    .evaluate(input => {
      const rect = (el: Element) => {
        const r = el.getBoundingClientRect();
        return {x: r.x, y: r.y, width: r.width, height: r.height};
      };
      const box = input
        .closest('[data-astryx-pressable]')
        ?.querySelector('.astryx-checkbox-indicator');
      const row = input.closest('[data-astryx-pressable]');
      if (box == null || row == null) {
        throw new Error('no checkbox box or row');
      }
      return {input: rect(input), box: rect(box), row: rect(row)};
    });
}

async function radioRows(page: Page): Promise<Rect[]> {
  return page.getByRole('radio').evaluateAll(inputs =>
    inputs.map(input => {
      const row = input.closest('.astryx-item');
      if (row == null) {
        throw new Error('no radio row');
      }
      const r = row.getBoundingClientRect();
      return {x: r.x, y: r.y, width: r.width, height: r.height};
    }),
  );
}

const centre = (r: Rect) => ({x: r.x + r.width / 2, y: r.y + r.height / 2});

/** How far an element's band reaches past its box on each side, px. */
async function hitInsets(page: Page, selector: string, index = 0) {
  return page
    .locator(selector)
    .nth(index)
    .evaluate(el => {
      const band = getComputedStyle(el, '::after');
      const read = (side: 'top' | 'right' | 'bottom' | 'left') =>
        band.position === 'absolute'
          ? Math.max(0, -(parseFloat(band[side]) || 0))
          : 0;
      return {
        top: read('top'),
        right: read('right'),
        bottom: read('bottom'),
        left: read('left'),
      };
    });
}

const insetSum = (insets: Awaited<ReturnType<typeof hitInsets>>) =>
  insets.top + insets.right + insets.bottom + insets.left;

/** The insets, once the band has grown. */
async function measuredInsets(page: Page, selector: string, index = 0) {
  await expect
    .poll(async () => insetSum(await hitInsets(page, selector, index)))
    .toBeGreaterThan(0);
  return hitInsets(page, selector, index);
}

/** Whether the element under a point is inside `selector`'s nth match. */
async function ownsPoint(
  page: Page,
  selector: string,
  index: number,
  point: {x: number; y: number},
) {
  return page.evaluate(
    ({css, n, x, y}) => {
      const host = document.querySelectorAll(css)[n];
      const hit = document.elementFromPoint(x, y);
      return host != null && hit != null && host.contains(hit);
    },
    {css: selector, n: index, ...point},
  );
}

/** The same story with a mouse: the phone's viewport and scale, a fine pointer. */
async function withMouse<T>(
  browser: Browser,
  testInfo: TestInfo,
  run: (mousePage: Page) => Promise<T>,
): Promise<T> {
  const {viewport, deviceScaleFactor} = testInfo.project.use;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    hasTouch: false,
    isMobile: false,
  });
  try {
    return await run(await context.newPage());
  } finally {
    await context.close();
  }
}

/**
 * Measures with the band on every `selector` match taken away, then gives it
 * back: the same page, so the same text and scale.
 */
async function withoutLayer<T>(
  page: Page,
  selector: string,
  measure: () => Promise<T>,
): Promise<T> {
  const style = await page.addStyleTag({
    content: `${selector}::after { display: none !important; }`,
  });
  try {
    return await measure();
  } finally {
    await style.evaluate(async el => {
      (el as Element).remove();
    });
  }
}

/**
 * A finger-sized tap. Chromium moves a finger's click onto a nearby target's
 * box (touch adjustment), so there the click lands away from the press.
 * WebKit's driver taps a point.
 */
async function fingerTap(
  page: Page,
  browserName: string,
  at: {x: number; y: number},
): Promise<void> {
  if (browserName !== 'chromium') {
    const driver = await touchDriver(page);
    await driver.tap(at);
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  const finger = {x: at.x, y: at.y, radiusX: 11, radiusY: 11, force: 1};
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [finger],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await cdp.detach();
}

/** Two frames: the band measures in the frame after a change. */
async function nextFrames(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

/** The rows of the story's CheckboxList, as boxes. */
async function checkboxListRows(page: Page): Promise<Rect[]> {
  return page.locator(LIST_ROW).evaluateAll(rows =>
    rows.map(row => {
      const r = row.getBoundingClientRect();
      return {x: r.x, y: r.y, width: r.width, height: r.height};
    }),
  );
}

const CHECKBOX_ROW = '#storybook-root [data-astryx-pressable]';
const RADIO_ROW = '#storybook-root .astryx-item';
const LIST_ROW = '#storybook-root li:has(input[type="checkbox"])';

test.describe('selection controls under a finger', () => {
  test('a labelled checkbox keeps its size under a finger, and a tap just outside its box toggles it (FR42)', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-checkboxinput--default');
    const insets = await measuredInsets(page, CHECKBOX_ROW);
    const finger = await checkboxGeometry(page);
    // The band adds no layout: the same boxes without it.
    expect(finger).toEqual(
      await withoutLayer(page, CHECKBOX_ROW, async () =>
        checkboxGeometry(page),
      ),
    );
    // The input keeps its drawn size, centred on the box.
    expect(finger.input.width).toBeLessThanOrEqual(24.5);
    expect(
      Math.abs(centre(finger.input).x - centre(finger.box).x),
    ).toBeLessThanOrEqual(1);
    // The row is shorter than the minimum, so the band takes it to 44 px.
    expect(finger.row.height).toBeLessThan(SIZE);
    expect(finger.row.height + insets.top + insets.bottom).toBeCloseTo(SIZE, 0);
    const point = {
      x: Math.round(centre(finger.box).x),
      y: Math.floor(finger.row.y - insets.top / 2),
    };
    expect(point.y).toBeLessThan(finger.row.y);
    expect(await ownsPoint(page, CHECKBOX_ROW, 0, point)).toBe(true);
    const checkbox = page.getByRole('checkbox').first();
    const before = await checkbox.isChecked();
    const driver = await touchDriver(page);
    await driver.tap(point);
    await expect(checkbox).toBeChecked({checked: !before});
  });

  test('a tap that starts on the band toggles the checkbox even when its click lands on the row’s edge (FR42)', async ({
    page,
    browserName,
  }) => {
    await openStory(page, storybook(), 'core-checkboxinput--default');
    const insets = await measuredInsets(page, CHECKBOX_ROW);
    const {row, box} = await checkboxGeometry(page);
    // 1 px inside the band's outer edge: 9 px above a 24 px row.
    const point = {
      x: Math.round(centre(box).x),
      y: Math.ceil(row.y - insets.top + 1),
    };
    expect(point.y).toBeLessThan(row.y);
    expect(await ownsPoint(page, CHECKBOX_ROW, 0, point)).toBe(true);
    const checkbox = page.getByRole('checkbox').first();
    const before = await checkbox.isChecked();
    // Chromium's touch adjustment can move such a tap's click onto the row's
    // top edge. That press and click, as the engine delivers them:
    await page
      .locator(CHECKBOX_ROW)
      .first()
      .evaluate((el, at) => {
        const top = el.getBoundingClientRect().top;
        el.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            clientX: at.x,
            clientY: at.y,
            pointerType: 'touch',
            isPrimary: true,
          }),
        );
        el.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            clientX: at.x,
            clientY: top,
            detail: 1,
          }),
        );
      }, point);
    await expect(checkbox).toBeChecked({checked: !before});
    // A real finger-sized tap at the same point toggles it back.
    await fingerTap(page, browserName, point);
    await expect(checkbox).toBeChecked({checked: before});
  });

  test('a checkbox row taller than 44 px keeps a hit area equal to its own box (FR42)', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-checkboxinput--default');
    // First the short row's band, so the tall row's zero insets are a change.
    expect(insetSum(await measuredInsets(page, CHECKBOX_ROW))).toBeGreaterThan(
      0,
    );
    await page.addStyleTag({
      content: `${CHECKBOX_ROW} { min-height: 60px; }`,
    });
    await expect
      .poll(async () => insetSum(await hitInsets(page, CHECKBOX_ROW)))
      .toBe(0);
    const {row, box} = await checkboxGeometry(page);
    expect(row.height).toBeCloseTo(60, 0);
    expect(row.width).toBeGreaterThan(SIZE);
    const x = Math.round(centre(box).x);
    // The row's own edge is its target; just past it is not.
    expect(
      await ownsPoint(page, CHECKBOX_ROW, 0, {x, y: Math.ceil(row.y + 1)}),
    ).toBe(true);
    expect(
      await ownsPoint(page, CHECKBOX_ROW, 0, {x, y: Math.floor(row.y - 2)}),
    ).toBe(false);
  });

  test('RadioList rows keep their geometry under a finger, and a tap in a row’s half of the gap selects it (FR42)', async ({
    page,
  }) => {
    for (const orientation of ['vertical', 'horizontal']) {
      await openStory(page, storybook(), 'core-radiolist--default', {
        orientation,
      });
      await measuredInsets(page, RADIO_ROW);
      const finger = await radioRows(page);
      expect(finger.length).toBeGreaterThan(1);
      expect(finger).toEqual(
        await withoutLayer(page, RADIO_ROW, async () => radioRows(page)),
      );
    }
    await openStory(page, storybook(), 'core-radiolist--default');
    const [first, second] = await radioRows(page);
    const gap = second.y - (first.y + first.height);
    expect(gap).toBeGreaterThan(0);
    const insets = await measuredInsets(page, RADIO_ROW, 1);
    // The two bands meet in the middle of the gap and never overlap.
    expect(insets.top).toBeGreaterThan(0);
    expect(insets.top).toBeLessThanOrEqual(gap / 2 + 0.5);
    const point = {
      x: Math.round(second.x + second.width / 2),
      y: Math.floor(second.y - insets.top / 2),
    };
    expect(await ownsPoint(page, RADIO_ROW, 1, point)).toBe(true);
    // The other half of the gap belongs to the first row.
    expect(
      await ownsPoint(page, RADIO_ROW, 0, {
        x: point.x,
        y: Math.ceil(first.y + first.height + 0.5),
      }),
    ).toBe(true);
    const driver = await touchDriver(page);
    await driver.tap(point);
    await expect(page.getByRole('radio').nth(1)).toBeChecked();
  });

  test('a CheckboxList’s rows keep their geometry under a finger at every density', async ({
    page,
  }) => {
    for (const density of ['compact', 'balanced', 'spacious']) {
      await openStory(page, storybook(), 'core-checkboxlist--default', {
        density,
      });
      const finger = await checkboxListRows(page);
      expect(finger.length).toBeGreaterThan(1);
      expect(finger).toEqual(
        await withoutLayer(page, LIST_ROW, async () => checkboxListRows(page)),
      );
    }
  });

  test('a MultiSelector option keeps its height under a finger', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-multiselector--default');
    await page.getByRole('combobox').first().tap();
    const option = page.getByRole('option').first();
    await option.waitFor();
    const marker = await option.evaluate(el => {
      const input = el.querySelector('input[type="checkbox"]');
      if (input == null) {
        throw new Error('no checkbox in the option');
      }
      const r = input.getBoundingClientRect();
      return {
        option: el.getBoundingClientRect().height,
        input: {width: r.width, height: r.height},
      };
    });
    expect(marker.option).toBeLessThan(SIZE);
    expect(marker.input.width).toBeLessThanOrEqual(24.5);
    expect(marker.input.height).toBeLessThanOrEqual(24.5);
  });

  test('a mouse gets no band and keeps the drawn sizes (negative control)', async ({
    browser,
  }, testInfo) => {
    await withMouse(browser, testInfo, async mousePage => {
      await openStory(mousePage, storybook(), 'core-checkboxinput--default');
      expect(
        await mousePage.evaluate(() => matchMedia('(pointer: coarse)').matches),
      ).toBe(false);
      const {input, box, row} = await checkboxGeometry(mousePage);
      expect(input.width).toBeCloseTo(box.width, 0);
      expect(row.height).toBeLessThan(SIZE);
      await nextFrames(mousePage);
      expect(await hitInsets(mousePage, CHECKBOX_ROW)).toEqual({
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      });
      expect(
        await mousePage
          .locator(CHECKBOX_ROW)
          .first()
          .evaluate(el => getComputedStyle(el, '::after').content),
      ).toMatch(/^(none|normal)$/);
      await openStory(mousePage, storybook(), 'core-radiolist--default');
      await nextFrames(mousePage);
      expect(insetSum(await hitInsets(mousePage, RADIO_ROW))).toBe(0);
      expect(
        await mousePage
          .locator(RADIO_ROW)
          .first()
          .evaluate(el => getComputedStyle(el, '::after').content),
      ).toMatch(/^(none|normal)$/);
    });
  });
});
