// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MarksFitTheBox.interaction.browser.spec.ts
 * @input The `Core/Indicator` Sizes and All states stories, with the box and
 *   the circle sized the way a theme sizes them (width and height on the
 *   `checkbox-indicator` and `radio-indicator` targets), in a real browser
 * @output Real-layout proof that the check, the dash and the radio dot keep
 *   their share of the box: at the shipped sizes they draw the shipped pixels;
 *   in a 13px box they sit inside it and centered; the dot is a whole number
 *   of pixels wide and as tall as it is wide (a fractional dot draws as a
 *   rounded square), also when a border is set directly rather than through
 *   the token (component:CheckboxIndicator FR8, component:Indicator FR5)
 * @position Box sizes need a real layout engine; jsdom has none
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

interface Mark {
  kind: string;
  size: string;
  box: number;
  width: number;
  height: number;
  /** The mark sits inside the box's content box. */
  inside: boolean;
  /** Center offset from the box's center, px. */
  dx: number;
  dy: number;
}

/** Every visible mark in the story, measured against its box. */
async function marks(page: Page): Promise<Mark[]> {
  return page.evaluate(() => {
    const out: Mark[] = [];
    const boxes = document.querySelectorAll<HTMLElement>(
      '.astryx-checkbox-indicator, .astryx-radio-indicator',
    );
    for (const box of boxes) {
      const b = box.getBoundingClientRect();
      const border = parseFloat(getComputedStyle(box).borderTopWidth);
      const marksIn = box.querySelectorAll<Element>(
        '.astryx-checkbox-indicator-check, .astryx-checkbox-indicator-dash, .astryx-radio-indicator-dot',
      );
      for (const m of marksIn) {
        if (getComputedStyle(m).display === 'none') {
          continue;
        }
        const r = m.getBoundingClientRect();
        out.push({
          kind: [...m.classList].find(c => c.startsWith('astryx-')) ?? '',
          size: box.dataset.size ?? '',
          box: b.width,
          width: r.width,
          height: r.height,
          inside:
            r.left >= b.left + border - 0.01 &&
            r.right <= b.right - border + 0.01 &&
            r.top >= b.top + border - 0.01 &&
            r.bottom <= b.bottom - border + 0.01,
          dx: (r.left + r.right) / 2 - (b.left + b.right) / 2,
          dy: (r.top + r.bottom) / 2 - (b.top + b.bottom) / 2,
        });
      }
    }
    return out;
  });
}

const SHIPPED: Record<string, Record<string, [number, number]>> = {
  'astryx-checkbox-indicator-check': {sm: [12, 12], md: [14, 14]},
  'astryx-checkbox-indicator-dash': {sm: [10, 2], md: [12, 2]},
  'astryx-radio-indicator-dot': {sm: [8, 8], md: [10, 10]},
};

for (const story of ['core-indicator--sizes', 'core-indicator--all-states']) {
  test.describe(story, () => {
    test('draws the shipped marks at the shipped sizes', async ({page}) => {
      await openStory(page, storybook(), story);
      const found = await marks(page);
      expect(found.length).toBeGreaterThan(0);
      // (Within one layout unit: WebKit lays a share out to 1/64px.)
      for (const m of found) {
        const [w, h] = SHIPPED[m.kind][m.size];
        expect(m.width).toBeCloseTo(w, 1);
        expect(m.height).toBeCloseTo(h, 1);
      }
    });

    test('keeps every mark inside a 13px box and centered', async ({page}) => {
      await openStory(page, storybook(), story);
      await page.addStyleTag({
        content:
          'html .astryx-checkbox-indicator, html .astryx-radio-indicator { width: 13px; height: 13px; }',
      });
      const found = await marks(page);
      expect(found.length).toBeGreaterThan(0);
      for (const m of found) {
        expect(m.box).toBeCloseTo(13, 1);
        expect(m.inside).toBe(true);
        expect(Math.abs(m.dx)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(m.dy)).toBeLessThanOrEqual(0.5);
      }
      for (const dot of found.filter(
        m => m.kind === 'astryx-radio-indicator-dot',
      )) {
        expect(Number.isInteger(dot.width)).toBe(true);
        expect(dot.height).toBe(dot.width);
      }
    });

    test('keeps the dot a whole circle with a border set directly', async ({
      page,
    }) => {
      await openStory(page, storybook(), story);
      await page.addStyleTag({
        content: 'html .astryx-radio-indicator { border-width: 2px; }',
      });
      const dots = (await marks(page)).filter(
        m => m.kind === 'astryx-radio-indicator-dot',
      );
      expect(dots.length).toBeGreaterThan(0);
      for (const dot of dots) {
        expect(Number.isInteger(dot.width)).toBe(true);
        expect(dot.height).toBe(dot.width);
        expect(dot.inside).toBe(true);
      }
    });
  });
}
