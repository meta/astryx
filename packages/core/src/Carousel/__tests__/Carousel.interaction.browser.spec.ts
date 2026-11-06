// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Carousel.interaction.browser.spec.ts
 * @input The built Carousel stories and a real mouse wheel (Chromium CDP /
 *   WebKit's injected events) through the interaction harness
 * @output Proof that Shift and one mouse wheel notch scroll the row once, by
 *   the notch's delta. Carousel prevents the wheel's default, so the
 *   browser's own horizontal scroll adds nothing. Firefox shows that second
 *   scroll when the default runs
 * @position Browser proof for Carousel, run by `pnpm test:interaction`
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

test.describe('with a mouse', () => {
  test.use({hasTouch: false, isMobile: false});

  test('Shift and a wheel notch scroll the row by the notch, once', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-carousel--default');
    const scroller = page.getByRole('region').getByRole('group').first();
    // The window hears the wheel last, after every listener in the page.
    const wheel = page.evaluate(
      async () =>
        new Promise<{notch: number; isPrevented: boolean}>(resolve => {
          window.addEventListener(
            'wheel',
            event =>
              resolve({
                notch: event.deltaY,
                isPrevented: event.defaultPrevented,
              }),
            {once: true},
          );
        }),
    );
    await scroller.hover();
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, 100);
    await page.keyboard.up('Shift');
    // The row's offset once two reads a while apart agree.
    let last = -1;
    await expect
      .poll(
        async () => {
          const at = await scroller.evaluate(el => el.scrollLeft);
          const isStill = at === last;
          last = at;
          return isStill && at > 0;
        },
        {intervals: [200]},
      )
      .toBe(true);
    const {notch, isPrevented} = await wheel;
    expect(isPrevented).toBe(true);
    expect(last).toBeCloseTo(notch, 0);
  });
});
