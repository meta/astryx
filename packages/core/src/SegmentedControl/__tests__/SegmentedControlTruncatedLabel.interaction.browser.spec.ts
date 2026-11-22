// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SegmentedControlTruncatedLabel.interaction.browser.spec.ts
 * @input SegmentedControl's "Truncated Labels" story on a left-to-right and a
 *   right-to-left page
 * @output Proves a cut label keeps its start and loses its end: on a
 *   right-to-left page every label (a Latin label reads "Mon…"), on a
 *   left-to-right page every label with no right-to-left letter
 * @position Interaction proof for the cut-label direction
 *   (utils/textDirection.ts truncatedTextStyles)
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const RIGHT_TO_LEFT_LETTER = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

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
          // WebKit gives a letter the ellipsis hides a zero-width rect at the
          // cut, inside the box; Chromium places it outside the box. A shown
          // glyph can overhang its box by about 1 px in WebKit.
          return (
            letter.width > 0 &&
            letter.left >= box.left - 1.5 &&
            letter.right <= box.right + 1.5
          );
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
    id: 'core-segmentedcontrol--truncated-labels',
    selector: '[data-testid="cut-labels"] [role="radio"] > span',
    count: {ltr: 1, rtl: 2},
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
      // A label with a right-to-left letter keeps the page direction, so on
      // a left-to-right page it is cut as before. Only the other labels
      // count there.
      const cut = (await readCutLabels(page, story.selector)).filter(
        label => direction === 'rtl' || !RIGHT_TO_LEFT_LETTER.test(label.label),
      );
      expect(cut.length).toBeGreaterThanOrEqual(story.count[direction]);
      for (const label of cut) {
        expect(label, label.label).toMatchObject({
          startShows: true,
          endShows: false,
        });
      }
    });
  }
}
