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
  test('a wheel tick over the row reads no style or layout, with Shift or without', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-carousel--default');
    const scroller = page.getByRole('region').getByRole('group').first();
    // Counts style and layout reads made while the page dispatches a wheel.
    await page.evaluate(() => {
      const probe = window as unknown as {reads: number; isCounting: boolean};
      probe.reads = 0;
      probe.isCounting = false;
      const count = () => {
        if (probe.isCounting) {
          probe.reads += 1;
        }
      };
      const computedStyle = window.getComputedStyle.bind(window);
      window.getComputedStyle = (element, pseudo) => {
        count();
        return computedStyle(element, pseudo);
      };
      const getters: [object, string[]][] = [
        [
          Element.prototype,
          ['scrollWidth', 'scrollHeight', 'scrollLeft', 'scrollTop'],
        ],
        [Element.prototype, ['clientWidth', 'clientHeight']],
        [
          HTMLElement.prototype,
          ['offsetWidth', 'offsetHeight', 'offsetLeft', 'offsetTop'],
        ],
      ];
      for (const [prototype, names] of getters) {
        for (const name of names) {
          const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
          const read = descriptor?.get;
          if (descriptor == null || read == null) {
            continue;
          }
          Object.defineProperty(prototype, name, {
            ...descriptor,
            get(this: Element): number {
              count();
              return read.call(this) as number;
            },
          });
        }
      }
      const rect = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function (this: Element) {
        count();
        return rect.call(this);
      };
      window.addEventListener(
        'wheel',
        () => {
          probe.reads = 0;
          probe.isCounting = true;
        },
        {capture: true},
      );
      window.addEventListener('wheel', () => {
        probe.isCounting = false;
      });
    });
    const reads = async () =>
      page.evaluate(() => (window as unknown as {reads: number}).reads);
    await scroller.hover();
    await page.mouse.wheel(0, 100);
    const plain = await reads();
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, 100);
    await page.keyboard.up('Shift');
    expect({plain, shift: await reads()}).toEqual({plain: 0, shift: 0});
  });
});
