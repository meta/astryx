// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TooltipTallContent.a11y.browser.spec.ts
 * @input The `Core/Tooltip` TallContent, TallContentMovingHost and
 *   TallContentReplacedTrigger stories in a built Storybook, and real mouse
 *   and keyboard input.
 * @output Real-engine proof, in Chromium and WebKit, that a tooltip taller
 *   than the room above and below its trigger opens clear of the trigger, and
 *   stays clear while it, its content, its trigger or the viewport resizes or
 *   it is remounted: it opens beside the trigger when there is room there, or
 *   on the side with more room otherwise, stays open under a still pointer
 *   (WCAG 2.2 1.4.13 Content on Hover or Focus, persistent), and scrolls its
 *   overflow inside a box that stays hoverable; and that a tooltip that fits
 *   is unchanged.
 * @position Run with `pnpm test:a11y-contract` (Chromium) and
 *   `pnpm exec playwright test TooltipTallContent --project webkit`. Which
 *   position option an engine picks, and where it leaves a box that fits no
 *   option, is layout only a real engine produces, and the engines differ.
 *
 * SYNC: Fixtures live in /apps/storybook/stories/Tooltip.stories.tsx
 *   (TallContent, TallContentMovingHost, TallContentReplacedTrigger).
 */

import {expect, test, type Page} from '@playwright/test';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
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

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  );
}

async function rect(page: Page, selector: string): Promise<Box> {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (el == null) {
      throw new Error(`${sel} is not in the document`);
    }
    const r = el.getBoundingClientRect();
    return {top: r.top, bottom: r.bottom, left: r.left, right: r.right};
  }, selector);
}

/** The story's trigger; Storybook's own buttons share the iframe. */
const TRIGGER = '#storybook-root button';
const TOOLTIP = '[role="tooltip"]';

/**
 * Count every open and close of the tooltip from here on, and record its box
 * in every frame it is open: a frame callback runs before that frame's paint,
 * so a frame that would paint the tooltip over its trigger is seen.
 */
