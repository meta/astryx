// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TaskCheckboxCentered.interaction.browser.spec.ts
 * @input The `Core/Markdown` Default story's task list, as shipped and with
 *   a theme-sized checkbox box (width and height on `checkbox-indicator`)
 * @output Real-layout proof that a task item's checkbox is centered on the
 *   item's first line at whatever size the box draws (component:List)
 * @position Box sizes need a real layout engine; jsdom has none
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

/** The first task's checkbox box and its line, px. */
async function task(page: Page) {
  return page.evaluate(() => {
    const box = document.querySelector<HTMLElement>(
      '#storybook-root li .astryx-checkbox-indicator',
    );
    const li = box?.closest('li');
    if (box == null || li == null) throw new Error('no task item');
    const b = box.getBoundingClientRect();
    const l = li.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(li).lineHeight);
    return {
      size: b.height,
      // The box's center against the first line's center.
      offset: b.top + b.height / 2 - (l.top + lh / 2),
    };
  });
}

for (const [label, css] of [
  ['shipped', ''],
  [
    'theme-sized',
    'html .astryx-checkbox-indicator { width: 13px; height: 13px; }',
  ],
  [
    'theme-sized, larger',
    'html .astryx-checkbox-indicator { width: 26px; height: 26px; }',
  ],
] as const) {
  test(`a task's checkbox is centered on its first line (${label})`, async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-markdown--default');
    if (css) await page.addStyleTag({content: css});
    const t = await task(page);
    if (css) expect(t.size).toBeCloseTo(css.includes('26px') ? 26 : 13, 0);
    expect(Math.abs(t.offset)).toBeLessThanOrEqual(1);
  });
}
