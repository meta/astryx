// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LayerCloseLayout.interaction.browser.spec.ts
 * @input The Core/Popover and Core/DropdownMenu default stories, the
 *   interaction harness's Chromium rendering trace
 * @output Proves the closes that move focus (Escape, a menu pick, a press on
 *   the menu's trigger) run the hide's own layout and no other. The element
 *   that held the anchor name stops being a CSS anchor inside that layout
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
  waitForRest,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

// A desktop page, as the overlay-churn-settled perf scene measures: on a phone, a
// Popover plays its own close motion, which lays out on every frame.
test.use({
  viewport: {width: 1280, height: 800},
  isMobile: false,
  hasTouch: false,
});

const CLOSES = 5;
const HOLDER = 'data-test-anchor-holder';

interface Closes {
  readonly layouts: ReadonlyArray<number>;
  readonly anchorNames: ReadonlyArray<string>;
}

interface CloseRoute {
  readonly name: string;
  readonly story: string;
  readonly trigger: (page: Page) => Locator;
  readonly shown: (page: Page) => Locator;
  // What a press closes the layer on. Without one, Escape closes it.
  readonly press?: (page: Page) => Locator;
}

// Opens and closes the layer CLOSES times. Each close, from the Escape press
// or the pointer press until the layer is hidden, runs under the rendering
// trace. Before it, the pointer rests on what it presses and the layer is at
// rest. So the trace holds no hover change and no entrance frame.
async function traceCloses(page: Page, route: CloseRoute): Promise<Closes> {
  const trigger = route.trigger(page);
  const shown = route.shown(page);
  const layouts: number[] = [];
  const anchorNames: string[] = [];
  for (let close = 0; close < CLOSES; close++) {
    await page.mouse.move(5, 5);
    await trigger.click();
    await expect(shown).toBeVisible();
    // The trigger, or the element that wraps it, holds the anchor name while
    // the layer is open.
    const held = await trigger.evaluate((element, attribute) => {
      for (
        let node: Element | null = element;
        node != null;
        node = node.parentElement
      ) {
        if (getComputedStyle(node).getPropertyValue('anchor-name') !== 'none') {
          node.setAttribute(attribute, '');
          return true;
        }
      }
      return false;
    }, HOLDER);
    expect(held, 'an anchor name while the layer is open').toBe(true);
    if (route.press != null) {
      const box = await route.press(page).boundingBox();
      if (box == null) {
        throw new Error(`nothing to press in ${route.name}`);
      }
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    }
    // A busy runner can start the entrance late. The close is traced once
    // the entrance, on the layer's surface, is at rest.
    await waitForRest(
      shown.locator('xpath=ancestor-or-self::*[@popover][1]/*[1]'),
    );
    const trace = await traceRendering(page, async () => {
      if (route.press == null) {
        await page.keyboard.press('Escape');
      } else {
        await page.mouse.down();
        await page.mouse.up();
      }
      await expect(shown).toBeHidden();
    });
    layouts.push(trace.layout);
    const holder = page.locator(`[${HOLDER}]`);
    anchorNames.push(
      await holder.evaluate((element, attribute) => {
        element.removeAttribute(attribute);
        return getComputedStyle(element).getPropertyValue('anchor-name');
      }, HOLDER),
    );
  }
  return {layouts, anchorNames};
}

function median(values: ReadonlyArray<number>): number {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
}

const popover = {
  story: 'core-popover--default',
  trigger: (page: Page) => page.getByRole('button', {name: 'Settings'}),
  shown: (page: Page) => page.locator('[popover]:has([role="dialog"])').first(),
};
const menu = {
  story: 'core-dropdownmenu--default',
  trigger: (page: Page) => page.getByRole('button', {name: 'Actions'}),
  shown: (page: Page) => page.getByRole('menuitem', {name: 'Edit'}),
};

const routes: ReadonlyArray<CloseRoute> = [
  {name: 'Escape on a Popover', ...popover},
  {name: 'Escape on a DropdownMenu', ...menu},
  {
    name: 'a pick in a DropdownMenu',
    ...menu,
    press: page => page.getByRole('menuitem', {name: 'Edit'}),
  },
  {
    name: 'a press on a DropdownMenu\u2019s trigger',
    ...menu,
    press: page => page.getByRole('button', {name: 'Actions'}),
  },
];

for (const route of routes) {
  test(`${route.name} closes with one layout and leaves its trigger no anchor`, async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
    await openStory(page, storybook(), route.story);
    const closes = await traceCloses(page, route);
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
