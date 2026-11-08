// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LayerEntranceLayout.interaction.browser.spec.ts
 * @input The Core/Popover, Core/DropdownMenu (default and submenu) and
 *   Core/Selector stories, the interaction harness's Chromium rendering trace
 * @output Proves an anchored layer's entrance runs no layout while it plays,
 *   on a page with a callback on every frame. Chromium lays an anchored
 *   element out again each time its own style changes, so the entrance runs
 *   on the surface inside the layer. The surface is the layer's only child
 *   and fills its box, so it scales about the same center
 * @position Interaction proofs for layerAnimations.stylex.ts, run in
 *   Chromium, the engine with a rendering trace
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  countBetween,
  openStory,
  traceRendering,
  waitForRest,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

// A desktop page: on a phone, a Popover plays its own growth in place of the
// CSS entrance.
test.use({
  viewport: {width: 1280, height: 800},
  isMobile: false,
  hasTouch: false,
});

const OPENS = 3;

interface EntranceWindow {
  __entrance: {start: number; end: number};
}

interface EntranceRoute {
  readonly name: string;
  readonly story: string;
  readonly open: (page: Page) => Promise<void>;
  // An element inside the layer that the open shows.
  readonly shown: (page: Page) => Locator;
  // Runs before each open, outside the trace.
  readonly prepare?: (page: Page) => Promise<void>;
  // The layer runs a transition of its own inside the entrance's window.
  readonly hasOwnTransition?: boolean;
}

const layerOf = (locator: Locator) =>
  locator.locator('xpath=ancestor-or-self::*[@popover][1]');

const routes: ReadonlyArray<EntranceRoute> = [
  {
    name: 'Popover',
    story: 'core-popover--default',
    open: async page => page.getByRole('button', {name: 'Settings'}).click(),
    shown: page => page.locator('[popover]:has([role="dialog"])').first(),
  },
  {
    name: 'DropdownMenu',
    story: 'core-dropdownmenu--default',
    open: async page => page.getByRole('button', {name: 'Actions'}).click(),
    shown: page => page.getByRole('menuitem', {name: 'Edit'}),
  },
  {
    name: 'Selector',
    story: 'core-selector--default',
    open: async page =>
      page.locator('button[aria-haspopup="listbox"]').first().click(),
    shown: page => page.getByRole('listbox'),
    // Its list fades in, and that transition lays out once as it ends.
    hasOwnTransition: true,
  },
  {
    name: 'A DropdownMenu submenu',
    story: 'core-dropdownmenu--submenu',
    // The root menu opens and its own entrance ends first.
    prepare: async page => {
      await page.getByRole('button', {name: 'Actions'}).click();
      const row = page.getByRole('menuitem', {name: 'Rename'});
      await expect(row).toBeVisible();
      await waitForRest(layerOf(row));
    },
    open: async page => page.getByRole('menuitem', {name: 'Move to'}).click(),
    shown: page => page.getByRole('menuitem', {name: 'Folder A'}),
  },
];

// A callback on every frame, as on a page with frame work of its own, makes
// each frame a main-thread one. The entrance's window runs from its
// `animationstart` to its `animationend`, on any element in an anchored layer.
async function watchEntrances(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as EntranceWindow;
    w.__entrance = {start: 0, end: 0};
    const tick = () => requestAnimationFrame(tick);
    requestAnimationFrame(tick);
    const inLayer = (target: EventTarget | null) =>
      target instanceof Element &&
      target.closest('[data-layer-anchored]') != null;
    addEventListener(
      'animationstart',
      event => {
        if (inLayer(event.target) && w.__entrance.start === 0) {
          w.__entrance.start = performance.timeOrigin + event.timeStamp;
        }
      },
      true,
    );
    addEventListener(
      'animationend',
      event => {
        if (inLayer(event.target)) {
          w.__entrance.end = performance.timeOrigin + event.timeStamp;
        }
      },
      true,
    );
  });
}

async function closeAll(page: Page): Promise<void> {
  const open = page.locator('[data-layer-anchored]:popover-open');
  for (let press = 0; press < 3 && (await open.count()) > 0; press++) {
    await page.keyboard.press('Escape');
  }
  await expect(open).toHaveCount(0);
}

// The rendering work inside one entrance's window.
async function traceEntrance(
  page: Page,
  route: EntranceRoute,
): Promise<Record<string, number>> {
  await route.prepare?.(page);
  await page.evaluate(() => {
    (window as unknown as EntranceWindow).__entrance = {start: 0, end: 0};
  });
  const trace = await traceRendering(page, async () => {
    await route.open(page);
    await expect(route.shown(page)).toBeVisible();
    await page.waitForFunction(
      () => (window as unknown as EntranceWindow).__entrance.end > 0,
    );
  });
  const {start, end} = await page.evaluate(
    () => (window as unknown as EntranceWindow).__entrance,
  );
  expect(start).toBeGreaterThan(0);
  return countBetween(trace, start, end);
}

for (const route of routes.filter(route => !route.hasOwnTransition)) {
  test(`${route.name}: the entrance runs no layout while it plays`, async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
    await openStory(page, storybook(), route.story);
    await watchEntrances(page);
    const layouts: number[] = [];
    const restyles: number[] = [];
    for (let open = 0; open < OPENS; open++) {
      const during = await traceEntrance(page, route);
      layouts.push(during.Layout ?? 0);
      restyles.push(during.UpdateLayoutTree ?? 0);
      await closeAll(page);
    }
    // The entrance played across frames: its element restyled on several.
    expect(Math.min(...restyles)).toBeGreaterThanOrEqual(3);
    expect(layouts).toEqual(Array(OPENS).fill(0));
  });
}

for (const route of routes) {
  test(`${route.name}: the entrance runs on the layer's only child, which fills the layer's box`, async ({
    page,
  }) => {
    await openStory(page, storybook(), route.story);
    await route.prepare?.(page);
    await route.open(page);
    const shown = route.shown(page);
    await expect(shown).toBeVisible();
    const layer = layerOf(shown);
    await waitForRest(layer);
    const read = await layer.evaluate(element => {
      const box = (node: Element) => {
        const rect = node.getBoundingClientRect();
        return [rect.left, rect.top, rect.width, rect.height];
      };
      const surface = element.firstElementChild;
      const animated = [element, ...Array.from(element.querySelectorAll('*'))]
        .filter(node => getComputedStyle(node).animationName !== 'none')
        .map(node => (node === surface ? 'surface' : node.tagName));
      return {
        children: element.childElementCount,
        animated,
        layer: box(element),
        surface: surface == null ? [] : box(surface),
      };
    });
    expect(read.children).toBe(1);
    expect(read.animated).toEqual(['surface']);
    expect(read.surface).toHaveLength(4);
    read.surface.forEach((value, index) => {
      expect(Math.abs(value - read.layer[index])).toBeLessThanOrEqual(0.5);
    });
  });
}
