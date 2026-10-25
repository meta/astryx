// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TooltipTallContentTracking.a11y.browser.spec.ts
 * @input The `Core/Tooltip` TallContent and TallContentReplacedTrigger
 *   stories in a built Storybook, and real keyboard input and scrolling.
 * @output Real-engine proof, in Chromium and WebKit, that an open tooltip
 *   that keeps its trigger clear follows a same-size trigger that moves on
 *   screen, in layout or because the page scrolled: at most the first painted
 *   frame after the move shows it over the trigger, a smooth scroll is
 *   followed through every frame and later moves are still observed (also
 *   after a scrolled container has hidden the trigger), it
 *   ends on the roomier side at a readable size, a scroll alone never
 *   switches a tooltip that fits, and placing a shown tooltip afresh keeps
 *   every animation in its content in its exact state.
 * @position Run with `pnpm test:a11y-contract` (Chromium) and
 *   `pnpm exec playwright test TooltipTallContentTracking --project webkit`.
 *   The tracking reads geometry after paint, which only a real engine paints.
 *
 * SYNC: Fixtures live in /apps/storybook/stories/Tooltip.stories.tsx
 *   (TallContent, TallContentReplacedTrigger).
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

/** At most the first painted frame after a move may show the overlap. */
function expectClearFromSecondFrame(frames: Frame[]) {
  expect(frames.length).toBe(8);
  for (const [i, frame] of frames.entries()) {
    if (i === 0) {
      continue;
    }
    expect(
      overlaps(frame.tooltip, frame.trigger),
      `painted frame ${i + 1} after the move covers the trigger`,
    ).toBe(false);
  }
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

test('a trigger that moves in layout while its tooltip is open, without resizing or scrolling, is kept clear', async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({width: 1280, height: 720});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tooltip--tall-content&viewMode=story&args=content:A+short+tooltip`,
  );
  await holdMotionStill(page);
  const trigger = page.getByRole('button', {name: 'Hover for details'});
  await expect(trigger).toBeVisible();
  // The trigger's top at 650px, near the bottom of a 720px viewport.
  await page.evaluate(sel => {
    const el = document.querySelector(sel) as HTMLElement;
    window.scrollBy(0, el.getBoundingClientRect().top - 650);
  }, TRIGGER);
  // Opened from the keyboard, so no pointer is involved.
  await trigger.focus();
  await expect(page.getByRole('tooltip')).toBeVisible();
  // Its content becomes 368px tall: it still fits above the trigger.
  await page.evaluate(sel => {
    const content = document.querySelector(sel)?.firstElementChild;
    for (let i = 1; i <= 17; i++) {
      const line = document.createElement('div');
      line.textContent = `Line ${i}`;
      content?.appendChild(line);
    }
  }, TOOLTIP);
  await page.waitForTimeout(200);
  const before = await rect(page, TRIGGER);
  expect(overlaps(await rect(page, TOOLTIP), before)).toBe(false);
  const scrollY = await page.evaluate(() => window.scrollY);

  // The same-size trigger moves up to 340px in layout. Nothing resizes or
  // scrolls; now the tooltip fits neither above nor below it. Only an
  // intersection observer reports that move, after the frame that shows it
  // has painted, so at most that first painted frame may show the overlap;
  // the frame after it must not.
  const frames = await moveAndSampleFrames(page, TRIGGER, {
    position: 'relative',
    insetBlockStart: '-310px',
  });
  // WebKit scrolls the page itself when an open popover's anchor moves (it
  // does on the base too), so the trigger's move is measured in the document.
  const after = await rect(page, TRIGGER);
  const scrolled = (await page.evaluate(() => window.scrollY)) - scrollY;
  expect(Math.round(after.top + scrolled)).toBe(Math.round(before.top) - 310);
  if (browserName === 'chromium') {
    // A pure layout move: nothing scrolled.
    expect(scrolled).toBe(0);
  }
  expect(after.bottom - after.top).toBe(before.bottom - before.top);
  expectClearFromSecondFrame(frames);
  await expect(page.getByRole('tooltip')).toBeVisible();
  expect(overlaps(await rect(page, TOOLTIP), after)).toBe(false);
});

test('a held-open tooltip keeps a replaced trigger clear when the replacement moves', async ({
  page,
}) => {
  const top = await openReplacedTrigger(page);
  const frames = await moveAndSampleFrames(page, TRIGGER_2, {
    marginBlockEnd: '310px',
  });
  const after = await rect(page, TRIGGER_2);
  expect(Math.round(after.top)).toBe(Math.round(top) - 310);
  expect(Math.round(after.bottom - after.top)).toBe(32);
  expectClearFromSecondFrame(frames);
  expect(overlaps(await rect(page, TOOLTIP), after)).toBe(false);
});

/**
 * From the second painted frame after a move, the tooltip is clear of the
 * trigger, inside the viewport, on the block side with more room, and tall
 * enough to read.
 */
function expectReadableOnRoomierSide(frames: Frame[], viewportHeight: number) {
  expectClearFromSecondFrame(frames);
  for (const [i, {tooltip, trigger, tooltipHeight}] of frames.entries()) {
    if (i === 0) {
      continue;
    }
    expect(tooltip.top).toBeGreaterThanOrEqual(0);
    expect(tooltip.bottom).toBeLessThanOrEqual(viewportHeight);
    expect(
      tooltipHeight,
      `painted frame ${i + 1} squeezes the tooltip to ${tooltipHeight}px`,
    ).toBeGreaterThan(200);
    if (trigger.top > viewportHeight - trigger.bottom) {
      expect(tooltip.bottom).toBeLessThanOrEqual(trigger.top);
    } else {
      expect(tooltip.top).toBeGreaterThanOrEqual(trigger.bottom);
    }
  }
}

/**
 * Focus the trigger of a 60-line tooltip on a phone, with the trigger's centre
 * at `triggerY`, and wait until the tooltip has switched to its anchor-clear
 * list.
 */
async function focusTallTriggerOnPhone(page: Page, triggerY: number) {
  await page.setViewportSize({width: 390, height: 700});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tooltip--tall-content&viewMode=story`,
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
  await trigger.focus();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.waitForTimeout(200);
  expect(
    await page.evaluate(
      sel =>
        document.querySelector(sel)?.hasAttribute('data-astryx-clears-anchor'),
      TOOLTIP,
    ),
  ).toBe(true);
}

test('a switched tooltip whose trigger moves toward the far edge moves to the roomier side, readable', async ({
  page,
}) => {
  // The 390×700 case: opened below a trigger in the upper half, the tooltip
  // must not stay below, squeezed to a sliver, once the trigger moves down.
  await focusTallTriggerOnPhone(page, 200);
  const before = await rect(page, TOOLTIP);
  const trigger = await rect(page, TRIGGER);
  expect(before.top).toBeGreaterThanOrEqual(trigger.bottom);
  const frames = await moveAndSampleFrames(page, TRIGGER, {
    position: 'relative',
    insetBlockStart: '460px',
  });
  expectReadableOnRoomierSide(frames, 700);
});

test('a switched tooltip whose trigger moves the other way moves to the roomier side, readable', async ({
  page,
}) => {
  // Opened above a trigger in the lower half, then the trigger moves up.
  await focusTallTriggerOnPhone(page, 500);
  const before = await rect(page, TOOLTIP);
  const trigger = await rect(page, TRIGGER);
  expect(before.bottom).toBeLessThanOrEqual(trigger.top);
  const frames = await moveAndSampleFrames(page, TRIGGER, {
    position: 'relative',
    insetBlockStart: '-400px',
  });
  expectReadableOnRoomierSide(frames, 700);
});

test('a tooltip that switches lists after it has painted is placed afresh, not left on its old option', async ({
  page,
}) => {
  // A held-open short tooltip paints above its trigger, then grows to 368px
  // and its trigger moves up: the old option leaves the box past the top of
  // the viewport, so the tooltip switches lists while it is showing.
  await page.setViewportSize({width: 1280, height: 720});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tooltip--tall-content&viewMode=story&args=content:A+short+tooltip;isOpen:!true`,
  );
  await holdMotionStill(page);
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.evaluate(sel => {
    const el = document.querySelector(sel) as HTMLElement;
    window.scrollBy(0, el.getBoundingClientRect().top - 650);
  }, TRIGGER);
  await page.waitForTimeout(200);
  await page.evaluate(sel => {
    const content = document.querySelector(sel)?.firstElementChild;
    for (let i = 1; i <= 17; i++) {
      const line = document.createElement('div');
      line.textContent = `Line ${i}`;
      content?.appendChild(line);
    }
  }, TOOLTIP);
  await page.waitForTimeout(200);
  const frames = await moveAndSampleFrames(page, TRIGGER, {
    position: 'relative',
    insetBlockStart: '-310px',
  });
  expectClearFromSecondFrame(frames);
  for (const {tooltip} of frames.slice(1)) {
    expect(tooltip.top).toBeGreaterThanOrEqual(0);
    expect(tooltip.bottom).toBeLessThanOrEqual(720);
  }
});

/**
 * Open the held-open TallContent story with `content` at `viewport`, with the
 * trigger's centre at `triggerY`.
 */
async function openHeldTooltip(
  page: Page,
  viewport: {width: number; height: number},
  content: string,
  triggerY: number,
) {
  await page.setViewportSize(viewport);
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tooltip--tall-content&viewMode=story&args=isOpen:!true${content ? `;content:${content}` : ''}`,
  );
  await holdMotionStill(page);
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.evaluate(
    ([sel, y]) => {
      const el = document.querySelector(sel as string) as HTMLElement;
      const r = el.getBoundingClientRect();
      window.scrollBy(0, r.top + r.height / 2 - (y as number));
    },
    [TRIGGER, triggerY],
  );
  await page.waitForTimeout(300);
}

async function hasSwitched(page: Page): Promise<boolean | undefined> {
  return page.evaluate(
    sel =>
      document.querySelector(sel)?.hasAttribute('data-astryx-clears-anchor'),
    TOOLTIP,
  );
}

test('a scroll never switches a tooltip that fits, so it still flips below when it grows', async ({
  page,
}) => {
  // A short tooltip opened by keyboard focus above a trigger near the top.
  await page.setViewportSize({width: 1280, height: 720});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tooltip--tall-content&viewMode=story&args=content:A+short+tooltip`,
  );
  await holdMotionStill(page);
  const button = page.getByRole('button', {name: 'Hover for details'});
  await expect(button).toBeVisible();
  await page.evaluate(sel => {
    const el = document.querySelector(sel) as HTMLElement;
    const r = el.getBoundingClientRect();
    window.scrollBy(0, r.top + r.height / 2 - 200);
  }, TRIGGER);
  await button.focus();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.waitForTimeout(200);
  const atOpen = await hasSwitched(page);
  // Small scroll steps, each one painted, with the tooltip open throughout.
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollBy(0, 6));
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(200);
  expect(await hasSwitched(page)).toBe(atOpen);
  // Grown past the room above, it stays clear of its trigger and in view.
  await page.evaluate(sel => {
    const content = document.querySelector(sel)?.firstElementChild;
    for (let i = 1; i <= 12; i++) {
      const line = document.createElement('div');
      line.textContent = `Line ${i}`;
      content?.appendChild(line);
    }
  }, TOOLTIP);
  await page.waitForTimeout(300);
  const tooltip = await rect(page, TOOLTIP);
  const trigger = await rect(page, TRIGGER);
  expect(overlaps(tooltip, trigger)).toBe(false);
  expect(tooltip.top).toBeGreaterThanOrEqual(0);
  expect(tooltip.bottom).toBeLessThanOrEqual(720);
  // On the standard list it flips below, as any layer does, rather than
  // moving beside its trigger.
  expect(atOpen).toBe(false);
  expect(tooltip.top).toBeGreaterThanOrEqual(trigger.bottom);
  expect(tooltip.left).toBeLessThan(trigger.right);
  expect(await hasSwitched(page)).toBe(false);
});

test('a scroll that moves a tall tooltip’s trigger never leaves the tooltip over it past the first painted frame, and it ends on the roomier side', async ({
  page,
}) => {
  // The 60-line tooltip, switched and below a trigger in the upper half of a
  // phone; the page scrolls in steps that carry the trigger down the screen,
  // past the middle, until the room above is the larger.
  await openHeldTooltip(page, {width: 390, height: 700}, '', 150);
  expect(await hasSwitched(page)).toBe(true);
  for (let step = 0; step < 4; step++) {
    const frames = await page.evaluate(
      async ({sel, tip}) => {
        const box = (el: Element) => {
          const r = el.getBoundingClientRect();
          return {top: r.top, bottom: r.bottom, left: r.left, right: r.right};
        };
        window.scrollBy(0, -110);
        const out: {tooltip: Box; trigger: Box}[] = [];
        for (let i = 0; i < 4; i++) {
          await new Promise<void>(resolve => {
            requestAnimationFrame(() => {
              const channel = new MessageChannel();
              channel.port1.onmessage = () => resolve();
              channel.port2.postMessage(null);
            });
          });
          const t = document.querySelector(tip);
          const a = document.querySelector(sel);
          if (t != null && a != null) {
            out.push({tooltip: box(t), trigger: box(a)});
          }
        }
        return out;
      },
      {sel: TRIGGER, tip: TOOLTIP},
    );
    expect(frames.length).toBe(4);
    for (const [i, frame] of frames.entries()) {
      if (i === 0) {
        continue;
      }
      expect(
        overlaps(frame.tooltip, frame.trigger),
        `scroll step ${step + 1}, painted frame ${i + 1} covers the trigger`,
      ).toBe(false);
    }
  }
  const trigger = await rect(page, TRIGGER);
  const tooltip = await rect(page, TOOLTIP);
  expect(trigger.top).toBeGreaterThan(700 - trigger.bottom);
  expect(tooltip.bottom).toBeLessThanOrEqual(trigger.top);
});

test('a smooth scroll that carries a tall tooltip’s trigger leaves it clear and in view, and a later scroll is still followed', async ({
  page,
}) => {
  // The 60-line tooltip, switched and below a trigger near the top of a
  // phone. One smooth scroll carries the trigger 440px down the screen over
  // many frames; the observer must follow every frame of it, not only the
  // first, and stay armed for the next move.
  await openHeldTooltip(page, {width: 390, height: 700}, '', 150);
  expect(await hasSwitched(page)).toBe(true);
  const settle = async () =>
    page.evaluate(async () => {
      const frame = async () =>
        new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      let last = Number.NaN;
      let still = 0;
      while (still < 5) {
        await frame();
        still = window.scrollY === last ? still + 1 : 0;
        last = window.scrollY;
      }
    });
  await page.evaluate(() => window.scrollBy({top: -440, behavior: 'smooth'}));
  await settle();
  let trigger = await rect(page, TRIGGER);
  let tooltip = await rect(page, TOOLTIP);
  expect(trigger.top).toBeGreaterThan(500);
  expect(overlaps(tooltip, trigger), 'covers the trigger').toBe(false);
  expect(tooltip.top).toBeGreaterThanOrEqual(0);
  expect(tooltip.bottom).toBeLessThanOrEqual(700);
  expect(tooltip.bottom - tooltip.top).toBeGreaterThan(200);

  // A later instant scroll that would carry the tooltip past the top of the
  // viewport is still observed and corrected by the second painted frame.
  const frames = await page.evaluate(
    async ({sel, tip}) => {
      const box = (el: Element) => {
        const r = el.getBoundingClientRect();
        return {top: r.top, bottom: r.bottom, left: r.left, right: r.right};
      };
      window.scrollBy(0, 240);
      const out: {tooltip: Box; trigger: Box}[] = [];
      for (let i = 0; i < 4; i++) {
        await new Promise<void>(resolve => {
          requestAnimationFrame(() => {
            const channel = new MessageChannel();
            channel.port1.onmessage = () => resolve();
            channel.port2.postMessage(null);
          });
        });
        const t = document.querySelector(tip);
        const a = document.querySelector(sel);
        if (t != null && a != null) {
          out.push({tooltip: box(t), trigger: box(a)});
        }
      }
      return out;
    },
    {sel: TRIGGER, tip: TOOLTIP},
  );
  expect(frames.length).toBe(4);
  for (const [i, frame] of frames.entries()) {
    if (i === 0) {
      continue;
    }
    expect(
      overlaps(frame.tooltip, frame.trigger),
      `painted frame ${i + 1} covers the trigger`,
    ).toBe(false);
    expect(
      frame.tooltip.top,
      `painted frame ${i + 1} leaves the viewport`,
    ).toBeGreaterThanOrEqual(0);
    expect(frame.tooltip.bottom).toBeLessThanOrEqual(700);
  }
  await settle();
  trigger = await rect(page, TRIGGER);
  tooltip = await rect(page, TOOLTIP);
  expect(overlaps(tooltip, trigger)).toBe(false);
  expect(tooltip.bottom - tooltip.top).toBeGreaterThan(200);
});

test('a trigger that a scrolled container hides for several seconds is followed again when it scrolls back into view', async ({
  page,
}) => {
  // The 60-line tooltip, held open, with the page inside a 700px scroll
  // container on a phone. The container scrolls the trigger out of its view
  // for longer than any short retry would wait, then scrolls it back to
  // where the room above is the larger.
  await page.setViewportSize({width: 390, height: 700});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tooltip--tall-content&viewMode=story&args=isOpen:!true`,
  );
  await holdMotionStill(page);
  await page.addStyleTag({
    content: '#storybook-root{height:700px;overflow:auto}',
  });
  await expect(page.getByRole('tooltip')).toBeVisible();
  // Scroll the container so the trigger's centre lands at `y` in the
  // viewport.
  const scrollTriggerTo = async (y: number) =>
    page.evaluate(
      ([sel, y]) => {
        const el = document.querySelector(sel as string);
        if (el == null) {
          return;
        }
        const r = el.getBoundingClientRect();
        document
          .getElementById('storybook-root')
          ?.scrollBy(0, r.top + r.height / 2 - (y as number));
      },
      [TRIGGER, y],
    );
  // Making the container clips the trigger for a moment; let any recheck of
  // that settle before the case starts.
  await scrollTriggerTo(150);
  await page.waitForTimeout(1500);
  expect(await hasSwitched(page)).toBe(true);

  await scrollTriggerTo(-150);
  await page.waitForTimeout(3500);
  expect((await rect(page, TRIGGER)).bottom).toBeLessThan(0);

  await scrollTriggerTo(590);
  await page.waitForTimeout(300);
  const trigger = await rect(page, TRIGGER);
  const tooltip = await rect(page, TOOLTIP);
  expect(trigger.top).toBeGreaterThan(500);
  expect(overlaps(tooltip, trigger), 'covers the trigger').toBe(false);
  expect(tooltip.top).toBeGreaterThanOrEqual(0);
  expect(tooltip.bottom).toBeLessThanOrEqual(700);
  expect(tooltip.bottom - tooltip.top).toBeGreaterThan(200);
});

