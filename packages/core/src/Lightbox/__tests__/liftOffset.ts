// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file liftOffset.ts
 * @input A Lightbox photo's locator in an interaction spec
 * @output Exports `recordLiftOffset`, which records the photo's horizontal
 *   offset as the next touch lifts, read in the page at the lift
 * @position A helper for the Lightbox interaction specs. LightboxZoom and
 *   LightboxZoomModes use it to judge a flick's coast from the lift.
 */

import type {Locator} from '@astryxdesign/a11y-spec/playwright';

/**
 * Records the photo's horizontal offset as the next touch lifts, from a
 * capture listener in the page, and returns a reader for it. A read from the
 * runner after the lift comes a round trip late, and a flicked photo coasts
 * on in that time. A read after the last move holds the lift back by that
 * round trip instead. Past the 40 ms stillness interval, the page then reads
 * a resting finger.
 */
export async function recordLiftOffset(
  photo: Locator,
): Promise<() => Promise<number>> {
  await photo.evaluate(img => {
    const record = window as unknown as {__liftOffset?: number};
    delete record.__liftOffset;
    document.addEventListener(
      'touchend',
      () => {
        const {translate} = getComputedStyle(img);
        record.__liftOffset =
          translate === 'none' ? 0 : parseFloat(translate.split(' ')[0]);
      },
      {capture: true, once: true},
    );
  });
  return async () =>
    photo.evaluate(
      () =>
        (window as unknown as {__liftOffset?: number}).__liftOffset ??
        Number.NaN,
    );
}
