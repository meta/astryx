// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TruncatedLabelDirection.interaction.browser.spec.ts
 * @input Text's "Truncated Mixed Direction" story and SegmentedControl's
 *   "Truncated Labels" story on a left-to-right and a right-to-left page
 * @output Proves a cut label keeps its start and loses its end in both page
 *   directions: a Latin label reads "Mon…", a right-to-left label is cut at
 *   its own end
 * @position Interaction proof for the cut-label direction
 *   (utils/textDirection.ts truncatedTextStyles)
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

/** For each cut label: whether its first and its last letter show. */
async function readCutLabels(page: Page, selector: string) {
  const labels = page.locator(selector);
  await expect(labels.first()).toBeVisible();
  return labels.evaluateAll(elements =>
    elements
      .filter(
        element =>
          element.firstChild instanceof Text &&
          element.scrollWidth > element.clientWidth,
      )
      .map(element => {
        const box = element.getBoundingClientRect();
        const text = element.firstChild as Text;
        const shows = (offset: number) => {
          const range = document.createRange();
          range.setStart(text, offset);
          range.setEnd(text, offset + 1);
          const letter = range.getBoundingClientRect();
          return letter.left >= box.left - 0.5 && letter.right <= box.right + 0.5;
        };
        const content = text.data;
        return {
          label: content,
          startShows: shows(0),
          endShows: shows(content.length - 1),
        };
      }),
  );
}

const stories = [
  {
    id: 'core-text--truncated-mixed-direction',
    selector: '[data-testid="cut-labels"] > *',
    count: 5,
  },
  {
    id: 'core-segmentedcontrol--truncated-labels',
    selector: '[data-testid="cut-labels"] [role="radio"] > span',
    count: 2,
  },
];

for (const story of stories) {
  for (const direction of ['ltr', 'rtl'] as const) {
    test(`${story.id}: a cut label keeps its start on a ${direction} page`, async ({
      page,
    }) => {
      await page.goto(
        `${storybook()}/iframe.html?id=${story.id}&viewMode=story&globals=direction:${direction}`,
      );
      const cut = await readCutLabels(page, story.selector);
      expect(cut.length).toBeGreaterThanOrEqual(story.count);
      for (const label of cut) {
        expect(label, label.label).toMatchObject({
          startShows: true,
          endShows: false,
        });
      }
    });
  }
}