test('placing a shown tooltip afresh never replays its entry animation', async ({
  page,
  browserName,
}) => {
  // Motion allowed: the entry fade plays once, at open. A keyboard-focused
  // short tooltip grows, then its trigger moves up so the old option leaves
  // it past the top of the viewport: it switches lists after it has painted,
  // and that re-placement must not fade it in again.
  await page.setViewportSize({width: 1280, height: 720});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tooltip--tall-content&viewMode=story&args=content:A+short+tooltip`,
  );
  const button = page.getByRole('button', {name: 'Hover for details'});
  await expect(button).toBeVisible();
  await page.evaluate(sel => {
    const el = document.querySelector(sel) as HTMLElement;
    window.scrollBy(0, el.getBoundingClientRect().top - 650);
  }, TRIGGER);
  await button.focus();
  await expect(page.getByRole('tooltip')).toBeVisible();
  // Let the entry fade finish.
  await page.waitForTimeout(600);
  await page.evaluate(sel => {
    const content = document.querySelector(sel)?.firstElementChild;
    for (let i = 1; i <= 17; i++) {
      const line = document.createElement('div');
      line.textContent = `Line ${i}`;
      content?.appendChild(line);
    }
  }, TOOLTIP);
  await page.waitForTimeout(300);
  const opacities = await page.evaluate(
    async ({sel, tip}) => {
      const trigger = document.querySelector(sel) as HTMLElement;
      const tooltip = document.querySelector(tip) as HTMLElement;
      trigger.style.position = 'relative';
      trigger.style.insetBlockStart = '-310px';
      const out: number[] = [];
      for (let i = 0; i < 12; i++) {
        await new Promise<void>(resolve => {
          requestAnimationFrame(() => {
            const channel = new MessageChannel();
            channel.port1.onmessage = () => resolve();
            channel.port2.postMessage(null);
          });
        });
        out.push(Number(getComputedStyle(tooltip).opacity));
      }
      return {
        out,
        switched: tooltip.hasAttribute('data-astryx-clears-anchor'),
      };
    },
    {sel: TRIGGER, tip: TOOLTIP},
  );
  if (browserName === 'chromium') {
    // Chromium keeps the tooltip on its old option until the runtime
    // switches and re-places it; WebKit re-runs the standard list itself when
    // the trigger moves, so there it never fails and is never re-placed.
    expect(opacities.switched).toBe(true);
  }
  for (const [i, opacity] of opacities.out.entries()) {
    expect(opacity, `painted frame ${i + 1}`).toBe(1);
  }
});

/**
 * The animation-state regression for the re-placement, driven by what the
 * engine exposes. In the page it lists every accessor with a setter on a CSS
 * animation's and its keyframe effect's prototype chains, plus every field of
 * the effect's timing, and fails if any has no row here. Each row gives one
 * content element's animation a non-default value for that member (or a
 * method-only state), and the test checks that the element's whole
 * animation state is the same after the after-paint re-placement as before.
 */
const STATE_ROWS: Record<
  string,
  {css?: string; extraCss?: string; set?: string}
> = {
  // Animation accessors.
  currentTime: {set: 'a.currentTime = 4321'},
  startTime: {set: 'a.startTime = document.timeline.currentTime - 2500'},
  playbackRate: {set: 'a.playbackRate = 2'},
  id: {set: "a.id = 'kept'"},
  onfinish: {set: 'a.onfinish = window.__handler'},
  oncancel: {set: 'a.oncancel = window.__handler'},
  onremove: {set: 'a.onremove = window.__handler'},
  timeline: {
    set: 'a.timeline = new ScrollTimeline({source: document.documentElement})',
  },
  rangeStart: {
    css: 'animation-timeline:scroll(nearest block);animation-range:entry 10% exit 80%',
    set: "a.rangeStart = 'cover 20%'",
  },
  rangeEnd: {
    css: 'animation-timeline:scroll(nearest block);animation-range:entry 10% exit 80%',
    set: "a.rangeEnd = 'cover 70%'",
  },
  effect: {
    set: "a.effect = new KeyframeEffect(el, [{translate: '0px'}, {translate: '30px'}], {duration: 7000, fill: 'both'})",
  },
  // Keyframe effect accessors.
  target: {set: 'a.effect.target = el.nextElementSibling'},
  pseudoElement: {
    extraCss: '[data-row="pseudoElement"]::before{content:"·"}',
    set: "a.effect.pseudoElement = '::before'",
  },
  composite: {set: "a.effect.composite = 'add'"},
  iterationComposite: {set: "a.effect.iterationComposite = 'accumulate'"},
  // Effect timing fields.
  delay: {set: 'a.effect.updateTiming({delay: 500})'},
  direction: {set: "a.effect.updateTiming({direction: 'alternate'})"},
  duration: {set: 'a.effect.updateTiming({duration: 20000})'},
  easing: {set: "a.effect.updateTiming({easing: 'ease-in'})"},
  endDelay: {set: 'a.effect.updateTiming({endDelay: 300})'},
  fill: {set: "a.effect.updateTiming({fill: 'forwards'})"},
  iterationStart: {set: 'a.effect.updateTiming({iterationStart: 0.25})'},
  iterations: {set: 'a.effect.updateTiming({iterations: 3})'},
  // Method-only state.
  keyframes: {
    set: "a.effect.setKeyframes([{translate: '0px'}, {translate: '50px'}])",
  },
  paused: {set: 'a.pause()'},
  reversed: {set: 'a.reverse()'},
  finished: {css: 'animation-duration:1ms;animation-fill-mode:forwards'},
  persisted: {set: 'a.persist()'},
  // Shapes.
  running: {},
  'stylesheet-paused': {css: 'animation-play-state:paused'},
  duplicate: {
    css: 'animation:test-shift 10s linear both,test-shift 10s linear both;animation-composition:add,add',
    set: 'el.getAnimations()[1].currentTime = Number(a.currentTime) + 3000',
  },
  descendant: {},
  script: {
    css: 'animation:none',
    set: "window.__scriptAnimation = el.animate([{translate: '0px'}, {translate: '100px'}], {duration: 10000})",
  },
  transition: {
    css: 'animation:none;transition:translate 10s linear',
    set: "el.style.translate = '100px'",
  },
};

test('placing a shown tooltip afresh keeps every animation in its content in its exact state', async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({width: 1280, height: 720});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tooltip--tall-content&viewMode=story&args=content:A+short+tooltip;isOpen:!true`,
  );
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.evaluate(sel => {
    const el = document.querySelector(sel) as HTMLElement;
    window.scrollBy(0, el.getBoundingClientRect().top - 650);
  }, TRIGGER);
  await page.waitForTimeout(300);
  await page.addStyleTag({
    content: `@keyframes test-shift{from{translate:0}to{translate:100px}}[data-row]{display:inline-block;margin-inline-end:4px;animation:test-shift 10s linear both}${Object.entries(
      STATE_ROWS,
    )
      .map(
        ([name, row]) =>
          (row.css ? `[data-row="${name}"]{${row.css}}` : '') +
          (row.extraCss ?? ''),
      )
      .join('')}`,
  });
  // One element per row (and a spare sibling to retarget to), then enough
  // lines for the switch below.
  const uncovered = await page.evaluate(
    ({sel, names}) => {
      const content = document.querySelector(sel)?.firstElementChild;
      for (const name of names) {
        let host = content;
        if (name === 'descendant') {
          for (let i = 0; i < 3; i++) {
            const wrapper = document.createElement('span');
            host?.appendChild(wrapper);
            host = wrapper;
          }
        }
        const row = document.createElement('span');
        row.dataset.row = name;
        row.textContent = name.slice(0, 2);
        host?.appendChild(row);
        const spare = document.createElement('span');
        spare.textContent = '·';
        host?.appendChild(spare);
      }
      for (let i = 1; i <= 17; i++) {
        const line = document.createElement('div');
        line.textContent = `Line ${i}`;
        content?.appendChild(line);
      }
      // What the engine exposes as writable state.
      const sample = document.querySelector('[data-row="running"]') as Element;
      const animation = sample.getAnimations()[0];
      const accessors = (object: object) => {
        const out: string[] = [];
        for (
          let proto = Object.getPrototypeOf(object);
          proto != null && proto !== Object.prototype;
          proto = Object.getPrototypeOf(proto)
        ) {
          for (const [key, d] of Object.entries(
            Object.getOwnPropertyDescriptors(proto),
          )) {
            if (d.set != null) {
              out.push(key);
            }
          }
        }
        return out;
      };
      const members = [
        ...accessors(animation),
        ...accessors(animation.effect as object),
        ...Object.keys((animation.effect as KeyframeEffect).getTiming()),
      ];
      return members.filter(member => !names.includes(member));
    },
    {sel: TOOLTIP, names: Object.keys(STATE_ROWS)},
  );
  expect(uncovered, 'writable animation members with no row').toEqual([]);
  await page.waitForTimeout(700);
  // Give each row its state. A row whose member this engine lacks (WebKit's
  // `iterationComposite` is missing from Chromium) is skipped.
  await page.evaluate(() => {
    (window as unknown as {__handler: unknown}).__handler =
      function handler() {};
  });
  const skipped: string[] = [];
  for (const [name, row] of Object.entries(STATE_ROWS)) {
    if (row.set == null) {
      continue;
    }
    const applied = await page.evaluate(
      `(() => {
        const el = document.querySelector('[data-row="${name}"]');
        const a = el.getAnimations()[0];
        if (${name === 'iterationComposite'} && !('iterationComposite' in a.effect)) {
          return false;
        }
        ${row.set};
        return true;
      })()`,
    );
    if (applied !== true) {
      skipped.push(name);
    }
  }
  await page.evaluate(() => {
    (window as unknown as {__runningBefore: unknown}).__runningBefore = (
      document.querySelector('[data-row="running"]') as Element
    ).getAnimations()[0];
  });
  await page.waitForTimeout(100);
  const read = async () =>
    page.evaluate(names => {
      const handler = (window as unknown as {__handler: unknown}).__handler;
      type Serialized =
        | string
        | number
        | boolean
        | null
        | undefined
        | {[key: string]: Serialized};
      const ser = (value: unknown): Serialized => {
        if (
          value == null ||
          typeof value === 'boolean' ||
          typeof value === 'string'
        ) {
          return value;
        }
        if (typeof value === 'number') {
          return Math.round(value * 10) / 10;
        }
        if (typeof value === 'function') {
          return value === handler ? 'handler' : 'function';
        }
        if (
          typeof CSSNumericValue !== 'undefined' &&
          value instanceof CSSNumericValue
        ) {
          return value.toString();
        }
        if (value instanceof Element) {
          return (value as HTMLElement).dataset.row ?? value.textContent;
        }
        if (Object.getPrototypeOf(value) === Object.prototype) {
          return Object.fromEntries(
            Object.entries(value).map(([k, v]) => [k, ser(v)]),
          );
        }
        return value.constructor.name;
      };
      const stateOf = (a: Animation) => {
        const effect = a.effect as KeyframeEffect;
        const out: Record<string, unknown> = {};
        for (const object of [a, effect]) {
          for (
            let proto = Object.getPrototypeOf(object);
            proto != null && proto !== Object.prototype;
            proto = Object.getPrototypeOf(proto)
          ) {
            for (const [key, d] of Object.entries(
              Object.getOwnPropertyDescriptors(proto),
            )) {
              if (d.get != null && d.set != null && !(key in out)) {
                out[key] = ser(
                  (object as unknown as Record<string, unknown>)[key],
                );
              }
            }
          }
        }
        out.timing = ser(effect.getTiming());
        out.keyframes = JSON.stringify(effect.getKeyframes());
        out.playState = a.playState;
        out.replaceState = a.replaceState;
        return out;
      };
      const rows: Record<string, Record<string, unknown>[]> = {};
      for (const name of names) {
        const el = document.querySelector(`[data-row="${name}"]`) as Element;
        // Its animations, including one moved to a pseudo-element or (for a
        // retargeted effect) to the spare sibling.
        const tooltip = document.querySelector('[role="tooltip"]') as Element;
        rows[name] = tooltip
          .getAnimations({subtree: true})
          .filter(animation => {
            const target = (animation.effect as KeyframeEffect).target;
            return target === el || target === el.nextElementSibling;
          })
          .map(stateOf);
      }
      const script = (
        document.querySelector('[data-row="script"]') as Element
      ).getAnimations()[0];
      const running = (
        document.querySelector('[data-row="running"]') as Element
      ).getAnimations()[0];
      const w = window as unknown as Record<string, unknown>;
      return {
        rows,
        at: performance.now(),
        scrollY: window.scrollY,
        scriptSame: script === w.__scriptAnimation,
        recreated: running !== w.__runningBefore,
      };
    }, Object.keys(STATE_ROWS));
  const before = await read();
  await page.evaluate(sel => {
    const el = document.querySelector(sel) as HTMLElement;
    el.style.position = 'relative';
    el.style.insetBlockStart = '-310px';
  }, TRIGGER);
  await page.waitForTimeout(450);
  if (browserName === 'chromium') {
    expect(await hasSwitched(page)).toBe(true);
  }
  const after = await read();
  // In Chromium the browser recreated the content's CSS animations: this is
  // the path that has to put them back. (WebKit re-runs the standard list
  // itself when the trigger moves, so there the tooltip is never re-placed;
  // every row must hold either way.)
  if (browserName === 'chromium') {
    expect(after.recreated).toBe(true);
  }
  expect(after.scriptSame).toBe(true);
  const elapsed = after.at - before.at;
  const failed: string[] = [];
  for (const name of Object.keys(STATE_ROWS)) {
    if (skipped.includes(name)) {
      continue;
    }
    const b = before.rows[name];
    const a = after.rows[name];
    if (a.length !== b.length) {
      failed.push(`${name}: ${b.length} animations before, ${a.length} after`);
      continue;
    }
    for (const [i, stateBefore] of b.entries()) {
      const stateAfter = a[i];
      // Times move on with the clock; every other member must be unchanged.
      const {currentTime: t0, startTime: s0, ...restBefore} = stateBefore;
      const {currentTime: t1, startTime: s1, ...restAfter} = stateAfter;
      if (JSON.stringify(restBefore) !== JSON.stringify(restAfter)) {
        failed.push(
          `${name}: ${JSON.stringify(restBefore)} -> ${JSON.stringify(restAfter)}`,
        );
        continue;
      }
      const rate = Number(stateBefore.playbackRate);
      // A scroll-driven animation's time follows the page's scroll position,
      // which WebKit moves by itself when an open popover's anchor moves.
      const scrollDriven = stateBefore.timeline !== 'DocumentTimeline';
      if (scrollDriven && after.scrollY !== before.scrollY) {
        // Its time is the browser's to change; the rest was compared above.
      } else if (typeof t0 === 'number' && typeof t1 === 'number') {
        const expected =
          stateBefore.playState === 'running' &&
          stateBefore.timeline === 'DocumentTimeline'
            ? t0 + rate * elapsed
            : t0;
        if (Math.abs(t1 - expected) > 150) {
          failed.push(
            `${name}: currentTime ${t0} -> ${t1}, expected about ${Math.round(expected)}`,
          );
        }
      } else if (t0 !== t1) {
        failed.push(`${name}: currentTime ${String(t0)} -> ${String(t1)}`);
      }
      // A finished animation's start time is the one documented limitation:
      // script cannot set a start time and a held end time together.
      if (
        stateBefore.playState !== 'finished' &&
        typeof s0 === 'number' &&
        typeof s1 === 'number' &&
        Math.abs(s1 - s0) > 50
      ) {
        failed.push(`${name}: startTime ${s0} -> ${s1}`);
      }
    }
  }
  expect(failed).toEqual([]);
  // The stylesheet still controls the animation it paused.
  await page.addStyleTag({
    content: '[data-row="stylesheet-paused"]{animation-play-state:running}',
  });
  await page.waitForTimeout(100);
  expect(
    await page.evaluate(
      () =>
        (
          document.querySelector(
            '[data-row="stylesheet-paused"]',
          ) as HTMLElement
        ).getAnimations()[0].playState,
    ),
  ).toBe('running');
});

