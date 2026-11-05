// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/Chat core/Tooltip core/HoverCard ^packages/core/src/utils/focusOutline ^apps/storybook/stories/FocusRingTextTriggers

/**
 * @file FocusRingTextTriggers.a11y.chromium.spec.ts
 * @input The built A11y/FocusRingTextTriggers story; real Chromium keyboard
 *   focus and computed styles
 * @output Browser evidence that the chat log and the text-only Tooltip and
 *   HoverCard trigger spans draw the shared token ring under :focus-visible,
 *   that a theme's focus tokens restyle all three, and that the log's ring
 *   stays inside the area that scrolls it
 * @position Chromium proof for the focus ring on tab stops Astryx adds. jsdom
 *   does not match :focus-visible, so ChatMessageList.focusRing.test.tsx can
 *   only check the composed classes.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
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

test.use({viewport: {width: 1024, height: 768}});

// Tab order in the story: the log, then the Tooltip span, then the HoverCard
// span.
const STOPS = ['log', 'tooltip', 'hovercard'] as const;

interface Ring {
  focusVisible: boolean;
  width: string;
  style: string;
  color: string;
  offset: string;
  tokenWidth: string;
  tokenColor: string;
}

/** The focused element's ring, and the ring the focus tokens resolve to. */
async function focusedRing(page: Page): Promise<Ring> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const style = getComputedStyle(el);
    // Resolve the tokens to computed values with a probe in the same scope.
    const probe = document.createElement('span');
    probe.style.outlineStyle = 'solid';
    probe.style.outlineWidth = 'var(--focus-outline-width)';
    probe.style.outlineColor = 'var(--focus-outline-color)';
    (el.parentElement ?? document.body).appendChild(probe);
    const resolved = getComputedStyle(probe);
    const ring = {
      focusVisible: el.matches(':focus-visible'),
      width: style.outlineWidth,
      style: style.outlineStyle,
      color: style.outlineColor,
      offset: style.outlineOffset,
      tokenWidth: resolved.outlineWidth,
      tokenColor: resolved.outlineColor,
    };
    probe.remove();
    return ring;
  });
}

async function tabThroughStops(page: Page): Promise<Ring[]> {
  const rings: Ring[] = [];
  for (const stop of STOPS) {
    await page.keyboard.press('Tab');
    const role = await page.evaluate(
      () => document.activeElement?.getAttribute('role') ?? null,
    );
    if (stop === 'log') {
      expect(role).toBe('log');
    }
    rings.push(await focusedRing(page));
  }
  return rings;
}

async function open(page: Page) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=a11y-focusringtexttriggers--tab-stops&viewMode=story`,
  );
  await holdMotionStill(page);
  await expect(page.getByRole('log')).toBeVisible();
}

test('each tab stop draws the token ring under keyboard focus', async ({
  page,
}) => {
  await open(page);
  const rings = await tabThroughStops(page);
  rings.forEach((ring, index) => {
    const stop = STOPS[index];
    expect(ring.focusVisible, stop).toBe(true);
    expect(ring.style, stop).toBe('solid');
    expect(ring.width, stop).toBe(ring.tokenWidth);
    expect(ring.color, stop).toBe(ring.tokenColor);
  });
});

test("a theme's focus tokens restyle all three rings", async ({page}) => {
  await open(page);
  await page.evaluate(() => {
    document.documentElement.style.setProperty(
      '--focus-outline-color',
      'rgb(255, 0, 255)',
    );
    document.documentElement.style.setProperty('--focus-outline-width', '4px');
  });
  const rings = await tabThroughStops(page);
  rings.forEach((ring, index) => {
    const stop = STOPS[index];
    expect(ring.color, stop).toBe('rgb(255, 0, 255)');
    expect(ring.width, stop).toBe('4px');
  });
});

test("the log's ring stays inside the area that scrolls it", async ({page}) => {
  await open(page);
  await page.keyboard.press('Tab');
  const geometry = await page.evaluate(() => {
    const log = document.activeElement as HTMLElement;
    const scroller = document.querySelector<HTMLElement>(
      '[data-testid="log-scroller"]',
    );
    if (scroller == null) {
      throw new Error('the story has no log scroller');
    }
    const style = getComputedStyle(log);
    // An outline extends past the border box by offset + width on each side.
    const extent =
      parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth);
    const box = log.getBoundingClientRect();
    const clip = scroller.getBoundingClientRect();
    return {
      role: log.getAttribute('role'),
      focusVisible: log.matches(':focus-visible'),
      extent,
      ring: {
        left: box.left - extent,
        top: box.top - extent,
        right: box.right + extent,
        bottom: box.bottom + extent,
      },
      clip: {
        left: clip.left,
        top: clip.top,
        right: clip.left + scroller.clientWidth,
        bottom: clip.top + scroller.clientHeight,
      },
    };
  });
  expect(geometry.role).toBe('log');
  expect(geometry.focusVisible).toBe(true);
  expect(geometry.extent).toBeLessThanOrEqual(0);
  expect(geometry.ring.left).toBeGreaterThanOrEqual(geometry.clip.left - 0.5);
  expect(geometry.ring.top).toBeGreaterThanOrEqual(geometry.clip.top - 0.5);
  expect(geometry.ring.right).toBeLessThanOrEqual(geometry.clip.right + 0.5);
  expect(geometry.ring.bottom).toBeLessThanOrEqual(geometry.clip.bottom + 0.5);
});
