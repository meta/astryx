// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LayerEntranceLayout.interaction.browser.spec.ts
 * @input The Core/Popover, Core/DropdownMenu (default and submenu) and
 *   Core/Selector stories, the interaction harness's Chromium rendering trace
 * @output Proves an anchored layer's entrance runs no layout while it plays,
 *   on a page with a callback on every frame. Chromium lays an anchored
 *   element out again each time its own style changes, so the entrance runs
 *   on the surface inside the layer. The surface is the layer's only child
 *   and fills its box, so it scales about the same center. A failure names
 *   the task that ran each counted layout and each invalidation before it,
 *   and saves that entrance's trace
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
  layoutSources,
  openStory,
  traceRendering,
  waitForRest,
  withStorybook,
  writeEvidence,
  type RenderingTrace,
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
  // The page's events during an entrance, to explain a counted layout.
  __events: {type: string; t: number; target: string; name: string}[];
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
    w.__events = [];
    const tick = () => requestAnimationFrame(tick);
    requestAnimationFrame(tick);
    const inLayer = (target: EventTarget | null) =>
      target instanceof Element &&
      target.closest('[data-layer-anchored]') != null;
    // Names a target without a layout read.
    const nameOf = (target: EventTarget | null) => {
      if (!(target instanceof Element)) {
        return target === window ? 'window' : 'document';
      }
      const role = target.getAttribute('role');
      const layer = target.closest('[data-layer-anchored]');
      const tag = `${target.tagName.toLowerCase()}${role == null ? '' : `[${role}]`}`;
      if (layer == null) {
        return `page ${tag}`;
      }
      if (target === layer) {
        return 'layer';
      }
      return target === layer.firstElementChild ? 'surface' : `layer ${tag}`;
    };
    for (const type of [
      'animationstart',
      'animationend',
      'animationcancel',
      'transitionrun',
      'transitionend',
      'transitioncancel',
      'beforetoggle',
      'toggle',
      'focusin',
      'focusout',
      'pointerover',
      'scroll',
      'resize',
    ]) {
      addEventListener(
        type,
        event => {
          w.__events.push({
            type,
            t: performance.timeOrigin + event.timeStamp,
            target: nameOf(event.target),
            name:
              (event as AnimationEvent).animationName ??
              (event as TransitionEvent).propertyName ??
              (event as ToggleEvent).newState ??
              '',
          });
          if (w.__events.length > 200) {
            w.__events.shift();
          }
        },
        true,
      );
    }
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

interface TracedEntrance {
  readonly counts: Record<string, number>;
  readonly start: number;
  readonly end: number;
  readonly trace: RenderingTrace;
  readonly events: EntranceWindow['__events'];
}

// The rendering work inside one entrance's window. The trace keeps its
// events, so a counted layout can be explained.
async function traceEntrance(
  page: Page,
  route: EntranceRoute,
): Promise<TracedEntrance> {
  await route.prepare?.(page);
  await page.evaluate(() => {
    const w = window as unknown as EntranceWindow;
    w.__entrance = {start: 0, end: 0};
    w.__events = [];
  });
  const trace = await traceRendering(
    page,
    async () => {
      await route.open(page);
      await expect(route.shown(page)).toBeVisible();
      await page.waitForFunction(
        () => (window as unknown as EntranceWindow).__entrance.end > 0,
      );
    },
    {keepEvents: true},
  );
  const {
    __entrance: {start, end},
    __events: events,
  } = await page.evaluate(() => {
    const w = window as unknown as EntranceWindow;
    return {__entrance: w.__entrance, __events: w.__events};
  });
  expect(start).toBeGreaterThan(0);
  return {counts: countBetween(trace, start, end), start, end, trace, events};
}

// Each counted layout of an entrance, with the task that ran it and the
// invalidations before it. Times are ms from the entrance's start.
function explainLayouts(entrance: TracedEntrance, open: number): string {
  const {start, end, trace, events} = entrance;
  const rel = (t: number) => `${(t - start).toFixed(1)} ms`;
  const lines = [`Entrance ${open + 1} (${rel(end)} long):`];
  for (const source of layoutSources(trace, start, end)) {
    lines.push(`  Layout at ${rel(source.t)}, in: ${source.task.join(' > ')}`);
    for (const invalidation of source.invalidations) {
      lines.push(
        `    after ${invalidation.what} at ${rel(invalidation.t)}, in: ${invalidation.task.join(' > ')}`,
      );
    }
  }
  lines.push(
    `  Page events: ${events
      .filter(event => event.t >= start - 50 && event.t <= end)
      .map(e => `${rel(e.t)} ${e.type} ${e.target} ${e.name}`.trim())
      .join('; ')}`,
  );
  return lines.join('\n');
}

for (const route of routes.filter(route => !route.hasOwnTransition)) {
  test(`${route.name}: the entrance runs no layout while it plays`, async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
    await openStory(page, storybook(), route.story);
    await watchEntrances(page);
    const layouts: number[] = [];
    const restyles: number[] = [];
    const explanations: string[] = [];
    for (let open = 0; open < OPENS; open++) {
      const during = await traceEntrance(page, route);
      layouts.push(during.counts.Layout ?? 0);
      restyles.push(during.counts.UpdateLayoutTree ?? 0);
      if ((during.counts.Layout ?? 0) > 0) {
        explanations.push(explainLayouts(during, open));
        await writeEvidence(
          `layer-entrance-layout/${route.story}`,
          {
            [`entrance-${open + 1}.json`]: JSON.stringify({
              window: {start: during.start, end: during.end},
              events: during.events,
              mainThread: during.trace.mainThread,
            }),
          },
          testInfo,
        );
      }
      await closeAll(page);
    }
    // The entrance played across frames: its element restyled on several.
    expect(Math.min(...restyles)).toBeGreaterThanOrEqual(3);
    expect(layouts, explanations.join('\n')).toEqual(Array(OPENS).fill(0));
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
