// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Table/|packages/core/src/utils/focusOutline|apps/storybook/stories/Table(Tree)?\.stories)

/**
 * @file TableFocusRing.a11y.chromium.spec.ts
 * @input Built Table and TableTree stories and real Chromium keyboard input
 * @output Evidence that Table's own tab stops (the scroll wrapper in a Card,
 *   the tree expander and expand-all toggle at compact density) paint the
 *   shared focus ring, and that no clipping ancestor cuts it off
 * @position Real-engine proof for the focus ring; jsdom cannot match
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

interface RingFit {
  readonly focusVisible: boolean;
  readonly outlineStyle: string;
  readonly outlineWidth: number;
  /** Pixels of the ring each clipping ancestor cuts off, by side. */
  readonly clipped: ReadonlyArray<string>;
}

/** Tab until `selector` holds focus, then measure its ring against every clip. */
async function tabToAndMeasure(
  page: Page,
  selector: string,
  maxTabs = 20,
): Promise<RingFit> {
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press('Tab');
    const reached = await page.evaluate(
      sel => document.activeElement?.matches(sel) ?? false,
      selector,
    );
    if (reached) {
      break;
    }
  }
  return page.evaluate(sel => {
    const el = document.activeElement as HTMLElement | null;
    if (el == null || !el.matches(sel)) {
      throw new Error(`Tab never reached ${sel}`);
    }
    const style = getComputedStyle(el);
    const width = parseFloat(style.outlineWidth) || 0;
    const offset = parseFloat(style.outlineOffset) || 0;
    const box = el.getBoundingClientRect();
    const reach = width + offset;
    const ring = {
      top: box.top - reach,
      right: box.right + reach,
      bottom: box.bottom + reach,
      left: box.left - reach,
    };
    const clipped: string[] = [];
    for (
      let node = el.parentElement;
      node != null && node !== document.body;
      node = node.parentElement
    ) {
      const ancestor = getComputedStyle(node);
      if (
        ancestor.overflowX === 'visible' &&
        ancestor.overflowY === 'visible'
      ) {
        continue;
      }
      const rect = node.getBoundingClientRect();
      // Content is clipped at the padding box, inside the borders.
      const clip = {
        top: rect.top + parseFloat(ancestor.borderTopWidth),
        right: rect.right - parseFloat(ancestor.borderRightWidth),
        bottom: rect.bottom - parseFloat(ancestor.borderBottomWidth),
        left: rect.left + parseFloat(ancestor.borderLeftWidth),
      };
      const cut = {
        top: clip.top - ring.top,
        right: ring.right - clip.right,
        bottom: ring.bottom - clip.bottom,
        left: clip.left - ring.left,
      };
      for (const [side, px] of Object.entries(cut)) {
        // Sub-pixel layout rounding is not a visible cut.
        if (px > 0.5) {
          clipped.push(
            `${node.tagName.toLowerCase()}.${side}=${px.toFixed(1)}px`,
          );
        }
      }
    }
    return {
      focusVisible: el.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: width,
      clipped,
    };
  }, selector);
}

async function mount(page: Page, story: string) {
  await page.goto(`${storybook.origin}/iframe.html?id=${story}&viewMode=story`);
  await expect(page.locator('#storybook-root table')).toBeVisible();
}

test.describe('Table focus ring (Chromium)', () => {
  test('the scroll wrapper of a table in a bordered Card paints the whole shared ring', async ({
    page,
  }) => {
    await page.setViewportSize({width: 480, height: 800});
    await mount(page, 'core-table--responsive-scroll-in-card');
    const fit = await tabToAndMeasure(page, '#storybook-root [tabindex="0"]');
    expect(fit.focusVisible).toBe(true);
    expect(fit.outlineStyle).toBe('solid');
    expect(fit.outlineWidth).toBeGreaterThan(0);
    expect(fit.clipped).toEqual([]);
  });

  test('the tree expander and expand-all toggle at compact density paint the whole shared ring', async ({
    page,
  }) => {
    await mount(page, 'core-tabletree--compact-density');
    for (const selector of [
      '#storybook-root thead button',
      '#storybook-root tbody tr button[aria-expanded]',
    ]) {
      const fit = await tabToAndMeasure(page, selector);
      expect(fit.focusVisible, selector).toBe(true);
      expect(fit.outlineStyle, selector).toBe('solid');
      expect(fit.outlineWidth, selector).toBeGreaterThan(0);
      expect(fit.clipped, selector).toEqual([]);
    }
  });
});
