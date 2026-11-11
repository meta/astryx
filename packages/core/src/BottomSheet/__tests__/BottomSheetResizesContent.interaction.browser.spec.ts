// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BottomSheetResizesContent.interaction.browser.spec.ts
 * @input Playwright, the interaction harness, the Mobile keyboard story, and
 *   a viewport the test shrinks as Chrome on Android shrinks the layout
 *   viewport under `interactive-widget=resizes-content`
 * @output Tests that a fully expanded Tall sheet's focused field lands 10 px
 *   above the keyboard's top as the layout viewport shrinks, and stays there.
 *   A field already clear of the keyboard is not moved.
 * @position Browser tests for BottomSheet's use of the keyboard module
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

// The room Chrome on Android makes for Gboard on a 412 × 915 phone.
const KEYBOARD = 300;

interface FrameSample {
  readonly innerHeight: number;
  readonly fieldBottom: number;
  readonly scrollTop: number;
}

/** Records the field's bottom and its scrolling body's scroll every frame. */
const startSampling = async (field: Locator) =>
  field.evaluate(element => {
    let body = element.parentElement;
    while (body != null && getComputedStyle(body).overflowY !== 'auto') {
      body = body.parentElement;
    }
    if (body == null) {
      throw new Error('no scrolling body');
    }
    const scroller = body;
    const samples: FrameSample[] = [];
    const sample = () => {
      samples.push({
        innerHeight: window.innerHeight,
        fieldBottom: element.getBoundingClientRect().bottom,
        scrollTop: scroller.scrollTop,
      });
      (window as unknown as {__frame: number}).__frame =
        requestAnimationFrame(sample);
    };
    sample();
    (window as unknown as {__samples: FrameSample[]}).__samples = samples;
  });

const stopSampling = async (page: Page): Promise<FrameSample[]> =>
  page.evaluate(() => {
    const target = window as unknown as {
      __frame: number;
      __samples: FrameSample[];
    };
    cancelAnimationFrame(target.__frame);
    return target.__samples;
  });

/** Waits `count` frames of the page. */
const frames = async (page: Page, count: number) =>
  page.evaluate(
    async n =>
      new Promise<void>(resolve => {
        let left = n;
        const step = () => {
          left -= 1;
          if (left <= 0) {
            resolve();
          } else {
            requestAnimationFrame(step);
          }
        };
        requestAnimationFrame(step);
      }),
    count,
  );

/** Opens the Mobile keyboard story's sheet and focuses one of its fields. */
async function focusField(page: Page, which: 'first' | 'last') {
  await openStory(page, storybook(), 'core-bottomsheet--mobile-keyboard');
  await page.getByRole('button', {name: 'Add a comment'}).click();
  const dialog = page.getByRole('dialog', {name: 'Add a comment'});
  await expect(dialog).toBeVisible();
  // Let the sheet settle fully expanded, where it reveals fields.
  await page.waitForTimeout(800);
  const fields = dialog.getByRole('textbox');
  const field = which === 'first' ? fields.first() : fields.last();
  await field.focus();
  await frames(page, 10);
  return field;
}

/** Shrinks the layout viewport by the keyboard, as resizes-content does. */
async function resizeForKeyboard(page: Page): Promise<number> {
  const size = page.viewportSize();
  if (size == null) {
    throw new Error('no viewport size');
  }
  const height = size.height - KEYBOARD;
  await page.setViewportSize({width: size.width, height});
  await frames(page, 30);
  return height;
}

test.describe('Chrome on Android under interactive-widget=resizes-content (spec:AST-099 FR8)', () => {
  test.use({hasTouch: true, isMobile: true});
  test.skip(
    ({browserName}) => browserName !== 'chromium',
    'Only Chrome on Android shrinks the layout viewport for the keyboard',
  );

  test('a Tall sheet\u2019s focused field lands 10 px above the keyboard in the frame the layout viewport shrinks, and stays there', async ({
    page,
  }) => {
    const field = await focusField(page, 'last');
    await startSampling(field);
    const keyboardTop = await resizeForKeyboard(page);
    const samples = await stopSampling(page);
    const after = samples.filter(s => s.innerHeight === keyboardTop);
    expect(after.length).toBeGreaterThan(20);
    // From the first frame drawn at the new size, the field sits 10 px above
    // the keyboard's top (the layout viewport's bottom).
    for (const s of after) {
      expect(keyboardTop - s.fieldBottom).toBeCloseTo(10, 0);
    }
    // One scroll, no second step or bounce: the body keeps one position.
    expect(new Set(after.map(s => Math.round(s.scrollTop))).size).toBe(1);
  });

  test('a Tall sheet\u2019s focused field already 10 px clear of the keyboard is not moved', async ({
    page,
  }) => {
    const field = await focusField(page, 'first');
    await startSampling(field);
    const keyboardTop = await resizeForKeyboard(page);
    const samples = await stopSampling(page);
    const before = samples.filter(s => s.innerHeight !== keyboardTop);
    const after = samples.filter(s => s.innerHeight === keyboardTop);
    const last = after.at(-1);
    const scrollBefore = before.at(-1)?.scrollTop;
    expect(after.length).toBeGreaterThan(20);
    expect(scrollBefore).toBeDefined();
    expect(
      keyboardTop - (last?.fieldBottom ?? Infinity),
    ).toBeGreaterThanOrEqual(10);
    for (const s of after) {
      expect(s.scrollTop).toBe(scrollBefore);
    }
  });
});
