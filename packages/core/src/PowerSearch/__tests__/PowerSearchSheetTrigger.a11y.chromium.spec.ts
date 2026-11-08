// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/PowerSearch ^apps/storybook/stories/PowerSearch

/**
 * @file PowerSearchSheetTrigger.a11y.chromium.spec.ts
 * @input The `Core/PowerSearch` long-placeholder sheet story in a built
 *   Storybook.
 * @output Real-engine proof that the sheet trigger's placeholder stays inside
 *   the trigger, clear of the result count, and inside the field's border,
 *   across field widths and both writing directions.
 * @position Run with `pnpm test:a11y-contract`. Whether text runs past its
 *   box depends on the width it gets, which only a shipping layout engine can
 *   show.
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

type Direction = 'ltr' | 'rtl';

const STORY = 'core-powersearch--sheet-presentation-long-placeholder';

async function open(page: Page, direction: Direction): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story&globals=direction:${direction}`,
    {waitUntil: 'load'},
  );
  await page
    .locator('button[aria-haspopup="dialog"]')
    .first()
    .waitFor({state: 'visible'});
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

/**
 * Sizes the story's grid column to `width` and returns every way the
 * placeholder's painted text escapes its place: past the trigger button, into
 * the result count, or past the field's border, plus a field whose content is
 * wider than its box. The painted text is the text's own box, cut to the
 * nearest element inside the trigger that clips it.
 */
async function escapesAt(page: Page, width: number): Promise<string[]> {
  return page.evaluate(async width => {
    const host = document.querySelector<HTMLElement>(
      '#storybook-root [style*="grid-template-columns"]',
    );
    if (host == null) {
      throw new Error('No sizing grid in the story');
    }
    host.style.gridTemplateColumns = `minmax(0, ${width}px)`;
    for (let frame = 0; frame < 4; frame++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    const trigger = host.querySelector('button[aria-haspopup="dialog"]');
    const field = host.querySelector('.astryx-power-search');
    const count = [...host.querySelectorAll('span')].find(
      span => span.textContent === '128 results',
    );
    if (trigger == null || field == null) {
      throw new Error('The story has no sheet trigger');
    }
    const walker = document.createTreeWalker(trigger, NodeFilter.SHOW_TEXT);
    let text: Node | null = walker.nextNode();
    while (text != null && (text.textContent ?? '').trim() === '') {
      text = walker.nextNode();
    }
    if (text == null) {
      throw new Error('The trigger shows no placeholder');
    }
    const range = document.createRange();
    range.selectNodeContents(text);
    const r = range.getBoundingClientRect();
    let left = r.left;
    let right = r.right;
    for (
      let el = text.parentElement;
      el != null && el !== trigger.parentElement;
      el = el.parentElement
    ) {
      if (['hidden', 'clip'].includes(getComputedStyle(el).overflowX)) {
        const c = el.getBoundingClientRect();
        left = Math.max(left, c.left);
        right = Math.min(right, c.right);
      }
    }
    const found: string[] = [];
    const t = trigger.getBoundingClientRect();
    const f = field.getBoundingClientRect();
    if (left < t.left - 0.5 || right > t.right + 0.5) {
      found.push(`${width}px: the placeholder runs past the trigger`);
    }
    if (left < f.left - 0.5 || right > f.right + 0.5) {
      found.push(`${width}px: the placeholder runs past the field`);
    }
    if (count != null) {
      const c = count.getBoundingClientRect();
      if (right > c.left + 0.5 && left < c.right - 0.5) {
        found.push(`${width}px: the placeholder runs under the result count`);
      }
    }
    if (field.scrollWidth > field.clientWidth + 1) {
      found.push(
        `${width}px: the field's content is ${field.scrollWidth}px in a ${field.clientWidth}px box`,
      );
    }
    return found;
  }, width);
}

for (const direction of ['ltr', 'rtl'] as const) {
  test.describe(`${direction}`, () => {
    test('a long placeholder stays inside the trigger and clear of the result count', async ({
      page,
    }) => {
      await open(page, direction);
      const found: string[] = [];
      for (let width = 160; width <= 400; width += 20) {
        found.push(...(await escapesAt(page, width)));
      }
      expect(found).toEqual([]);
    });

    test('a narrowed placeholder ends in an ellipsis', async ({page}) => {
      await open(page, direction);
      await escapesAt(page, 200);
      // The element that holds the placeholder's text: it clips the text and
      // draws the ellipsis.
      const truncation = await page
        .locator('button[aria-haspopup="dialog"]')
        .first()
        .evaluate(trigger => {
          const walker = document.createTreeWalker(
            trigger,
            NodeFilter.SHOW_TEXT,
          );
          let text: Node | null = walker.nextNode();
          while (text != null && (text.textContent ?? '').trim() === '') {
            text = walker.nextNode();
          }
          const holder = text?.parentElement ?? trigger;
          const style = getComputedStyle(holder);
          return {
            clipped:
              holder.scrollWidth > holder.clientWidth &&
              ['hidden', 'clip'].includes(style.overflowX),
            textOverflow: style.textOverflow,
          };
        });
      expect(truncation).toEqual({clipped: true, textOverflow: 'ellipsis'});
    });
  });
}