async function watchTooltip(page: Page) {
  await page.evaluate(sel => {
    const w = window as unknown as {
      __toggles: number;
      __frames: Box[];
    };
    w.__toggles = 0;
    w.__frames = [];
    document.addEventListener(
      'toggle',
      event => {
        if ((event.target as Element).matches(sel)) {
          w.__toggles += 1;
        }
      },
      true,
    );
    const record = () => {
      const el = document.querySelector(sel);
      if (el?.matches(':popover-open')) {
        const r = el.getBoundingClientRect();
        w.__frames.push({
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
        });
      }
      requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  }, TOOLTIP);
}

/** The boxes recorded since frame `from`. */
async function framesFrom(page: Page, from = 0): Promise<Box[]> {
  return page.evaluate(
    start => (window as unknown as {__frames: Box[]}).__frames.slice(start),
    from,
  );
}

/**
 * The replacement trigger in the TallContentReplacedTrigger story, once
 * `openReplacedTrigger` has marked it.
 */
const TRIGGER_2 = '[data-test-replacement]';

interface Frame {
  tooltip: Box;
  trigger: Box;
  /** The tooltip's visible content height in that frame. */
  tooltipHeight: number;
}

/**
 * Apply `style` to the element `selector` names, then read the tooltip's and
 * that element's boxes as each of the next eight frames painted them.
 */
async function moveAndSampleFrames(
  page: Page,
  selector: string,
  style: Partial<
    Record<
      'marginBlockEnd' | 'blockSize' | 'position' | 'insetBlockStart',
      string
    >
  >,
): Promise<Frame[]> {
  return page.evaluate(
    async ({sel, tip, changes}) => {
      const box = (el: Element) => {
        const r = el.getBoundingClientRect();
        return {top: r.top, bottom: r.bottom, left: r.left, right: r.right};
      };
      const el = document.querySelector<HTMLElement>(sel);
      if (el == null) {
        throw new Error(`${sel} is not in the document`);
      }
      Object.assign(el.style, changes);
      const frames: {tooltip: Box; trigger: Box; tooltipHeight: number}[] = [];
      // A message posted from a frame callback runs as the first task after
      // that frame has painted, before the tasks the frame itself queued
      // (intersection observer callbacks among them), so it reads what the
      // frame painted.
      const afterPaint = async () =>
        new Promise<void>(resolve => {
          requestAnimationFrame(() => {
            const channel = new MessageChannel();
            channel.port1.onmessage = () => resolve();
            channel.port2.postMessage(null);
          });
        });
      for (let i = 0; i < 8; i++) {
        await afterPaint();
        const t = document.querySelector(tip);
        if (t != null) {
          frames.push({
            tooltip: box(t),
            trigger: box(el),
            tooltipHeight: (t as HTMLElement).clientHeight,
          });
        }
      }
      return frames;
    },
    {sel: selector, tip: TOOLTIP, changes: style},
  );
}

/**
 * Open the TallContentReplacedTrigger story, whose trigger sits near the
 * bottom of the viewport where the held-open tooltip fits above it, then
 * replace the trigger with a new element in the same place. Returns the
 * replacement's top.
 */
async function openReplacedTrigger(page: Page): Promise<number> {
  await page.setViewportSize({width: 1280, height: 720});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tooltip--tall-content-replaced-trigger&viewMode=story`,
  );
  await holdMotionStill(page);
  const first = page.getByRole('button', {name: 'Trigger 1'});
  await expect(first).toBeVisible();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.waitForTimeout(200);
  // It opened above the first trigger, on its standard list.
  expect(
    await page.evaluate(sel => {
      const el = document.querySelector(sel);
      return el?.hasAttribute('data-astryx-clears-anchor');
    }, TOOLTIP),
  ).toBe(false);
  await page.getByRole('button', {name: 'Replace the trigger'}).click();
  const second = page.getByRole('button', {name: 'Trigger 2'});
  await expect(second).toBeVisible();
  await second.evaluate(el => el.setAttribute('data-test-replacement', ''));
  await page.waitForTimeout(200);
  const t = await second.boundingBox();
  if (t == null) {
    throw new Error('the replacement trigger has no layout box');
  }
  expect(overlaps(await rect(page, TOOLTIP), await rect(page, TRIGGER_2))).toBe(
    false,
  );
  await expect(page.getByRole('tooltip')).toBeVisible();
  return t.y;
}

/**
 * Open the TallContent story at a viewport, scroll the trigger's centre to
 * `triggerY`, rest the pointer on the trigger and wait for the tooltip.
 * Returns how many times the tooltip toggled.
 */
async function hoverTallTrigger(
  page: Page,
  viewport: {width: number; height: number},
  triggerY: number,
  args = '',
) {
  await page.setViewportSize(viewport);
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tooltip--tall-content&viewMode=story${args ? `&args=${args}` : ''}`,
  );
  await holdMotionStill(page);
  const trigger = page.getByRole('button', {name: 'Hover for details'});
  await expect(trigger).toBeVisible();
  await page.evaluate(
    ([sel, y]) => {
      const el = document.querySelector(sel as string) as HTMLElement;
      const r = el.getBoundingClientRect();
      window.scrollBy(0, r.top + r.height / 2 - (y as number));
    },
    [TRIGGER, triggerY],
  );
  await watchTooltip(page);
  const t = await rect(page, TRIGGER);
  await page.mouse.move((t.left + t.right) / 2, (t.top + t.bottom) / 2);
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  return {tooltip, trigger: t};
}

/**
 * Sample the open tooltip under a resting pointer: it stays open, never covers
 * the trigger, and stays inside the viewport. A resting hand still jitters, so
 * the pointer moves by one pixel between samples without leaving the trigger;
 * an engine only re-targets hover on pointer movement.
 */
async function expectStillAndClear(
  page: Page,
  trigger: Box,
  viewport: {width: number; height: number},
  fromFrame = 0,
) {
  const cx = (trigger.left + trigger.right) / 2;
  const cy = (trigger.top + trigger.bottom) / 2;
  let last: Box | null = null;
  for (let i = 0; i < 12; i++) {
    await page.mouse.move(cx + (i % 2), cy);
    await page.waitForTimeout(150);
    await expect(page.getByRole('tooltip')).toBeVisible();
    const s = await rect(page, TOOLTIP);
    expect(overlaps(s, trigger), `sample ${i} covers the trigger`).toBe(false);
    expect(s.top).toBeGreaterThanOrEqual(0);
    expect(s.left).toBeGreaterThanOrEqual(0);
    expect(s.bottom).toBeLessThanOrEqual(viewport.height);
    expect(s.right).toBeLessThanOrEqual(viewport.width);
    if (last != null) {
      expect(s).toEqual(last);
    }
    last = s;
  }
  // Opened once, never closed.
  expect(
    await page.evaluate(
      () => (window as unknown as {__toggles: number}).__toggles,
    ),
  ).toBe(1);
  // No frame, the first included, painted it over the trigger.
  const frames = await framesFrom(page, fromFrame);
  expect(frames.length).toBeGreaterThan(0);
  for (const [i, frame] of frames.entries()) {
    expect(overlaps(frame, trigger), `frame ${i} covers the trigger`).toBe(
      false,
    );
  }
  return last as Box;
}