test('a short, wide tooltip carried past the viewport edge moves to the other side at its own size', async ({
  page,
}) => {
  // A held-open tooltip too wide to go beside its trigger on a phone sits
  // above a trigger near the bottom. A scroll carries the trigger to the top,
  // so the tooltip can no longer fit above: it moves below, keeping its size
  // rather than stretching to the room there, and still keeps its size when
  // its content then grows within that room.
  await page.setViewportSize({width: 390, height: 700});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tooltip--tall-content&viewMode=story&args=isOpen:!true;content:A+short+but+wide+tooltip+whose+text+wraps+onto+a+few+lines+here`,
  );
  await holdMotionStill(page);
  await expect(page.getByRole('tooltip')).toBeVisible();
  const scrollTriggerTo = async (y: number) => {
    await page.evaluate(
      ([sel, top]) => {
        const el = document.querySelector(sel as string) as HTMLElement;
        const r = el.getBoundingClientRect();
        window.scrollBy(0, r.top + r.height / 2 - (top as number));
      },
      [TRIGGER, y],
    );
    await page.waitForTimeout(400);
  };
  await scrollTriggerTo(650);
  const before = await rect(page, TOOLTIP);
  const triggerBefore = await rect(page, TRIGGER);
  expect(before.bottom).toBeLessThanOrEqual(triggerBefore.top);
  const height = before.bottom - before.top;
  expect(height).toBeLessThan(120);
  await scrollTriggerTo(28);
  const after = await rect(page, TOOLTIP);
  const trigger = await rect(page, TRIGGER);
  expect(overlaps(after, trigger)).toBe(false);
  expect(after.top).toBeGreaterThanOrEqual(trigger.bottom);
  expect(Math.abs(after.bottom - after.top - height)).toBeLessThanOrEqual(1);
  // Grown within the room below, it still takes only the room it needs.
  await page.evaluate(sel => {
    const content = document.querySelector(sel)?.firstElementChild;
    for (let i = 1; i <= 10; i++) {
      const line = document.createElement('div');
      line.textContent = `Line ${i}`;
      content?.appendChild(line);
    }
  }, TOOLTIP);
  await page.waitForTimeout(400);
  const grown = await rect(page, TOOLTIP);
  const metrics = await page.evaluate(sel => {
    const el = document.querySelector(sel) as HTMLElement;
    return {scrollHeight: el.scrollHeight, clientHeight: el.clientHeight};
  }, TOOLTIP);
  expect(grown.top).toBeGreaterThanOrEqual(trigger.bottom);
  expect(grown.bottom - grown.top).toBeLessThan(400);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 1);
});
