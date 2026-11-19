// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RatingForcedColors.interaction.browser.spec.ts
 * @input The built Lab Rating "States" story under Chromium's forced-colors
 *   emulation
 * @output Proofs that the stars keep system colours in a high-contrast
 *   theme: Highlight for a checked star, CanvasText for an empty star, and
 *   GrayText for every star of a disabled rating
 * @position Real-engine layer of Rating; jsdom cannot resolve forced colours
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const STORY = 'lab-rating--states';

/** The computed colour of a system colour keyword on this page. */
async function systemColor(page: Page, keyword: string): Promise<string> {
  return page.evaluate(name => {
    const probe = document.createElement('div');
    probe.style.color = name;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, keyword);
}

/** The computed colour of the outline path of star `index` (from 1). */
async function starColor(
  page: Page,
  group: string,
  index: number,
): Promise<string> {
  return page
    .getByRole('radiogroup', {name: group})
    .getByRole('radio')
    .nth(index - 1)
    .evaluate(star => {
      const path = star.querySelector('path');
      if (path == null) {
        throw new Error('no star path');
      }
      return getComputedStyle(path).color;
    });
}

test('stars keep system colours under forced colours', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'forced-colors emulation');
  await page.emulateMedia({forcedColors: 'active'});
  await openStory(page, storybook(), STORY);

  const highlight = await systemColor(page, 'Highlight');
  const canvasText = await systemColor(page, 'CanvasText');
  const grayText = await systemColor(page, 'GrayText');

  // An enabled rating of 7 of 10: a checked star and an empty star.
  expect(await starColor(page, 'Ten stars', 7)).toBe(highlight);
  expect(await starColor(page, 'Ten stars', 10)).toBe(canvasText);

  // A disabled rating of 2 of 5: filled and empty stars are both GrayText.
  expect(await starColor(page, 'Disabled', 2)).toBe(grayText);
  expect(await starColor(page, 'Disabled', 5)).toBe(grayText);
});
