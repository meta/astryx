// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SlotFollowsMark.interaction.browser.spec.ts
 * @input The CheckboxInput and RadioList default stories, with the box and
 *   the circle sized the way a theme sizes them (width and height on the
 *   `checkbox-indicator` and `radio-indicator` targets), in a real browser
 * @output Real-layout proof that the slot around the mark is as big as the
 *   mark (the label follows it), that the hidden input keeps a hit area of at
 *   least 24px centered on the mark, and that the focus ring paints on the
 *   visible mark (component:CheckboxInput FR12, component:RadioListItem FR9)
 * @position Box sizes need a real layout engine; jsdom has none
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const SIZED =
  'html .astryx-checkbox-indicator, html .astryx-radio-indicator { width: 13px; height: 13px; }';

/** Each control's input, slot and mark, measured. */
async function controls(page: Page) {
  return page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLInputElement>(
        'input[type=checkbox], input[type=radio]',
      ),
    ].map(input => {
      const slot = input.parentElement as HTMLElement;
      const mark = slot.querySelector(
        '.astryx-checkbox-indicator, .astryx-radio-indicator',
      ) as HTMLElement;
      const i = input.getBoundingClientRect();
      const s = slot.getBoundingClientRect();
      const m = mark.getBoundingClientRect();
      return {
        slot: [s.width, s.height],
        mark: [m.width, m.height],
        hit: [i.width, i.height],
        dx: (i.left + i.right) / 2 - (m.left + m.right) / 2,
        dy: (i.top + i.bottom) / 2 - (m.top + m.bottom) / 2,
      };
    }),
  );
}

for (const story of [
  'core-checkboxinput--default',
  'core-radiolist--default',
]) {
  test.describe(story, () => {
    test('a theme-sized mark sets the slot; the hit area stays 24px, centered', async ({
      page,
    }) => {
      await openStory(page, storybook(), story);
      await page.addStyleTag({content: SIZED});
      const found = await controls(page);
      expect(found.length).toBeGreaterThan(0);
      for (const c of found) {
        expect(c.mark).toEqual([13, 13]);
        expect(c.slot).toEqual(c.mark);
        expect(c.hit[0]).toBeGreaterThanOrEqual(24);
        expect(c.hit[1]).toBeGreaterThanOrEqual(24);
        expect(Math.abs(c.dx)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(c.dy)).toBeLessThanOrEqual(0.5);
      }
    });

    test('the focus ring paints on the visible mark', async ({page}) => {
      await openStory(page, storybook(), story);
      await page.addStyleTag({content: SIZED});
      await page.keyboard.press('Tab');
      const ring = await page.evaluate(() => {
        const input = document.activeElement as HTMLElement;
        const mark = input.parentElement?.querySelector(
          '.astryx-checkbox-indicator, .astryx-radio-indicator',
        ) as HTMLElement;
        const cs = getComputedStyle(mark);
        return {style: cs.outlineStyle, width: parseFloat(cs.outlineWidth)};
      });
      expect(ring.style).not.toBe('none');
      expect(ring.width).toBeGreaterThan(0);
    });
  });
}
