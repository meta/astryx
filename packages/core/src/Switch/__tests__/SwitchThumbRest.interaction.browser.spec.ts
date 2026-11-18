// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SwitchThumbRest.interaction.browser.spec.ts
 * @input The `Core/Switch` Default and On stories, as shipped and with the
 *   track and the thumb sized the way a theme sizes them (width and height on
 *   the `switch` and `switch-thumb` targets), under a finger and with a fine
 *   pointer, left to right and right to left
 * @output Real-layout proof that the thumb rests as far from the track's end
 *   as from its top and bottom, at both ends, with either pointer and in
 *   either direction, so a resized switch never stops short or overshoots;
 *   and that the track's size containment leaves its own box as shipped
 *   and the control's box is the track's, the hidden input covering it
 *   (component:Switch FR13, FR14)
 * @position Box sizes need a real layout engine; jsdom has none
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const RESIZED =
  'html .astryx-switch { width: 51px; height: 31px; } html .astryx-switch-thumb { --_switch-thumb-width: 27px; --_switch-thumb-height: 27px; }';

interface Rest {
  track: [number, number];
  /** The control's box (the track's parent) and the hidden input's, px. */
  control: [number, number];
  /** Whether the hidden input covers the whole control. */
  covered: boolean;
  /** Gap from the thumb to the track's start, end and top edges, px. */
  start: number;
  end: number;
  top: number;
  bottom: number;
}

/** The switch's track and its thumb's gaps to each edge, in reading order. */
async function rest(page: Page): Promise<Rest> {
  return page.evaluate(() => {
    const track = document.querySelector<HTMLElement>(
      '#storybook-root .astryx-switch',
    );
    const thumb = track?.querySelector<HTMLElement>('.astryx-switch-thumb');
    if (track == null || thumb == null) throw new Error('no switch');
    const t = track.getBoundingClientRect();
    const h = thumb.getBoundingClientRect();
    const rtl = getComputedStyle(track).direction === 'rtl';
    const box = track.parentElement?.getBoundingClientRect();
    const input = track.parentElement
      ?.querySelector<HTMLElement>('[role="switch"]')
      ?.getBoundingClientRect();
    if (box == null || input == null) throw new Error('no control box');
    const covered =
      input.left <= box.left + 0.5 &&
      input.right >= box.right - 0.5 &&
      input.top <= box.top + 0.5 &&
      input.bottom >= box.bottom - 0.5;
    const left = h.left - t.left;
    const right = t.right - h.right;
    return {
      track: [t.width, t.height],
      control: [box.width, box.height],
      covered,
      start: rtl ? right : left,
      end: rtl ? left : right,
      top: h.top - t.top,
      bottom: t.bottom - h.bottom,
    };
  });
}

/** Opens a story in a writing direction, under a finger or a fine pointer. */
async function open(
  page: Page,
  story: string,
  dir: 'ltr' | 'rtl',
  pointer: 'coarse' | 'fine',
) {
  if (pointer === 'fine') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [
        {name: 'pointer', value: 'fine'},
        {name: 'any-pointer', value: 'fine'},
        {name: 'hover', value: 'hover'},
      ],
    });
  }
  if (dir === 'rtl')
    await page.goto(
      `${storybook()}/iframe.html?id=${story}&viewMode=story&globals=direction:rtl`,
    );
  else await openStory(page, storybook(), story);
  await page.locator('#storybook-root .astryx-switch').waitFor();
  // Under a finger the touch presentation measures and places the thumb.
  await page.waitForTimeout(200);
}

for (const pointer of ['coarse', 'fine'] as const) {
  for (const dir of ['ltr', 'rtl'] as const) {
    test.describe(`${pointer} pointer, ${dir}`, () => {
      test.skip(
        ({browserName}) => pointer === 'fine' && browserName !== 'chromium',
        'a fine pointer is emulated through Chromium only',
      );

      test('the track keeps its shipped box', async ({page}) => {
        await open(page, 'core-switch--default', dir, pointer);
        const r = await rest(page);
        expect(r.track).toEqual([40, 24]);
        expect(r.control).toEqual([40, 24]);
        expect(r.covered).toBe(true);
      });

      for (const [story, at] of [
        ['core-switch--default', 'start'],
        ['core-switch--on', 'end'],
      ] as const) {
        test(`a theme-resized thumb rests at the ${at}, as far from it as from the top`, async ({
          page,
        }) => {
          await open(page, story, dir, pointer);
          await page.addStyleTag({content: RESIZED});
          await page.waitForTimeout(200);
          const r = await rest(page);
          expect(r.track).toEqual([51, 31]);
          // The control's box is the track's: the row widens with it, and
          // the hidden input still covers the whole control.
          expect(r.control).toEqual([51, 31]);
          expect(r.covered).toBe(true);
          expect(r.top).toBeCloseTo(2, 1);
          expect(r.bottom).toBeCloseTo(2, 1);
          expect(r[at]).toBeCloseTo(r.top, 1);
          // The other end holds the rest of the track, never less.
          expect(r[at === 'start' ? 'end' : 'start']).toBeCloseTo(
            51 - 27 - r.top,
            1,
          );
        });
      }
    });
  }
}