/** The box scrolls its overflow, and the pointer can move in and scroll it. */
async function expectScrollsInside(page: Page) {
  const metrics = await page.evaluate(sel => {
    const el = document.querySelector(sel) as HTMLElement;
    return {scrollHeight: el.scrollHeight, clientHeight: el.clientHeight};
  }, TOOLTIP);
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

  const s = await rect(page, TOOLTIP);
  await page.mouse.move((s.left + s.right) / 2, (s.top + s.bottom) / 2, {
    steps: 4,
  });
  await page.mouse.wheel(0, 400);
  await expect
    .poll(async () =>
      page.evaluate(
        sel => (document.querySelector(sel) as HTMLElement).scrollTop,
        TOOLTIP,
      ),
    )
    .toBeGreaterThan(0);
  await page.waitForTimeout(300);
  await expect(page.getByRole('tooltip')).toBeVisible();
}

test('desktop: a tall tooltip opens beside its trigger and stays open', async ({
  page,
}) => {
  const viewport = {width: 1280, height: 720};
  const {trigger} = await hoverTallTrigger(page, viewport, 360);
  const s = await expectStillAndClear(page, trigger, viewport);
  // Beside the trigger, on the inline axis.
  expect(s.left >= trigger.right || s.right <= trigger.left).toBe(true);
  await expectScrollsInside(page);
});

test('phone: with no room beside, it opens below when below has more room', async ({
  page,
}) => {
  const viewport = {width: 390, height: 700};
  const {trigger} = await hoverTallTrigger(page, viewport, 200);
  const s = await expectStillAndClear(page, trigger, viewport);
  expect(s.top).toBeGreaterThanOrEqual(trigger.bottom);
  await expectScrollsInside(page);
});

test('phone: with no room beside, it opens above when above has more room', async ({
  page,
}) => {
  const viewport = {width: 390, height: 700};
  const {trigger} = await hoverTallTrigger(page, viewport, 500);
  const s = await expectStillAndClear(page, trigger, viewport);
  expect(s.bottom).toBeLessThanOrEqual(trigger.top);
  await expectScrollsInside(page);
});

test('a tooltip that fits above still opens above, unscrolled', async ({
  page,
}) => {
  await page.setViewportSize({width: 900, height: 600});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tooltip--tall-content&viewMode=story&args=content:A+short+tooltip`,
  );
  await holdMotionStill(page);
  const trigger = page.getByRole('button', {name: 'Hover for details'});
  await trigger.scrollIntoViewIfNeeded();
  await trigger.hover();
  await expect(page.getByRole('tooltip')).toBeVisible();
  const t = await rect(page, TRIGGER);
  const s = await rect(page, TOOLTIP);
  expect(s.bottom).toBeLessThanOrEqual(t.top);
  const metrics = await page.evaluate(sel => {
    const el = document.querySelector(sel) as HTMLElement;
    return {scrollHeight: el.scrollHeight, clientHeight: el.clientHeight};
  }, TOOLTIP);
  expect(metrics.scrollHeight).toBe(metrics.clientHeight);
});

test('a wheel over a tooltip that fits still scrolls the page', async ({
  page,
}) => {
  const viewport = {width: 900, height: 600};
  await hoverTallTrigger(page, viewport, 300, 'content:A+short+tooltip');
  const s = await rect(page, TOOLTIP);
  // The hover bridge keeps it open while the pointer is on its surface.
  await page.mouse.move((s.left + s.right) / 2, (s.top + s.bottom) / 2, {
    steps: 4,
  });
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 300);
  await expect
    .poll(async () => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(before);
  // It has no scroll range of its own, and it is still open.
  const metrics = await page.evaluate(sel => {
    const el = document.querySelector(sel) as HTMLElement;
    return {scrollHeight: el.scrollHeight, clientHeight: el.clientHeight};
  }, TOOLTIP);
  expect(metrics.scrollHeight).toBe(metrics.clientHeight);
  await expect(page.getByRole('tooltip')).toBeVisible();
});

test('a horizontal wheel over a tall tooltip still scrolls a wide page', async ({
  page,
}) => {
  // The tooltip scrolls only on the block axis, so only that axis is
  // contained (spec:AST-025 FR14): a horizontal wheel over it moves on to the
  // page.
  const viewport = {width: 1280, height: 720};
  await page.setViewportSize(viewport);
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tooltip--tall-content&viewMode=story`,
  );
  await holdMotionStill(page);
  await page.addStyleTag({content: '#storybook-root{min-width:300vw}'});
  const trigger = page.getByRole('button', {name: 'Hover for details'});
  await expect(trigger).toBeVisible();
  await page.evaluate(sel => {
    const el = document.querySelector(sel) as HTMLElement;
    const r = el.getBoundingClientRect();
    window.scrollBy(r.left + r.width / 2 - 640, r.top + r.height / 2 - 360);
  }, TRIGGER);
  const t = await rect(page, TRIGGER);
  await page.mouse.move((t.left + t.right) / 2, (t.top + t.bottom) / 2);
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.waitForTimeout(200);
  const s = await rect(page, TOOLTIP);
  const metrics = await page.evaluate(sel => {
    const el = document.querySelector(sel) as HTMLElement;
    return {scrollHeight: el.scrollHeight, clientHeight: el.clientHeight};
  }, TOOLTIP);
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  await page.mouse.move((s.left + s.right) / 2, (s.top + s.bottom) / 2, {
    steps: 4,
  });
  const before = await page.evaluate(() => window.scrollX);
  await page.mouse.wheel(300, 0);
  await expect
    .poll(async () => page.evaluate(() => window.scrollX))
    .toBeGreaterThan(before);
});

