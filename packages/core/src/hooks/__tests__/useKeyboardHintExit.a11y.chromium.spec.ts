// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useKeyboardHintExit.a11y.chromium.spec.ts
 * @input The default useKeyboardHint story in Chromium
 * @output Checks the hint's drawn position and visibility as Escape closes it
 * @position Browser coverage for the keyboard hint's CSS exit
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

async function exitDisplacements(page: Page) {
  await openStory(page, storybook(), 'core-hooks-usekeyboardhint--default');
  const bold = page.getByRole('button', {name: 'Bold', exact: true});
  await page.keyboard.press('Tab');
  await expect(bold).toBeFocused();
  const hint = page.locator('[popover]').filter({hasText: 'to navigate'});
  await expect(hint).toBeVisible();

  const displacements = await hint.evaluateHandle(element => {
    const start = element.getBoundingClientRect();
    const samples: number[] = [];
    function sample() {
      if (element.checkVisibility({opacityProperty: true})) {
        const {x, y} = element.getBoundingClientRect();
        samples.push(Math.hypot(x - start.x, y - start.y));
        requestAnimationFrame(sample);
      }
    }
    element.addEventListener(
      'beforetoggle',
      () => requestAnimationFrame(sample),
      {once: true},
    );
    return samples;
  });
  await page.keyboard.press('Escape');
  await expect(hint).toBeHidden();
  await expect(bold).toBeFocused();
  await expect(bold).toHaveCSS('anchor-name', 'none');
  return displacements.jsonValue();
}

test('the hint fades out where it opened', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'no-preference'});
  const drawn = await exitDisplacements(page);
  expect(drawn.length).toBeGreaterThan(0);
  expect(Math.max(...drawn)).toBeLessThan(1);
});

test('with reduced motion and a fine pointer the hint closes at once', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  expect(await exitDisplacements(page)).toEqual([]);
});
