// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LayerCloseLayout.interaction.browser.spec.ts
 * @input The Core/Popover and Core/DropdownMenu default stories, the
 *   interaction harness's Chromium rendering trace
 * @output Proves the close of an anchored layer runs the hide's own layout
 *   and no other. The trigger stops being a CSS anchor inside that layout.
 *   The read that decides it is no layout read
 * @position Interaction proofs for the layer runtime's anchor names, run in
 *   Chromium, the engine with a rendering trace
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  openStory,
  traceRendering,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

// A desktop page, as the overlay-churn perf scene measures: on a phone, a
// Popover plays its own close motion, which lays out on every frame.
test.use({
  viewport: {width: 1280, height: 800},
  isMobile: false,
  hasTouch: false,
});

const CLOSES = 5;

interface Closes {
  readonly layouts: ReadonlyArray<number>;
  readonly anchorNames: ReadonlyArray<string>;
}

// Opens and closes the layer CLOSES times. Each close, from the Escape press
// until the layer is hidden, runs under the rendering trace.
async function traceCloses(
  page: Page,
  trigger: Locator,
  shown: Locator,
): Promise<Closes> {
  const layouts: number[] = [];
  const anchorNames: string[] = [];
  for (let close = 0; close < CLOSES; close++) {
    await trigger.click();
    await expect(shown).toBeVisible();
    // The open's own frames end before the close is traced.
    await page.evaluate(
      async () =>
        new Promise(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const trace = await traceRendering(page, async () => {
      await page.keyboard.press('Escape');
      await expect(shown).toBeHidden();
    });
    layouts.push(trace.layout);
    anchorNames.push(
      await trigger.evaluate(el =>
        getComputedStyle(el).getPropertyValue('anchor-name'),
      ),
    );
  }
  return {layouts, anchorNames};
}

function median(values: ReadonlyArray<number>): number {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
}

for (const {name, story, trigger, shown} of [
  {
    name: 'a Popover',
    story: 'core-popover--default',
    trigger: (page: Page) => page.getByRole('button', {name: 'Settings'}),
    shown: (page: Page) =>
      page.locator('[popover]:has([role="dialog"])').first(),
  },
  {
    name: 'a DropdownMenu',
    story: 'core-dropdownmenu--default',
    trigger: (page: Page) => page.getByRole('button', {name: 'Actions'}),
    shown: (page: Page) => page.getByRole('menuitem', {name: 'Edit'}),
  },
]) {
  test(`the close of ${name} runs one layout and leaves its trigger no anchor`, async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
    await openStory(page, storybook(), story);
    const closes = await traceCloses(page, trigger(page), shown(page));
    const detail = JSON.stringify(closes);
    // The hide's own layout: the trace counts it.
    expect(Math.min(...closes.layouts), detail).toBeGreaterThanOrEqual(1);
    // And no other one for the trigger's anchor name.
    expect(median(closes.layouts), detail).toBe(1);
    expect(closes.anchorNames, detail).toEqual(
      Array.from({length: CLOSES}, () => 'none'),
    );
  });
}