test('content that grows while the tooltip is open never leaves it over its trigger', async ({
  page,
}) => {
  const viewport = {width: 1280, height: 720};
  const {trigger} = await hoverTallTrigger(
    page,
    viewport,
    360,
    'content:A+short+tooltip',
  );
  // It fits above, unscrolled.
  const s = await rect(page, TOOLTIP);
  expect(s.bottom).toBeLessThanOrEqual(trigger.top);
  // Record the tooltip's box from a ResizeObserver created now, after the
  // runtime's own: observers run in creation order after layout and before
  // paint, so this one sees the geometry the frame paints.
  await page.evaluate(sel => {
    const el = document.querySelector(sel) as HTMLElement;
    const w = window as unknown as {__settled: Box[]};
    w.__settled = [];
    const observer = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      w.__settled.push({
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
      });
    });
    observer.observe(el);
    if (el.firstElementChild) {
      observer.observe(el.firstElementChild);
    }
  }, TOOLTIP);
  // Let the observer deliver its initial report first.
  await page.evaluate(
    async () =>
      new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  // Sixty more lines arrive while the pointer rests on the trigger.
  await page.evaluate(sel => {
    const content = document.querySelector(sel)?.firstElementChild;
    for (let i = 1; i <= 60; i++) {
      const line = document.createElement('div');
      line.textContent = `Line ${i} that arrived while the tooltip was open`;
      content?.appendChild(line);
    }
  }, TOOLTIP);
  await page.waitForTimeout(100);
  const settled = await page.evaluate(
    () => (window as unknown as {__settled: Box[]}).__settled,
  );
  // The first entry is the observer's initial report, before the growth.
  expect(settled.length).toBeGreaterThan(1);
  for (const [i, frame] of settled.entries()) {
    expect(overlaps(frame, trigger), `frame ${i} covers the trigger`).toBe(
      false,
    );
  }
  // A frame callback runs before the observers that settle a resize, so only
  // frames after the growth settled are compared here.
  await expectStillAndClear(
    page,
    trigger,
    viewport,
    (await framesFrom(page)).length,
  );
  await expectScrollsInside(page);
});

