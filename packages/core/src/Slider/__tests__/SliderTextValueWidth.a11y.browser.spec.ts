// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SliderTextValueWidth.a11y.browser.spec.ts
 * @input Built Slider stories "Custom Step" and "Text Value Widths" in real
 *   Chromium and WebKit, left to right and right to left
 * @output Browser evidence that a text value display keeps the track's length
 *   while the value changes, so a dragged thumb stays under the pointer
 * @position Slider proof of component:Slider FR3 and FR7 for `valueDisplay="text"`
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
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

async function mount(page: Page, story: string, direction: 'ltr' | 'rtl') {
  await page.setViewportSize({width: 640, height: 480});
  await page.goto(
    `${storybook.origin}/iframe.html?id=${story}&viewMode=story&globals=direction:${direction}`,
  );
  await expect(page.locator('.astryx-slider-control').first()).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
}

/** The width of the control that holds a thumb's track. */
async function trackWidth(thumb: Locator): Promise<number> {
  return thumb.evaluate(
    el =>
      el.closest('.astryx-slider-control')?.getBoundingClientRect().width ?? 0,
  );
}

/** Presses a key on a thumb `count` times and records the track width each time. */
async function widthsWhilePressing(
  page: Page,
  thumb: Locator,
  key: string,
  count: number,
): Promise<Set<number>> {
  await thumb.focus();
  const widths = new Set([await trackWidth(thumb)]);
  for (let i = 0; i < count; i++) {
    await page.keyboard.press(key);
    widths.add(await trackWidth(thumb));
  }
  return widths;
}

for (const direction of ['ltr', 'rtl'] as const) {
  test(`the track keeps its length from 0 to 100 (${direction})`, async ({
    page,
  }) => {
    await mount(page, 'core-slider--custom-step', direction);
    const thumb = page.getByRole('slider');
    await thumb.focus();
    await page.keyboard.press('Home');
    const widths = await widthsWhilePressing(page, thumb, 'PageUp', 12);
    await expect(thumb).toHaveAttribute('aria-valuenow', '100');
    expect([...widths]).toHaveLength(1);
  });

  test(`a range's track keeps its length as both values change (${direction})`, async ({
    page,
  }) => {
    await mount(page, 'core-slider--text-value-widths', direction);
    const [start, end] = await page
      .getByRole('group', {name: 'Price range'})
      .getByRole('slider')
      .all();
    const widths = new Set([
      ...(await widthsWhilePressing(page, start, 'Home', 1)),
      ...(await widthsWhilePressing(page, end, 'End', 1)),
      ...(await widthsWhilePressing(page, start, 'PageUp', 12)),
      ...(await widthsWhilePressing(page, end, 'PageDown', 3)),
    ]);
    expect([...widths]).toHaveLength(1);
  });
}

test('a fractional step keeps the track length from 0 to 1', async ({page}) => {
  await mount(page, 'core-slider--text-value-widths', 'ltr');
  const thumb = page.getByRole('slider', {name: 'Opacity'});
  await thumb.focus();
  await page.keyboard.press('Home');
  const widths = await widthsWhilePressing(page, thumb, 'ArrowRight', 10);
  await expect(thumb).toHaveAttribute('aria-valuenow', '1');
  expect([...widths]).toHaveLength(1);
});

test('a value text wider in the middle than at the ends does not clip', async ({
  page,
}) => {
  await mount(page, 'core-slider--text-value-widths', 'ltr');
  const thumb = page.getByRole('slider', {name: 'Rating'});
  await thumb.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 4; i++) {
    const clips = await thumb.evaluate(el => {
      const text = el
        .closest('.astryx-slider')
        ?.querySelector<HTMLElement>('.astryx-slider-control ~ span');
      return text == null ? true : text.scrollWidth > text.clientWidth + 1;
    });
    expect(clips).toBe(false);
    await page.keyboard.press('ArrowRight');
  }
});

test('a dragged thumb stays under the pointer across 90 to 100', async ({
  page,
}) => {
  await mount(page, 'core-slider--custom-step', 'ltr');
  const thumb = page.getByRole('slider');
  await thumb.focus();
  await page.keyboard.press('End');
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('ArrowLeft');
  }
  await expect(thumb).toHaveAttribute('aria-valuenow', '80');
  const box = await thumb.boundingBox();
  if (box == null) {
    throw new Error('thumb has no box');
  }
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  const control = await page.locator('.astryx-slider-control').boundingBox();
  if (control == null) {
    throw new Error('control has no box');
  }
  const startWidth = control.width;
  const endX = control.x + control.width - 2;
  const steps = 10;
  const startX = box.x + box.width / 2;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(startX + ((endX - startX) * i) / steps, y);
    // The track keeps its length while the value text changes, so the value
    // the pointer's travel maps to does not shift under a held pointer.
    expect(await trackWidth(thumb)).toBe(startWidth);
  }
  const now = await thumb.boundingBox();
  if (now == null) {
    throw new Error('thumb has no box');
  }
  // At the end of the track the thumb sits under the pointer, within its own
  // half width.
  expect(Math.abs(now.x + now.width / 2 - endX)).toBeLessThanOrEqual(
    now.width / 2 + 1,
  );
  await page.mouse.up();
  await expect(thumb).toHaveAttribute('aria-valuenow', '100');
});
