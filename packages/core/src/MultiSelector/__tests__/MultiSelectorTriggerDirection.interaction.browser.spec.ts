// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MultiSelectorTriggerDirection.interaction.browser.spec.ts
 * @input The MultiSelector "Mixed Direction Labels" stories (en and he-IL) on
 *   a left-to-right and a right-to-left page
 * @output Proves each label and the "+N" count in the labels trigger lays out
 *   in its own direction: the items follow the list order along the page's
 *   direction, and the count keeps its locale's form ("+2" under en, the
 *   right-to-left form under he-IL)
 * @position Interaction proof for MultiSelector's isolated trigger labels
 *   (utils/textDirection.ts isolatedText)
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

async function readTrigger(page: Page) {
  const items = page.getByRole('combobox').locator('span[dir]');
  await expect(items).toHaveText(['Design', 'עיצוב', 'שיווק', '+2']);
  return items.evaluateAll(spans =>
    spans.map(span => {
      const text = span.firstChild as Text;
      const range = document.createRange();
      const charLefts: number[] = [];
      for (let i = 0; i < (text.textContent ?? '').length; i++) {
        range.setStart(text, i);
        range.setEnd(text, i + 1);
        charLefts.push(range.getBoundingClientRect().left);
      }
      return {left: span.getBoundingClientRect().left, charLefts};
    }),
  );
}

for (const direction of ['ltr', 'rtl'] as const) {
  test(`the labels trigger keeps each item in its own order on a ${direction} page`, async ({
    page,
  }) => {
    await page.goto(
      `${storybook()}/iframe.html?id=core-multiselector--mixed-direction-labels&viewMode=story&globals=direction:${direction}`,
    );
    const layout = await readTrigger(page);
    const lefts = layout.map(item => item.left);
    // The list order runs along the page's direction.
    const ordered = [...lefts].sort((a, b) =>
      direction === 'ltr' ? a - b : b - a,
    );
    expect(lefts).toEqual(ordered);
    // Under en, "+2" lays out left to right: the sign before the digit.
    const count = layout[3].charLefts;
    expect(count[0]).toBeLessThan(count[1]);
  });
}

test('under a right-to-left locale the count keeps its right-to-left form', async ({
  page,
}) => {
  await page.goto(
    `${storybook()}/iframe.html?id=core-multiselector--mixed-direction-labels-hebrew&viewMode=story&globals=direction:rtl`,
  );
  const layout = await readTrigger(page);
  const lefts = layout.map(item => item.left);
  expect(lefts).toEqual([...lefts].sort((a, b) => b - a));
  // The count reads right to left: the sign sits to the right of the digit.
  const count = layout[3].charLefts;
  expect(count[0]).toBeGreaterThan(count[1]);
});