test('a held-open tooltip whose host moves keeps its trigger clear', async ({
  page,
}) => {
  await page.setViewportSize({width: 1280, height: 720});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tooltip--tall-content-moving-host&viewMode=story`,
  );
  await holdMotionStill(page);
  await watchTooltip(page);
  const trigger = page.getByRole('button', {name: 'Tall tooltip trigger'});
  await expect(page.getByRole('tooltip')).toBeVisible();
  const t = await trigger.boundingBox();
  if (t == null) {
    throw new Error('the trigger has no layout box');
  }
  const triggerBox = {
    top: t.y,
    bottom: t.y + t.height,
    left: t.x,
    right: t.x + t.width,
  };
  await page.evaluate(sel => {
    const el = document.querySelector(sel) as HTMLElement & {__first?: true};
    el.__first = true;
  }, TOOLTIP);
  expect(overlaps(await rect(page, TOOLTIP), triggerBox)).toBe(false);

  const start = (await framesFrom(page)).length;
  await page.getByRole('button', {name: "Move the tooltip's host"}).click();
  // The layer was hosted elsewhere and remounted as a new element.
  await expect
    .poll(async () =>
      page.evaluate(sel => {
        const el = document.querySelector(sel) as HTMLElement & {
          __first?: true;
        };
        return el != null && el.__first !== true;
      }, TOOLTIP),
    )
    .toBe(true);
  await page.waitForTimeout(200);
  const moved = await framesFrom(page, start);
  expect(moved.length).toBeGreaterThan(0);
  for (const [i, frame] of moved.entries()) {
    expect(overlaps(frame, triggerBox), `frame ${i} covers the trigger`).toBe(
      false,
    );
  }
  expect(overlaps(await rect(page, TOOLTIP), triggerBox)).toBe(false);
});

test('a held-open tooltip keeps a replaced trigger clear when the replacement resizes', async ({
  page,
}) => {
  const top = await openReplacedTrigger(page);
  // It grows from 32px to 342px tall, upward from its bottom edge: its top
  // rises by 310px and the tooltip fits neither above nor below it. A ResizeObserver reports that before paint, so no frame shows the
  // overlap.
  const frames = await moveAndSampleFrames(page, TRIGGER_2, {
    blockSize: '342px',
  });
  const after = await rect(page, TRIGGER_2);
  expect(Math.round(after.top)).toBe(Math.round(top) - 310);
  for (const [i, frame] of frames.entries()) {
    expect(
      overlaps(frame.tooltip, frame.trigger),
      `frame ${i} covers the trigger`,
    ).toBe(false);
  }
  expect(overlaps(await rect(page, TOOLTIP), after)).toBe(false);
});

async function hasSwitched(page: Page): Promise<boolean | undefined> {
  return page.evaluate(
    sel =>
      document.querySelector(sel)?.hasAttribute('data-astryx-clears-anchor'),
    TOOLTIP,
  );
}

test('with motion allowed, a tooltip that fits does not switch at open, and fitting growth keeps its own size and flips', async ({
  page,
}) => {
  // The entry animation moves the tooltip toward its trigger, scaled down,
  // while it enters. The clearance read uses the settled box, so a 28px
  // tooltip that fits above its trigger stays on the standard list.
  await page.setViewportSize({width: 390, height: 700});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tooltip--tall-content&viewMode=story&args=content:A+short+tooltip`,
  );
  const button = page.getByRole('button', {name: 'Hover for details'});
  await expect(button).toBeVisible();
  await page.evaluate(sel => {
    const el = document.querySelector(sel) as HTMLElement;
    const r = el.getBoundingClientRect();
    window.scrollBy(0, r.top + r.height / 2 - 200);
  }, TRIGGER);
  const t = await rect(page, TRIGGER);
  await page.mouse.move((t.left + t.right) / 2, (t.top + t.bottom) / 2);
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.waitForTimeout(400);
  expect(await hasSwitched(page)).toBe(false);
  const open = await rect(page, TOOLTIP);
  expect(open.bottom).toBeLessThanOrEqual(t.top);
  // Grown to about 290px, which fits below (464px of room) but not above:
  // it flips below at its own size, with nothing to scroll.
  await page.evaluate(sel => {
    const content = document.querySelector(sel)?.firstElementChild;
    for (let i = 1; i <= 13; i++) {
      const line = document.createElement('div');
      line.textContent = `Line ${i}`;
      content?.appendChild(line);
    }
  }, TOOLTIP);
  await page.waitForTimeout(400);
  expect(await hasSwitched(page)).toBe(false);
  const grown = await rect(page, TOOLTIP);
  const metrics = await page.evaluate(sel => {
    const el = document.querySelector(sel) as HTMLElement;
    return {scrollHeight: el.scrollHeight, clientHeight: el.clientHeight};
  }, TOOLTIP);
  expect(grown.top).toBeGreaterThanOrEqual(t.bottom);
  expect(grown.bottom - grown.top).toBeLessThan(400);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 1);
});
