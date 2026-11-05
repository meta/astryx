// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/(Carousel|CodeBlock)/|packages/core/src/utils/focusOutline|apps/storybook/stories/(Carousel|CodeBlock)\.stories)

/**
 * @file CarouselFocusRing.a11y.chromium.spec.ts
 * @input Built Carousel and CodeBlock stories and real Chromium keyboard input
 * @output Evidence that the Carousel scroller's and the CodeBlock viewport's
 *   keyboard rings paint whole: no mask erases the Carousel ring, at rest or
 *   mid-scroll, and no clipping ancestor cuts either ring
 * @position Real-engine proof for the focus rings; jsdom cannot match
 *   :focus-visible or paint
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
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

interface RingPaint {
  readonly focusVisible: boolean;
  /** The element that paints the ring: the focused one or an ancestor. */
  readonly painter: string;
  readonly outlineStyle: string;
  readonly outlineWidth: number;
  /** A mask on the painter or between it and the page erases the ring. */
  readonly masked: ReadonlyArray<string>;
  /** Pixels of the ring each clipping ancestor cuts off, by side. */
  readonly clipped: ReadonlyArray<string>;
}

async function tabTo(page: Page, selector: string, maxTabs = 20) {
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press('Tab');
    if (
      await page.evaluate(
        sel => document.activeElement?.matches(sel) ?? false,
        selector,
      )
    ) {
      return;
    }
  }
  throw new Error(`Tab never reached ${selector}`);
}

/** Find which element paints the focused element's ring, and measure it. */
async function measureRing(page: Page): Promise<RingPaint> {
  return page.evaluate(() => {
    const focused = document.activeElement as HTMLElement;
    let painter: HTMLElement | null = focused;
    while (
      painter != null &&
      getComputedStyle(painter).outlineStyle === 'none'
    ) {
      painter = painter.parentElement;
    }
    if (painter == null) {
      return {
        focusVisible: focused.matches(':focus-visible'),
        painter: 'none',
        outlineStyle: 'none',
        outlineWidth: 0,
        masked: [],
        clipped: [],
      };
    }
    const style = getComputedStyle(painter);
    const width = parseFloat(style.outlineWidth) || 0;
    const offset = parseFloat(style.outlineOffset) || 0;
    const box = painter.getBoundingClientRect();
    const reach = width + offset;
    const ring = {
      top: box.top - reach,
      right: box.right + reach,
      bottom: box.bottom + reach,
      left: box.left - reach,
    };
    const masked: string[] = [];
    const clipped: string[] = [];
    for (
      let node: HTMLElement | null = painter;
      node != null && node !== document.body;
      node = node.parentElement
    ) {
      const nodeStyle = getComputedStyle(node);
      const mask =
        nodeStyle.maskImage || nodeStyle.getPropertyValue('-webkit-mask-image');
      if (mask && mask !== 'none') {
        masked.push(node.className.split(' ')[0] || node.tagName);
      }
      if (
        node === painter ||
        (nodeStyle.overflowX === 'visible' && nodeStyle.overflowY === 'visible')
      ) {
        continue;
      }
      const rect = node.getBoundingClientRect();
      const margin =
        nodeStyle.overflowX === 'clip'
          ? parseFloat(nodeStyle.overflowClipMargin) || 0
          : 0;
      const clip = {
        top: rect.top + parseFloat(nodeStyle.borderTopWidth) - margin,
        right: rect.right - parseFloat(nodeStyle.borderRightWidth) + margin,
        bottom: rect.bottom - parseFloat(nodeStyle.borderBottomWidth) + margin,
        left: rect.left + parseFloat(nodeStyle.borderLeftWidth) - margin,
      };
      const cut = {
        top: clip.top - ring.top,
        right: ring.right - clip.right,
        bottom: ring.bottom - clip.bottom,
        left: clip.left - ring.left,
      };
      for (const [side, px] of Object.entries(cut)) {
        if (px > 0.5) {
          clipped.push(
            `${node.tagName.toLowerCase()}.${side}=${px.toFixed(1)}px`,
          );
        }
      }
    }
    return {
      focusVisible: focused.matches(':focus-visible'),
      painter: painter === focused ? 'self' : painter.className.split(' ')[0],
      outlineStyle: style.outlineStyle,
      outlineWidth: width,
      masked,
      clipped,
    };
  });
}

function expectWholeRing(paint: RingPaint, label: string) {
  expect(paint.focusVisible, label).toBe(true);
  expect(paint.outlineStyle, label).toBe('solid');
  expect(paint.outlineWidth, label).toBeGreaterThan(0);
  expect(paint.masked, label).toEqual([]);
  expect(paint.clipped, label).toEqual([]);
}

test.describe('Carousel and CodeBlock focus rings (Chromium)', () => {
  test('an overflowing Carousel paints the whole ring around its scroller, at rest and mid-scroll', async ({
    page,
  }) => {
    await page.setViewportSize({width: 640, height: 600});
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-carousel--default&viewMode=story`,
    );
    const scroller = page.locator('#storybook-root .astryx-carousel-scroller');
    await expect(scroller).toBeVisible();
    await tabTo(page, '#storybook-root .astryx-carousel-scroller');
    expectWholeRing(await measureRing(page), 'at rest');

    await scroller.evaluate(el => {
      el.style.scrollBehavior = 'auto';
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    });
    await page.waitForTimeout(100);
    expectWholeRing(await measureRing(page), 'mid-scroll');
  });

  test('an overflowing CodeBlock paints the whole ring around its viewport', async ({
    page,
  }) => {
    await page.setViewportSize({width: 480, height: 800});
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-codeblock--diff-long-lines&viewMode=story`,
    );
    await expect(
      page.locator('#storybook-root pre, #storybook-root code').first(),
    ).toBeVisible();
    await tabTo(page, '#storybook-root [tabindex="0"]');
    expectWholeRing(await measureRing(page), 'viewport');
  });
});
